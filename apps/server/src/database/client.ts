import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { env } from '@/config/env';
import { DEFAULT_TIMEZONE, getDayKey, getMonthKey, getWeekKey, resolveTimezone } from '@/utils/time';

interface TableInfoRow {
  name: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
}

interface IndexListRow {
  name: string;
  unique: number;
}

interface IndexInfoRow {
  name: string;
  seqno: number;
}

interface UserTimezoneRow {
  userId: string;
  timezone: string;
}

interface CommitActivityRow {
  repo_id: number;
  user_id: string;
  commit_time: string;
}

interface ActivityBucketRecord {
  repoId: number;
  userId: string;
  bucketLabel: string;
  commitCount: number;
}

const LATEST_SCHEMA_VERSION = 2;
const databaseDirectory = path.dirname(env.databasePath);

fs.mkdirSync(databaseDirectory, { recursive: true });

export const db = new Database(env.databasePath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

initializeDatabase();

/* 初始化数据库结构，并按版本执行一次性迁移。 */
function initializeDatabase(): void {
  createBaseSchema();
  runSchemaMigrations();
  createIndexes();
}

/* 创建基础表结构，新库直接落到最新定义。 */
function createBaseSchema(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      user_id TEXT PRIMARY KEY,
      github_username TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sync_configs (
      user_id TEXT PRIMARY KEY,
      github_token_encrypted TEXT,
      email_aliases_json TEXT NOT NULL DEFAULT '[]',
      include_private_repos INTEGER NOT NULL DEFAULT 0,
      sync_interval_minutes INTEGER NOT NULL DEFAULT 720,
      default_time_range TEXT NOT NULL DEFAULT '30d',
      timezone TEXT NOT NULL DEFAULT 'Asia/Shanghai',
      csrf_token TEXT NOT NULL,
      last_synced_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS author_identities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      canonical_author_id TEXT NOT NULL,
      github_login TEXT NOT NULL DEFAULT '',
      author_email TEXT NOT NULL DEFAULT '',
      author_name TEXT NOT NULL DEFAULT '',
      is_primary INTEGER NOT NULL DEFAULT 0,
      UNIQUE(user_id, canonical_author_id, github_login, author_email)
    );

    CREATE TABLE IF NOT EXISTS repos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      github_repo_id INTEGER NOT NULL,
      owner_login TEXT NOT NULL,
      name TEXT NOT NULL,
      full_name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      is_private INTEGER NOT NULL DEFAULT 0,
      default_branch TEXT NOT NULL DEFAULT 'main',
      html_url TEXT NOT NULL,
      stars_count INTEGER NOT NULL DEFAULT 0,
      forks_count INTEGER NOT NULL DEFAULT 0,
      main_language TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      pushed_at TEXT,
      UNIQUE(user_id, github_repo_id)
    );

    CREATE TABLE IF NOT EXISTS repo_topics (
      repo_id INTEGER NOT NULL,
      topic TEXT NOT NULL,
      FOREIGN KEY (repo_id) REFERENCES repos (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS repo_languages (
      repo_id INTEGER NOT NULL,
      language TEXT NOT NULL,
      bytes INTEGER NOT NULL,
      percentage REAL NOT NULL,
      FOREIGN KEY (repo_id) REFERENCES repos (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS repo_files_snapshot (
      repo_id INTEGER NOT NULL,
      file_path TEXT NOT NULL,
      content TEXT NOT NULL,
      FOREIGN KEY (repo_id) REFERENCES repos (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS commits (
      repo_id INTEGER NOT NULL,
      sha TEXT NOT NULL,
      user_id TEXT NOT NULL,
      author_login TEXT,
      author_name TEXT NOT NULL DEFAULT '',
      author_email TEXT NOT NULL DEFAULT '',
      canonical_author_id TEXT NOT NULL,
      commit_time TEXT NOT NULL,
      message TEXT NOT NULL DEFAULT '',
      is_merge_commit INTEGER NOT NULL DEFAULT 0,
      is_bot INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (repo_id, sha),
      FOREIGN KEY (repo_id) REFERENCES repos (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS repo_activity_daily (
      repo_id INTEGER NOT NULL,
      user_id TEXT NOT NULL,
      activity_date TEXT NOT NULL,
      commit_count INTEGER NOT NULL,
      FOREIGN KEY (repo_id) REFERENCES repos (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS repo_activity_weekly (
      repo_id INTEGER NOT NULL,
      user_id TEXT NOT NULL,
      week_start TEXT NOT NULL,
      commit_count INTEGER NOT NULL,
      FOREIGN KEY (repo_id) REFERENCES repos (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS repo_activity_monthly (
      repo_id INTEGER NOT NULL,
      user_id TEXT NOT NULL,
      month_key TEXT NOT NULL,
      commit_count INTEGER NOT NULL,
      FOREIGN KEY (repo_id) REFERENCES repos (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS repo_traffic_daily (
      repo_id INTEGER NOT NULL,
      user_id TEXT NOT NULL,
      traffic_date TEXT NOT NULL,
      views_count INTEGER NOT NULL DEFAULT 0,
      unique_visitors INTEGER NOT NULL DEFAULT 0,
      clones_count INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (repo_id) REFERENCES repos (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS repo_stack_tags (
      repo_id INTEGER NOT NULL,
      tag TEXT NOT NULL,
      confidence REAL NOT NULL,
      source TEXT NOT NULL,
      FOREIGN KEY (repo_id) REFERENCES repos (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS repo_scores (
      repo_id INTEGER PRIMARY KEY,
      overall_score REAL NOT NULL,
      activity_score REAL NOT NULL,
      traffic_score REAL NOT NULL,
      popularity_score REAL NOT NULL,
      recency_score REAL NOT NULL,
      FOREIGN KEY (repo_id) REFERENCES repos (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS insight_cards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      level TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sync_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      scope TEXT NOT NULL,
      status TEXT NOT NULL,
      message TEXT NOT NULL,
      started_at TEXT NOT NULL,
      finished_at TEXT
    );
  `);
}

/* 按 schema version 执行一次性迁移，避免每次重启重复扫描全表。 */
function runSchemaMigrations(): void {
  const currentVersion = getSchemaVersion();

  if (currentVersion < 1) {
    migrateAuthorIdentitiesTable();
    migrateCommitsTable();
    setSchemaVersion(1);
  }

  if (currentVersion < 2) {
    normalizeRedundantData();
    setSchemaVersion(2);
  }

  if (getSchemaVersion() < LATEST_SCHEMA_VERSION) {
    setSchemaVersion(LATEST_SCHEMA_VERSION);
  }
}

/* 创建运行期索引。唯一索引依赖前置迁移先清理历史重复行。 */
function createIndexes(): void {
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_repos_user ON repos (user_id);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_repo_topics_repo_topic ON repo_topics (repo_id, topic);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_repo_languages_repo_language ON repo_languages (repo_id, language);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_repo_files_snapshot_repo_file ON repo_files_snapshot (repo_id, file_path);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_repo_activity_daily_repo_date ON repo_activity_daily (repo_id, activity_date);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_repo_activity_weekly_repo_week ON repo_activity_weekly (repo_id, week_start);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_repo_activity_monthly_repo_month ON repo_activity_monthly (repo_id, month_key);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_repo_traffic_daily_repo_date ON repo_traffic_daily (repo_id, traffic_date);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_repo_stack_tags_repo_tag ON repo_stack_tags (repo_id, tag);
    CREATE INDEX IF NOT EXISTS idx_commits_repo_time ON commits (repo_id, commit_time);
    CREATE INDEX IF NOT EXISTS idx_commits_user ON commits (user_id, canonical_author_id);
    CREATE INDEX IF NOT EXISTS idx_author_identities_user ON author_identities (user_id, canonical_author_id);
    CREATE INDEX IF NOT EXISTS idx_daily_repo_date ON repo_activity_daily (repo_id, activity_date);
    CREATE INDEX IF NOT EXISTS idx_traffic_repo_date ON repo_traffic_daily (repo_id, traffic_date);
  `);
}

function migrateAuthorIdentitiesTable(): void {
  const columns = getTableInfo('author_identities');

  if (columns.length === 0) {
    return;
  }

  const githubLoginColumn = columns.find((item) => item.name === 'github_login');
  const authorEmailColumn = columns.find((item) => item.name === 'author_email');
  const hasExpectedUniqueConstraint = hasUniqueIndex('author_identities', [
    'user_id',
    'canonical_author_id',
    'github_login',
    'author_email'
  ]);

  const needsMigration =
    !githubLoginColumn ||
    githubLoginColumn.notnull !== 1 ||
    normalizeDefaultValue(githubLoginColumn.dflt_value) !== '' ||
    !authorEmailColumn ||
    authorEmailColumn.notnull !== 1 ||
    normalizeDefaultValue(authorEmailColumn.dflt_value) !== '' ||
    !hasExpectedUniqueConstraint;

  if (!needsMigration) {
    return;
  }

  db.transaction(() => {
    db.exec(`
      CREATE TABLE author_identities_migrated (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        canonical_author_id TEXT NOT NULL,
        github_login TEXT NOT NULL DEFAULT '',
        author_email TEXT NOT NULL DEFAULT '',
        author_name TEXT NOT NULL DEFAULT '',
        is_primary INTEGER NOT NULL DEFAULT 0,
        UNIQUE(user_id, canonical_author_id, github_login, author_email)
      );

      INSERT INTO author_identities_migrated (
        user_id,
        canonical_author_id,
        github_login,
        author_email,
        author_name,
        is_primary
      )
      SELECT
        user_id,
        canonical_author_id,
        COALESCE(github_login, ''),
        COALESCE(author_email, ''),
        MAX(COALESCE(author_name, '')),
        MAX(is_primary)
      FROM author_identities
      GROUP BY
        user_id,
        canonical_author_id,
        COALESCE(github_login, ''),
        COALESCE(author_email, '');

      DROP TABLE author_identities;
      ALTER TABLE author_identities_migrated RENAME TO author_identities;
    `);
  })();
}

function migrateCommitsTable(): void {
  const columns = getTableInfo('commits');

  if (columns.length === 0) {
    return;
  }

  const repoIdColumn = columns.find((item) => item.name === 'repo_id');
  const shaColumn = columns.find((item) => item.name === 'sha');
  const hasCompositePrimaryKey =
    repoIdColumn?.pk === 1 &&
    shaColumn?.pk === 2 &&
    shaColumn.notnull === 1;

  if (hasCompositePrimaryKey) {
    return;
  }

  db.transaction(() => {
    db.exec(`
      CREATE TABLE commits_migrated (
        repo_id INTEGER NOT NULL,
        sha TEXT NOT NULL,
        user_id TEXT NOT NULL,
        author_login TEXT,
        author_name TEXT NOT NULL DEFAULT '',
        author_email TEXT NOT NULL DEFAULT '',
        canonical_author_id TEXT NOT NULL,
        commit_time TEXT NOT NULL,
        message TEXT NOT NULL DEFAULT '',
        is_merge_commit INTEGER NOT NULL DEFAULT 0,
        is_bot INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (repo_id, sha),
        FOREIGN KEY (repo_id) REFERENCES repos (id) ON DELETE CASCADE
      );

      INSERT INTO commits_migrated (
        repo_id,
        sha,
        user_id,
        author_login,
        author_name,
        author_email,
        canonical_author_id,
        commit_time,
        message,
        is_merge_commit,
        is_bot
      )
      SELECT
        repo_id,
        sha,
        user_id,
        author_login,
        COALESCE(author_name, ''),
        COALESCE(author_email, ''),
        canonical_author_id,
        commit_time,
        COALESCE(message, ''),
        is_merge_commit,
        is_bot
      FROM commits;

      DROP TABLE commits;
      ALTER TABLE commits_migrated RENAME TO commits;
    `);
  })();
}

/* 一次性清理历史冗余行，并按表语义做合并或重建。 */
function normalizeRedundantData(): void {
  rebuildRepoTopicsTable();
  rebuildRepoLanguagesTable();
  rebuildRepoFilesSnapshotTable();
  rebuildActivityTablesFromCommits();
  rebuildRepoTrafficTable();
  rebuildRepoStackTagsTable();
}

function rebuildRepoTopicsTable(): void {
  replaceTable('repo_topics', `
    CREATE TABLE repo_topics_migrated (
      repo_id INTEGER NOT NULL,
      topic TEXT NOT NULL,
      FOREIGN KEY (repo_id) REFERENCES repos (id) ON DELETE CASCADE
    );

    INSERT INTO repo_topics_migrated (repo_id, topic)
    SELECT repo_id, topic
    FROM repo_topics
    GROUP BY repo_id, topic;
  `);
}

function rebuildRepoLanguagesTable(): void {
  replaceTable('repo_languages', `
    CREATE TABLE repo_languages_migrated (
      repo_id INTEGER NOT NULL,
      language TEXT NOT NULL,
      bytes INTEGER NOT NULL,
      percentage REAL NOT NULL,
      FOREIGN KEY (repo_id) REFERENCES repos (id) ON DELETE CASCADE
    );

    WITH deduped_languages AS (
      SELECT
        repo_id,
        language,
        MAX(bytes) AS bytes
      FROM repo_languages
      GROUP BY repo_id, language
    ),
    repo_totals AS (
      SELECT
        repo_id,
        SUM(bytes) AS total_bytes
      FROM deduped_languages
      GROUP BY repo_id
    )
    INSERT INTO repo_languages_migrated (repo_id, language, bytes, percentage)
    SELECT
      deduped_languages.repo_id,
      deduped_languages.language,
      deduped_languages.bytes,
      CASE
        WHEN COALESCE(repo_totals.total_bytes, 0) > 0
          THEN ROUND((deduped_languages.bytes * 100.0) / repo_totals.total_bytes, 2)
        ELSE 0
      END
    FROM deduped_languages
    LEFT JOIN repo_totals ON repo_totals.repo_id = deduped_languages.repo_id;
  `);
}

function rebuildRepoFilesSnapshotTable(): void {
  replaceTable('repo_files_snapshot', `
    CREATE TABLE repo_files_snapshot_migrated (
      repo_id INTEGER NOT NULL,
      file_path TEXT NOT NULL,
      content TEXT NOT NULL,
      FOREIGN KEY (repo_id) REFERENCES repos (id) ON DELETE CASCADE
    );

    INSERT INTO repo_files_snapshot_migrated (repo_id, file_path, content)
    SELECT current.repo_id, current.file_path, current.content
    FROM repo_files_snapshot AS current
    INNER JOIN (
      SELECT repo_id, file_path, MAX(rowid) AS keep_rowid
      FROM repo_files_snapshot
      GROUP BY repo_id, file_path
    ) AS latest
      ON latest.keep_rowid = current.rowid;
  `);
}

function rebuildActivityTablesFromCommits(): void {
  const userTimezones = db
    .prepare(
      `
        SELECT user_id AS userId, timezone
        FROM sync_configs
      `
    )
    .all() as UserTimezoneRow[];
  const timezoneMap = new Map<string, string>(
    userTimezones.map((item) => [item.userId, resolveTimezone(item.timezone || DEFAULT_TIMEZONE)])
  );
  const commits = db
    .prepare(
      `
        SELECT repo_id, user_id, commit_time
        FROM commits
        WHERE is_merge_commit = 0 AND is_bot = 0
      `
    )
    .all() as CommitActivityRow[];

  const dailyBuckets = new Map<string, ActivityBucketRecord>();
  const weeklyBuckets = new Map<string, ActivityBucketRecord>();
  const monthlyBuckets = new Map<string, ActivityBucketRecord>();

  for (const item of commits) {
    const timezone = timezoneMap.get(item.user_id) ?? DEFAULT_TIMEZONE;
    accumulateActivityBucket(dailyBuckets, item, getDayKey(item.commit_time, timezone));
    accumulateActivityBucket(weeklyBuckets, item, getWeekKey(item.commit_time, timezone));
    accumulateActivityBucket(monthlyBuckets, item, getMonthKey(item.commit_time, timezone));
  }

  db.transaction(() => {
    db.exec(`
      DELETE FROM repo_activity_daily;
      DELETE FROM repo_activity_weekly;
      DELETE FROM repo_activity_monthly;
    `);

    const insertDailyStatement = db.prepare(
      `
        INSERT INTO repo_activity_daily (repo_id, user_id, activity_date, commit_count)
        VALUES (?, ?, ?, ?)
      `
    );
    const insertWeeklyStatement = db.prepare(
      `
        INSERT INTO repo_activity_weekly (repo_id, user_id, week_start, commit_count)
        VALUES (?, ?, ?, ?)
      `
    );
    const insertMonthlyStatement = db.prepare(
      `
        INSERT INTO repo_activity_monthly (repo_id, user_id, month_key, commit_count)
        VALUES (?, ?, ?, ?)
      `
    );

    for (const record of dailyBuckets.values()) {
      insertDailyStatement.run(record.repoId, record.userId, record.bucketLabel, record.commitCount);
    }

    for (const record of weeklyBuckets.values()) {
      insertWeeklyStatement.run(record.repoId, record.userId, record.bucketLabel, record.commitCount);
    }

    for (const record of monthlyBuckets.values()) {
      insertMonthlyStatement.run(record.repoId, record.userId, record.bucketLabel, record.commitCount);
    }
  })();
}

function rebuildRepoTrafficTable(): void {
  replaceTable('repo_traffic_daily', `
    CREATE TABLE repo_traffic_daily_migrated (
      repo_id INTEGER NOT NULL,
      user_id TEXT NOT NULL,
      traffic_date TEXT NOT NULL,
      views_count INTEGER NOT NULL DEFAULT 0,
      unique_visitors INTEGER NOT NULL DEFAULT 0,
      clones_count INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (repo_id) REFERENCES repos (id) ON DELETE CASCADE
    );

    INSERT INTO repo_traffic_daily_migrated (
      repo_id,
      user_id,
      traffic_date,
      views_count,
      unique_visitors,
      clones_count
    )
    SELECT
      repo_id,
      user_id,
      traffic_date,
      MAX(views_count),
      MAX(unique_visitors),
      MAX(clones_count)
    FROM repo_traffic_daily
    GROUP BY repo_id, user_id, traffic_date;
  `);
}

function rebuildRepoStackTagsTable(): void {
  replaceTable('repo_stack_tags', `
    CREATE TABLE repo_stack_tags_migrated (
      repo_id INTEGER NOT NULL,
      tag TEXT NOT NULL,
      confidence REAL NOT NULL,
      source TEXT NOT NULL,
      FOREIGN KEY (repo_id) REFERENCES repos (id) ON DELETE CASCADE
    );

    INSERT INTO repo_stack_tags_migrated (repo_id, tag, confidence, source)
    SELECT current.repo_id, current.tag, current.confidence, current.source
    FROM repo_stack_tags AS current
    INNER JOIN (
      SELECT repo_id, tag, MAX(confidence) AS max_confidence
      FROM repo_stack_tags
      GROUP BY repo_id, tag
    ) AS ranked
      ON ranked.repo_id = current.repo_id
      AND ranked.tag = current.tag
      AND ranked.max_confidence = current.confidence
    INNER JOIN (
      SELECT repo_id, tag, confidence, MAX(rowid) AS keep_rowid
      FROM repo_stack_tags
      GROUP BY repo_id, tag, confidence
    ) AS latest
      ON latest.keep_rowid = current.rowid;
  `);
}

function accumulateActivityBucket(
  bucketMap: Map<string, ActivityBucketRecord>,
  item: CommitActivityRow,
  bucketLabel: string
): void {
  const bucketKey = `${item.repo_id}::${item.user_id}::${bucketLabel}`;
  const existing = bucketMap.get(bucketKey);

  if (existing) {
    existing.commitCount += 1;
    return;
  }

  bucketMap.set(bucketKey, {
    repoId: item.repo_id,
    userId: item.user_id,
    bucketLabel,
    commitCount: 1
  });
}

function replaceTable(tableName: string, migrationSql: string): void {
  if (getTableInfo(tableName).length === 0) {
    return;
  }

  const quotedTableName = quoteIdentifier(tableName);
  const migratedTableName = `${tableName}_migrated`;
  const quotedMigratedTableName = quoteIdentifier(migratedTableName);

  db.transaction(() => {
    db.exec(migrationSql);
    db.exec(`
      DROP TABLE ${quotedTableName};
      ALTER TABLE ${quotedMigratedTableName} RENAME TO ${quotedTableName};
    `);
  })();
}

function getSchemaVersion(): number {
  const row = db.prepare('PRAGMA user_version').get() as { user_version?: number } | undefined;
  return row?.user_version ?? 0;
}

function setSchemaVersion(version: number): void {
  db.pragma(`user_version = ${version}`);
}

function getTableInfo(tableName: string): TableInfoRow[] {
  return db.prepare(`PRAGMA table_info('${tableName}')`).all() as TableInfoRow[];
}

function hasUniqueIndex(tableName: string, expectedColumns: string[]): boolean {
  const indexes = db.prepare(`PRAGMA index_list('${tableName}')`).all() as IndexListRow[];

  return indexes.some((index) => {
    if (index.unique !== 1) {
      return false;
    }

    const columns = db
      .prepare(`PRAGMA index_info('${index.name}')`)
      .all() as IndexInfoRow[];

    const actualColumns = columns
      .sort((left, right) => left.seqno - right.seqno)
      .map((item) => item.name);

    return actualColumns.join(',') === expectedColumns.join(',');
  });
}

function normalizeDefaultValue(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  return value.replace(/^'+|'+$/g, '');
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}
