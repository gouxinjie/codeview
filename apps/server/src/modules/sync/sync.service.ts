import { subDays } from 'date-fns';
import { db } from '@/database/client';
import { getConfig, getDecryptedToken, updateLastSyncedAt } from '@/modules/config/config.service';
import { logger } from '@/utils/logger';
import { escapeHtml, unescapeHtml } from '@/utils/security';
import { DEFAULT_TIMEZONE, getDayKey, getDaysFromNow, getMonthKey, getWeekKey, resolveTimezone } from '@/utils/time';
import {
  fetchGitHubRepos,
  fetchGitHubUser,
  fetchRepoCommits,
  fetchRepoFiles,
  fetchRepoLanguages,
  fetchRepoTraffic,
  mergeTrafficByDate,
  type GitHubRepoResponse
} from '@/modules/sync/github.client';

type SyncMode = 'full' | 'incremental' | 'single';

interface RepoIdRow {
  id: number;
}

interface RepoSummaryRow {
  id: number;
  name: string;
  full_name: string;
  stars_count: number;
  forks_count: number;
}

interface CommitAggregateSource {
  repo_id: number;
  commit_time: string;
}

interface RepoMetrics {
  repoId: number;
  commits7d: number;
  commits30d: number;
  commits90d: number;
  activeDays30d: number;
  lastCommitAt: string | null;
  views14d: number;
  visitors14d: number;
  clones14d: number;
  starsCount: number;
  forksCount: number;
  weekTrendDelta: number;
}

interface StackTagRecord {
  tag: string;
  confidence: number;
  source: string;
}

interface SyncArguments {
  userId: string;
  mode: SyncMode;
  repoId?: number;
}

/* 启动一次同步任务并记录日志，完成后触发所有聚合计算。 */
export async function syncGitHubData(args: SyncArguments): Promise<void> {
  const config = getConfig(args.userId);
  const token = getDecryptedToken(args.userId);

  if (!config.githubUsername || !token) {
    throw new Error('请先完成 GitHub 用户名与 Token 配置');
  }

  const startedAt = new Date().toISOString();
  const scope = args.mode === 'single' && args.repoId ? `repo:${args.repoId}` : args.mode;

  const syncLog = db
    .prepare(
      `
        INSERT INTO sync_logs (user_id, scope, status, message, started_at)
        VALUES (?, ?, 'running', '同步进行中', ?)
      `
    )
    .run(args.userId, scope, startedAt);

  try {
    const githubUser = await fetchGitHubUser(token);
    const repositories = await resolveRepositories(args, token, config.includePrivateRepos);

    for (const repository of repositories) {
      await syncRepository(args.userId, token, githubUser.login, repository, args.mode);
    }

    recomputeAllAnalytics(args.userId, config.timezone || DEFAULT_TIMEZONE);

    const finishedAt = new Date().toISOString();
    updateLastSyncedAt(args.userId, finishedAt);

    db.prepare(
      `
        UPDATE sync_logs
        SET status = 'success', message = ?, finished_at = ?
        WHERE id = ?
      `
    ).run(`完成 ${repositories.length} 个仓库同步`, finishedAt, syncLog.lastInsertRowid);
  } catch (error) {
    const finishedAt = new Date().toISOString();
    const message = error instanceof Error ? error.message : '同步失败';

    logger.error('同步失败', { userId: args.userId, message });

    db.prepare(
      `
        UPDATE sync_logs
        SET status = 'failed', message = ?, finished_at = ?
        WHERE id = ?
      `
    ).run(message, finishedAt, syncLog.lastInsertRowid);

    throw error;
  }
}

async function resolveRepositories(
  args: SyncArguments,
  token: string,
  includePrivateRepos: boolean
): Promise<GitHubRepoResponse[]> {
  if (args.mode !== 'single' || !args.repoId) {
    return fetchGitHubRepos(token, includePrivateRepos);
  }

  const row = db
    .prepare('SELECT full_name FROM repos WHERE id = ? AND user_id = ?')
    .get(args.repoId, args.userId) as { full_name: string } | undefined;

  if (!row) {
    throw new Error('指定仓库不存在');
  }

  const repositories = await fetchGitHubRepos(token, includePrivateRepos);
  return repositories.filter((item) => item.full_name === row.full_name);
}

function upsertRepository(userId: string, repo: GitHubRepoResponse): number {
  db.prepare(
    `
      INSERT INTO repos (
        user_id,
        github_repo_id,
        owner_login,
        name,
        full_name,
        description,
        is_private,
        default_branch,
        html_url,
        stars_count,
        forks_count,
        main_language,
        created_at,
        updated_at,
        pushed_at
      )
      VALUES (
        @userId,
        @githubRepoId,
        @ownerLogin,
        @name,
        @fullName,
        @description,
        @isPrivate,
        @defaultBranch,
        @htmlUrl,
        @starsCount,
        @forksCount,
        @mainLanguage,
        @createdAt,
        @updatedAt,
        @pushedAt
      )
      ON CONFLICT(user_id, github_repo_id) DO UPDATE SET
        owner_login = excluded.owner_login,
        name = excluded.name,
        full_name = excluded.full_name,
        description = excluded.description,
        is_private = excluded.is_private,
        default_branch = excluded.default_branch,
        html_url = excluded.html_url,
        stars_count = excluded.stars_count,
        forks_count = excluded.forks_count,
        main_language = excluded.main_language,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at,
        pushed_at = excluded.pushed_at
    `
  ).run({
    userId,
    githubRepoId: repo.id,
    ownerLogin: repo.owner.login,
    name: escapeHtml(repo.name),
    fullName: escapeHtml(repo.full_name),
    description: escapeHtml(repo.description ?? ''),
    isPrivate: repo.private ? 1 : 0,
    defaultBranch: escapeHtml(repo.default_branch),
    htmlUrl: repo.html_url,
    starsCount: repo.stargazers_count,
    forksCount: repo.forks_count,
    mainLanguage: escapeHtml(repo.language ?? ''),
    createdAt: repo.created_at,
    updatedAt: repo.updated_at,
    pushedAt: repo.pushed_at
  });

  const localRepo = db
    .prepare('SELECT id FROM repos WHERE user_id = ? AND github_repo_id = ?')
    .get(userId, repo.id) as RepoIdRow;

  db.prepare('DELETE FROM repo_topics WHERE repo_id = ?').run(localRepo.id);

  const insertTopicStatement = db.prepare('INSERT INTO repo_topics (repo_id, topic) VALUES (?, ?)');

  for (const topic of repo.topics ?? []) {
    insertTopicStatement.run(localRepo.id, escapeHtml(topic));
  }

  return localRepo.id;
}

function saveRepoLanguages(repoId: number, languages: Record<string, number>): void {
  db.prepare('DELETE FROM repo_languages WHERE repo_id = ?').run(repoId);

  const totalBytes = Object.values(languages).reduce((sum, item) => sum + item, 0);
  const insertStatement = db.prepare(
    `
      INSERT INTO repo_languages (repo_id, language, bytes, percentage)
      VALUES (?, ?, ?, ?)
    `
  );

  for (const [language, bytes] of Object.entries(languages)) {
    const percentage = totalBytes > 0 ? Number(((bytes / totalBytes) * 100).toFixed(2)) : 0;
    insertStatement.run(repoId, escapeHtml(language), bytes, percentage);
  }
}

function saveRepoFiles(repoId: number, files: Array<{ filePath: string; content: string }>): void {
  db.prepare('DELETE FROM repo_files_snapshot WHERE repo_id = ?').run(repoId);

  const insertStatement = db.prepare(
    `
      INSERT INTO repo_files_snapshot (repo_id, file_path, content)
      VALUES (?, ?, ?)
    `
  );

  for (const file of files) {
    insertStatement.run(repoId, file.filePath, file.content);
  }
}

function saveRepoTraffic(
  userId: string,
  repoId: number,
  traffic: Array<{
    trafficDate: string;
    viewsCount: number;
    uniqueVisitors: number;
    clonesCount: number;
  }>
): void {
  db.prepare('DELETE FROM repo_traffic_daily WHERE repo_id = ?').run(repoId);

  const insertStatement = db.prepare(
    `
      INSERT INTO repo_traffic_daily (
        repo_id,
        user_id,
        traffic_date,
        views_count,
        unique_visitors,
        clones_count
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `
  );

  for (const item of traffic) {
    insertStatement.run(
      repoId,
      userId,
      item.trafficDate,
      item.viewsCount,
      item.uniqueVisitors,
      item.clonesCount
    );
  }
}

function resolveCanonicalAuthorId(
  userId: string,
  githubUsername: string,
  emailAliases: string[],
  authorLogin: string,
  authorEmail: string
): string {
  const normalizedLogin = authorLogin.trim().toLowerCase();
  const normalizedEmail = authorEmail.trim().toLowerCase();
  const currentUserLogin = githubUsername.trim().toLowerCase();

  if (
    normalizedLogin.length > 0 &&
    (normalizedLogin === currentUserLogin || normalizedLogin === `${currentUserLogin}[bot]`)
  ) {
    return `user:${userId}`;
  }

  if (normalizedEmail.length > 0 && emailAliases.includes(normalizedEmail)) {
    return `user:${userId}`;
  }

  if (normalizedEmail.includes('noreply') && normalizedLogin === currentUserLogin) {
    return `user:${userId}`;
  }

  if (normalizedLogin.length > 0) {
    return `login:${normalizedLogin}`;
  }

  if (normalizedEmail.length > 0) {
    return `email:${normalizedEmail}`;
  }

  return `unknown:${userId}`;
}

function saveAuthorIdentity(
  userId: string,
  canonicalAuthorId: string,
  authorLogin: string,
  authorEmail: string,
  authorName: string
): void {
  db.prepare(
    `
      INSERT INTO author_identities (
        user_id,
        canonical_author_id,
        github_login,
        author_email,
        author_name,
        is_primary
      )
      VALUES (?, ?, ?, ?, ?, 0)
      ON CONFLICT(user_id, canonical_author_id, github_login, author_email) DO UPDATE SET
        author_name = CASE
          WHEN excluded.author_name <> '' THEN excluded.author_name
          ELSE author_identities.author_name
        END
    `
  ).run(userId, canonicalAuthorId, authorLogin, authorEmail, authorName);
}

async function syncRepository(
  userId: string,
  token: string,
  githubUsername: string,
  repository: GitHubRepoResponse,
  mode: SyncMode
): Promise<void> {
  const config = getConfig(userId);
  const repoId = upsertRepository(userId, repository);
  const [languages, files, traffic] = await Promise.all([
    fetchRepoLanguages(token, repository.owner.login, repository.name),
    fetchRepoFiles(token, repository.owner.login, repository.name),
    fetchRepoTraffic(token, repository.owner.login, repository.name)
  ]);

  saveRepoLanguages(repoId, languages);
  saveRepoFiles(repoId, files);
  saveRepoTraffic(userId, repoId, mergeTrafficByDate(traffic));

  const latestCommit = db
    .prepare('SELECT MAX(commit_time) AS latestCommitTime FROM commits WHERE repo_id = ?')
    .get(repoId) as { latestCommitTime: string | null } | undefined;

  const since =
    mode === 'full'
      ? undefined
      : latestCommit?.latestCommitTime ?? subDays(new Date(), 90).toISOString();

  const commits = await fetchRepoCommits(token, repository.owner.login, repository.name, since);
  const insertStatement = db.prepare(
    `
      INSERT INTO commits (
        user_id,
        repo_id,
        sha,
        author_login,
        author_name,
        author_email,
        canonical_author_id,
        commit_time,
        message,
        is_merge_commit,
        is_bot
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(repo_id, sha) DO UPDATE SET
        user_id = excluded.user_id,
        author_login = excluded.author_login,
        author_name = excluded.author_name,
        author_email = excluded.author_email,
        canonical_author_id = excluded.canonical_author_id,
        commit_time = excluded.commit_time,
        message = excluded.message,
        is_merge_commit = excluded.is_merge_commit,
        is_bot = excluded.is_bot
    `
  );

  const normalizedAliases = config.emailAliases.map((item) => escapeHtml(item.toLowerCase()));

  for (const item of commits) {
    const authorLogin = escapeHtml(item.author?.login ?? '');
    const authorName = escapeHtml(item.commit.author?.name ?? '');
    const authorEmail = escapeHtml((item.commit.author?.email ?? '').toLowerCase());
    const commitTime = item.commit.author?.date;

    if (!commitTime) {
      continue;
    }

    const canonicalAuthorId = resolveCanonicalAuthorId(
      userId,
      githubUsername,
      normalizedAliases,
      authorLogin,
      authorEmail
    );

    const isBot =
      authorLogin.endsWith('[bot]') ||
      authorEmail.includes('bot') ||
      authorName.toLowerCase().includes('bot');

    const isMergeCommit =
      item.parents.length > 1 || item.commit.message.toLowerCase().startsWith('merge ');

    insertStatement.run(
      userId,
      repoId,
      item.sha,
      authorLogin,
      authorName,
      authorEmail,
      canonicalAuthorId,
      commitTime,
      escapeHtml(item.commit.message),
      isMergeCommit ? 1 : 0,
      isBot ? 1 : 0
    );

    saveAuthorIdentity(userId, canonicalAuthorId, authorLogin, authorEmail, authorName);
  }
}

function detectStackTags(repoId: number): StackTagRecord[] {
  const languages = db
    .prepare('SELECT language FROM repo_languages WHERE repo_id = ?')
    .all(repoId) as Array<{ language: string }>;
  const files = db
    .prepare('SELECT file_path, content FROM repo_files_snapshot WHERE repo_id = ?')
    .all(repoId) as Array<{ file_path: string; content: string }>;

  const languageSet = new Set(languages.map((item) => item.language.toLowerCase()));
  const tokenSet = new Set<string>();

  for (const file of files) {
    if (file.file_path === 'package.json') {
      try {
        const packageJson = JSON.parse(unescapeHtml(file.content)) as {
          dependencies?: Record<string, string>;
          devDependencies?: Record<string, string>;
        };

        Object.keys(packageJson.dependencies ?? {}).forEach((item) => tokenSet.add(item.toLowerCase()));
        Object.keys(packageJson.devDependencies ?? {}).forEach((item) => tokenSet.add(item.toLowerCase()));
      } catch {
        continue;
      }
    }

    if (file.file_path === 'requirements.txt' || file.file_path === 'pyproject.toml') {
      tokenSet.add('python');
    }

    if (file.file_path === 'go.mod') {
      tokenSet.add('go');
    }

    if (file.file_path === 'Cargo.toml') {
      tokenSet.add('rust');
    }
  }

  if (languageSet.has('typescript')) {
    tokenSet.add('typescript');
  }

  const tags: StackTagRecord[] = [];

  if (tokenSet.has('react') && tokenSet.has('vite')) {
    tags.push({ tag: 'React + Vite', confidence: 0.98, source: 'package.json' });
  }

  if (tokenSet.has('next')) {
    tags.push({ tag: 'Next.js', confidence: 0.96, source: 'package.json' });
  }

  if (tokenSet.has('vue') && tokenSet.has('vite')) {
    tags.push({ tag: 'Vue + Vite', confidence: 0.96, source: 'package.json' });
  }

  if (tokenSet.has('vitepress')) {
    tags.push({ tag: 'VitePress', confidence: 0.95, source: 'package.json' });
  }

  if (tokenSet.has('vue')) {
    tags.push({ tag: 'Vue', confidence: 0.9, source: 'package.json' });
  }

  if (tokenSet.has('@nestjs/core') || tokenSet.has('@nestjs/common')) {
    tags.push({ tag: 'NestJS', confidence: 0.94, source: 'package.json' });
  }

  if (tokenSet.has('express')) {
    tags.push({ tag: 'Express', confidence: 0.91, source: 'package.json' });
  }

  if (tokenSet.has('prisma')) {
    tags.push({ tag: 'Prisma', confidence: 0.9, source: 'package.json' });
  }

  if (tokenSet.has('tailwindcss')) {
    tags.push({ tag: 'Tailwind CSS', confidence: 0.9, source: 'package.json' });
  }

  if (tokenSet.has('typescript')) {
    tags.push({ tag: 'TypeScript', confidence: 0.88, source: 'language' });
  }

  if (tokenSet.has('python') || languageSet.has('python')) {
    tags.push({ tag: 'Python', confidence: 0.86, source: 'file' });
  }

  if (tokenSet.has('go') || languageSet.has('go')) {
    tags.push({ tag: 'Go', confidence: 0.86, source: 'file' });
  }

  return tags;
}

function writeStackTagsForUser(userId: string): void {
  const repositories = db.prepare('SELECT id FROM repos WHERE user_id = ?').all(userId) as RepoIdRow[];
  const deleteStatement = db.prepare('DELETE FROM repo_stack_tags WHERE repo_id = ?');
  const insertStatement = db.prepare(
    `
      INSERT INTO repo_stack_tags (repo_id, tag, confidence, source)
      VALUES (?, ?, ?, ?)
    `
  );

  for (const repository of repositories) {
    deleteStatement.run(repository.id);

    const tags = detectStackTags(repository.id);
    for (const tag of tags) {
      insertStatement.run(repository.id, tag.tag, tag.confidence, tag.source);
    }
  }
}

function recomputeActivityTables(userId: string, timezone: string): Map<number, RepoMetrics> {
  db.prepare('DELETE FROM repo_activity_daily WHERE user_id = ?').run(userId);
  db.prepare('DELETE FROM repo_activity_weekly WHERE user_id = ?').run(userId);
  db.prepare('DELETE FROM repo_activity_monthly WHERE user_id = ?').run(userId);

  const repositories = db
    .prepare('SELECT id, stars_count, forks_count FROM repos WHERE user_id = ?')
    .all(userId) as Array<{ id: number; stars_count: number; forks_count: number }>;
  const commits = db
    .prepare(
      `
        SELECT repo_id, commit_time
        FROM commits
        WHERE user_id = ? AND is_merge_commit = 0 AND is_bot = 0
      `
    )
    .all(userId) as CommitAggregateSource[];

  const dailyMap = new Map<number, Map<string, number>>();
  const weeklyMap = new Map<number, Map<string, number>>();
  const monthlyMap = new Map<number, Map<string, number>>();
  const metrics = new Map<number, RepoMetrics>();
  const now = new Date();
  const sevenDaysAgoKey = getDayKey(subDays(now, 6), timezone);
  const thirtyDaysAgoKey = getDayKey(subDays(now, 29), timezone);
  const ninetyDaysAgoKey = getDayKey(subDays(now, 89), timezone);
  const previousWeekStartKey = getDayKey(subDays(now, 13), timezone);

  for (const repository of repositories) {
    metrics.set(repository.id, {
      repoId: repository.id,
      commits7d: 0,
      commits30d: 0,
      commits90d: 0,
      activeDays30d: 0,
      lastCommitAt: null,
      views14d: 0,
      visitors14d: 0,
      clones14d: 0,
      starsCount: repository.stars_count,
      forksCount: repository.forks_count,
      weekTrendDelta: 0
    });
  }

  for (const item of commits) {
    const dailyKey = getDayKey(item.commit_time, timezone);
    const weeklyKey = getWeekKey(item.commit_time, timezone);
    const monthlyKey = getMonthKey(item.commit_time, timezone);

    const repoDaily = dailyMap.get(item.repo_id) ?? new Map<string, number>();
    repoDaily.set(dailyKey, (repoDaily.get(dailyKey) ?? 0) + 1);
    dailyMap.set(item.repo_id, repoDaily);

    const repoWeekly = weeklyMap.get(item.repo_id) ?? new Map<string, number>();
    repoWeekly.set(weeklyKey, (repoWeekly.get(weeklyKey) ?? 0) + 1);
    weeklyMap.set(item.repo_id, repoWeekly);

    const repoMonthly = monthlyMap.get(item.repo_id) ?? new Map<string, number>();
    repoMonthly.set(monthlyKey, (repoMonthly.get(monthlyKey) ?? 0) + 1);
    monthlyMap.set(item.repo_id, repoMonthly);

    const metric = metrics.get(item.repo_id);
    if (!metric) {
      continue;
    }

    metric.lastCommitAt =
      !metric.lastCommitAt || item.commit_time > metric.lastCommitAt ? item.commit_time : metric.lastCommitAt;

    if (dailyKey >= sevenDaysAgoKey) {
      metric.commits7d += 1;
    }

    if (dailyKey >= thirtyDaysAgoKey) {
      metric.commits30d += 1;
    }

    if (dailyKey >= ninetyDaysAgoKey) {
      metric.commits90d += 1;
    }

    if (dailyKey >= thirtyDaysAgoKey && repoDaily.get(dailyKey) === 1) {
      metric.activeDays30d += 1;
    }
  }

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

  for (const [repoId, entries] of dailyMap.entries()) {
    for (const [activityDate, commitCount] of entries.entries()) {
      insertDailyStatement.run(repoId, userId, activityDate, commitCount);
    }
  }

  for (const [repoId, entries] of weeklyMap.entries()) {
    const currentWeekCount = [...entries.entries()]
      .filter(([weekStart]) => weekStart >= getWeekKey(subDays(now, 6), timezone))
      .reduce((sum, [, count]) => sum + count, 0);

    const previousWeekCount = [...entries.entries()]
      .filter(([weekStart]) => weekStart >= previousWeekStartKey && weekStart < getWeekKey(subDays(now, 6), timezone))
      .reduce((sum, [, count]) => sum + count, 0);

    const metric = metrics.get(repoId);
    if (metric) {
      metric.weekTrendDelta = currentWeekCount - previousWeekCount;
    }

    for (const [weekStart, commitCount] of entries.entries()) {
      insertWeeklyStatement.run(repoId, userId, weekStart, commitCount);
    }
  }

  for (const [repoId, entries] of monthlyMap.entries()) {
    for (const [monthKey, commitCount] of entries.entries()) {
      insertMonthlyStatement.run(repoId, userId, monthKey, commitCount);
    }
  }

  const trafficRows = db
    .prepare(
      `
        SELECT repo_id, SUM(views_count) AS viewsCount, SUM(unique_visitors) AS visitorsCount, SUM(clones_count) AS clonesCount
        FROM repo_traffic_daily
        WHERE user_id = ? AND traffic_date >= ?
        GROUP BY repo_id
      `
    )
    .all(userId, getDayKey(subDays(now, 13), timezone)) as Array<{
    repo_id: number;
    viewsCount: number | null;
    visitorsCount: number | null;
    clonesCount: number | null;
  }>;

  for (const item of trafficRows) {
    const metric = metrics.get(item.repo_id);
    if (!metric) {
      continue;
    }

    metric.views14d = item.viewsCount ?? 0;
    metric.visitors14d = item.visitorsCount ?? 0;
    metric.clones14d = item.clonesCount ?? 0;
  }

  return metrics;
}

function computeScore(value: number, maxValue: number): number {
  if (maxValue <= 0) {
    return 0;
  }

  return Number(((value / maxValue) * 100).toFixed(2));
}

function writeRepoScores(userId: string, metricsMap: Map<number, RepoMetrics>, timezone: string): void {
  db.prepare(
    `
      DELETE FROM repo_scores
      WHERE repo_id IN (SELECT id FROM repos WHERE user_id = ?)
    `
  ).run(userId);

  const metrics = [...metricsMap.values()];

  const maxCommits30d = Math.max(...metrics.map((item) => item.commits30d), 1);
  const maxActiveDays30d = Math.max(...metrics.map((item) => item.activeDays30d), 1);
  const maxTraffic = Math.max(
    ...metrics.map((item) => item.views14d + item.visitors14d * 2 + item.clones14d * 1.5),
    1
  );
  const maxPopularity = Math.max(...metrics.map((item) => item.starsCount * 2 + item.forksCount), 1);

  const insertStatement = db.prepare(
    `
      INSERT INTO repo_scores (
        repo_id,
        overall_score,
        activity_score,
        traffic_score,
        popularity_score,
        recency_score
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `
  );

  for (const metric of metrics) {
    const activityScore = Number(
      (
        computeScore(metric.commits30d, maxCommits30d) * 0.65 +
        computeScore(metric.activeDays30d, maxActiveDays30d) * 0.35
      ).toFixed(2)
    );
    const trafficValue = metric.views14d + metric.visitors14d * 2 + metric.clones14d * 1.5;
    const trafficScore = computeScore(trafficValue, maxTraffic);
    const popularityScore = computeScore(metric.starsCount * 2 + metric.forksCount, maxPopularity);
    const recencyBase = metric.lastCommitAt ? Math.max(0, 90 - getDaysFromNow(metric.lastCommitAt, timezone)) : 0;
    const recencyScore = Number(((recencyBase / 90) * 100).toFixed(2));

    const hasTraffic = metrics.some((item) => item.views14d > 0 || item.visitors14d > 0 || item.clones14d > 0);
    const overallScore = hasTraffic
      ? Number(
          (
            activityScore * 0.45 +
            trafficScore * 0.3 +
            popularityScore * 0.15 +
            recencyScore * 0.1
          ).toFixed(2)
        )
      : Number(
          (
            activityScore * (0.45 / 0.7) +
            popularityScore * (0.15 / 0.7) +
            recencyScore * (0.1 / 0.7)
          ).toFixed(2)
        );

    insertStatement.run(
      metric.repoId,
      overallScore,
      activityScore,
      trafficScore,
      popularityScore,
      recencyScore
    );
  }
}

function generateInsightCards(userId: string): void {
  db.prepare('DELETE FROM insight_cards WHERE user_id = ?').run(userId);

  const repos = db
    .prepare(
      `
        SELECT
          repos.id,
          repos.name,
          repos.full_name,
          repos.stars_count,
          repo_scores.overall_score
        FROM repos
        LEFT JOIN repo_scores ON repo_scores.repo_id = repos.id
        WHERE repos.user_id = ?
        ORDER BY repo_scores.overall_score DESC, repos.stars_count DESC
      `
    )
    .all(userId) as Array<{
    id: number;
    name: string;
    full_name: string;
    stars_count: number;
    overall_score: number | null;
  }>;

  const metrics = db
    .prepare(
      `
        SELECT
          repos.id AS repoId,
          repos.name AS repoName,
          SUM(CASE WHEN repo_activity_daily.activity_date >= date('now', '-29 day') THEN repo_activity_daily.commit_count ELSE 0 END) AS commits30d,
          MAX(repo_activity_daily.activity_date) AS lastActiveDate
        FROM repos
        LEFT JOIN repo_activity_daily ON repo_activity_daily.repo_id = repos.id
        WHERE repos.user_id = ?
        GROUP BY repos.id
      `
    )
    .all(userId) as Array<{
    repoId: number;
    repoName: string;
    commits30d: number | null;
    lastActiveDate: string | null;
  }>;

  const tagRows = db
    .prepare(
      `
        SELECT tag, COUNT(*) AS usageCount
        FROM repo_stack_tags
        WHERE repo_id IN (SELECT id FROM repos WHERE user_id = ?)
        GROUP BY tag
        ORDER BY usageCount DESC, tag ASC
        LIMIT 3
      `
    )
    .all(userId) as Array<{ tag: string; usageCount: number }>;

  const insertStatement = db.prepare(
    `
      INSERT INTO insight_cards (user_id, level, title, summary, created_at)
      VALUES (?, ?, ?, ?, ?)
    `
  );
  const createdAt = new Date().toISOString();
  const topRepo = repos[0];

  if (topRepo) {
    insertStatement.run(
      userId,
      'focus',
      '当前最值得继续经营的项目',
      `${topRepo.name} 当前综合评分最高，适合作为下一阶段的重点投入项目。`,
      createdAt
    );
  }

  const activeRepo = [...metrics].sort((left, right) => (right.commits30d ?? 0) - (left.commits30d ?? 0))[0];
  if (activeRepo) {
    insertStatement.run(
      userId,
      'up',
      '最近 30 天活跃项目',
      `${activeRepo.repoName} 最近 30 天提交最密集，说明该项目正在持续推进。`,
      createdAt
    );
  }

  const riskRepo = [...metrics]
    .filter((item) => (item.commits30d ?? 0) === 0)
    .sort((left, right) => left.repoName.localeCompare(right.repoName))[0];
  if (riskRepo) {
    insertStatement.run(
      userId,
      'risk',
      '存在低维护风险项目',
      `${riskRepo.repoName} 最近 30 天没有新的有效提交，建议确认是否需要继续维护。`,
      createdAt
    );
  }

  if (tagRows.length > 0) {
    insertStatement.run(
      userId,
      'focus',
      '当前主导技术栈画像',
      `近期仓库中最常出现的技术标签是 ${tagRows.map((item) => item.tag).join('、')}。`,
      createdAt
    );
  }

  const trafficRepo = db
    .prepare(
      `
        SELECT repos.name, SUM(repo_traffic_daily.views_count) AS totalViews
        FROM repos
        INNER JOIN repo_traffic_daily ON repo_traffic_daily.repo_id = repos.id
        WHERE repos.user_id = ?
        GROUP BY repos.id
        ORDER BY totalViews DESC
        LIMIT 1
      `
    )
    .get(userId) as { name: string; totalViews: number | null } | undefined;

  if (trafficRepo && (trafficRepo.totalViews ?? 0) > 0) {
    insertStatement.run(
      userId,
      'up',
      '流量表现最佳项目',
      `${trafficRepo.name} 在近 14 天获得了最高访问量，适合补充文档或展示页继续放大曝光。`,
      createdAt
    );
  }
}

function recomputeAllAnalytics(userId: string, timezone: string): void {
  const safeTimezone = resolveTimezone(timezone);
  const metrics = recomputeActivityTables(userId, safeTimezone);
  writeStackTagsForUser(userId);
  writeRepoScores(userId, metrics, safeTimezone);
  generateInsightCards(userId);
}

export function getSyncStatus(userId: string): {
  userId: string;
  status: string;
  message: string;
  startedAt: string | null;
  finishedAt: string | null;
} {
  const row = db
    .prepare(
      `
        SELECT status, message, started_at, finished_at
        FROM sync_logs
        WHERE user_id = ?
        ORDER BY id DESC
        LIMIT 1
      `
    )
    .get(userId) as
    | {
        status: string;
        message: string;
        started_at: string | null;
        finished_at: string | null;
      }
    | undefined;

  return {
    userId,
    status: row?.status ?? 'idle',
    message: row?.message ?? '尚未开始同步',
    startedAt: row?.started_at ?? null,
    finishedAt: row?.finished_at ?? null
  };
}

export function getLatestRepoSummary(userId: string): RepoSummaryRow[] {
  return db
    .prepare(
      `
        SELECT id, name, full_name, stars_count, forks_count
        FROM repos
        WHERE user_id = ?
        ORDER BY updated_at DESC
      `
    )
    .all(userId) as RepoSummaryRow[];
}
