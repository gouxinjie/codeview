import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { env } from '../config/env';

const databaseDirectory = path.dirname(env.databasePath);

fs.mkdirSync(databaseDirectory, { recursive: true });

export const db = new Database(env.databasePath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

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
    github_login TEXT,
    author_email TEXT,
    author_name TEXT,
    is_primary INTEGER NOT NULL DEFAULT 0
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
    sha TEXT PRIMARY KEY,
    repo_id INTEGER NOT NULL,
    user_id TEXT NOT NULL,
    author_login TEXT,
    author_name TEXT NOT NULL DEFAULT '',
    author_email TEXT NOT NULL DEFAULT '',
    canonical_author_id TEXT NOT NULL,
    commit_time TEXT NOT NULL,
    message TEXT NOT NULL DEFAULT '',
    is_merge_commit INTEGER NOT NULL DEFAULT 0,
    is_bot INTEGER NOT NULL DEFAULT 0,
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

  CREATE INDEX IF NOT EXISTS idx_repos_user ON repos (user_id);
  CREATE INDEX IF NOT EXISTS idx_commits_repo_time ON commits (repo_id, commit_time);
  CREATE INDEX IF NOT EXISTS idx_commits_user ON commits (user_id, canonical_author_id);
  CREATE INDEX IF NOT EXISTS idx_daily_repo_date ON repo_activity_daily (repo_id, activity_date);
  CREATE INDEX IF NOT EXISTS idx_traffic_repo_date ON repo_traffic_daily (repo_id, traffic_date);
`);

