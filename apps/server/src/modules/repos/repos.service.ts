import { subDays } from 'date-fns';
import { db } from '@/database/client';
import { getConfig } from '@/modules/config/config.service';
import { getDayKey } from '@/utils/time';

export interface RepoListFilters {
  userId: string;
  search?: string;
  language?: string;
  stackTag?: string;
  sortBy?: 'activity' | 'updated';
}

/* 获取仓库列表，支持搜索、语言和技术栈过滤。 */
export function getRepositories(filters: RepoListFilters): Array<{
  id: number;
  name: string;
  fullName: string;
  description: string;
  mainLanguage: string;
  starsCount: number;
  updatedAt: string;
  pushedAt: string | null;
  commitCount30d: number;
  activeDays30d: number;
  score: number;
  stackTags: string[];
}> {
  const config = getConfig(filters.userId);
  const rows = db
    .prepare(
      `
        SELECT
          repos.id,
          repos.name,
          repos.full_name AS fullName,
          repos.description,
          repos.main_language AS mainLanguage,
          repos.stars_count AS starsCount,
          repos.updated_at AS updatedAt,
          repos.pushed_at AS pushedAt,
          COALESCE(repo_scores.overall_score, 0) AS score,
          COALESCE(SUM(CASE WHEN repo_activity_daily.activity_date >= @startDate THEN repo_activity_daily.commit_count ELSE 0 END), 0) AS commitCount30d,
          COUNT(DISTINCT CASE WHEN repo_activity_daily.activity_date >= @startDate THEN repo_activity_daily.activity_date END) AS activeDays30d
        FROM repos
        LEFT JOIN repo_activity_daily ON repo_activity_daily.repo_id = repos.id
        LEFT JOIN repo_scores ON repo_scores.repo_id = repos.id
        WHERE repos.user_id = @userId
          AND (@search = '' OR repos.name LIKE @keyword OR repos.full_name LIKE @keyword OR repos.description LIKE @keyword)
          AND (@language = '' OR repos.main_language = @language)
          AND (
            @stackTag = ''
            OR repos.id IN (
              SELECT repo_id
              FROM repo_stack_tags
              WHERE tag = @stackTag
            )
          )
        GROUP BY repos.id
      `
    )
    .all({
      userId: filters.userId,
      search: filters.search?.trim() ?? '',
      keyword: `%${filters.search?.trim() ?? ''}%`,
      language: filters.language?.trim() ?? '',
      stackTag: filters.stackTag?.trim() ?? '',
      startDate: getDayKey(subDays(new Date(), 29), config.timezone)
    }) as Array<{
    id: number;
    name: string;
    fullName: string;
    description: string;
    mainLanguage: string;
    starsCount: number;
    updatedAt: string;
    pushedAt: string | null;
    commitCount30d: number;
    activeDays30d: number;
    score: number;
  }>;

  const repoIds = rows.map((item) => item.id);
  const tagRows = repoIds.length
    ? (db
        .prepare(
          `
            SELECT repo_id AS repoId, tag
            FROM repo_stack_tags
            WHERE repo_id IN (${repoIds.map(() => '?').join(',')})
          `
        )
        .all(...repoIds) as Array<{ repoId: number; tag: string }>)
    : [];

  const tagsByRepo = new Map<number, string[]>();
  for (const tag of tagRows) {
    const current = tagsByRepo.get(tag.repoId) ?? [];
    current.push(tag.tag);
    tagsByRepo.set(tag.repoId, current);
  }

  const sortedRows = [...rows].sort((left, right) => {
    if (filters.sortBy === 'updated') {
      return right.updatedAt.localeCompare(left.updatedAt);
    }

    return right.score - left.score;
  });

  return sortedRows.map((item) => ({
    ...item,
    stackTags: tagsByRepo.get(item.id) ?? []
  }));
}

/* 获取单个仓库的基础画像。 */
export function getRepositoryDetail(userId: string, repoId: number): {
  id: number;
  name: string;
  fullName: string;
  description: string;
  htmlUrl: string;
  defaultBranch: string;
  mainLanguage: string;
  starsCount: number;
  forksCount: number;
  score: number;
  createdAt: string;
  updatedAt: string;
  pushedAt: string | null;
  lastCommitAt: string | null;
  commitCount30d: number;
  activeDays30d: number;
  tags: Array<{ tag: string; confidence: number; source: string }>;
  languages: Array<{ language: string; percentage: number }>;
  trafficSummary: {
    views14d: number;
    visitors14d: number;
    clones14d: number;
  };
} {
  const config = getConfig(userId);
  const repository = db
    .prepare(
      `
        SELECT
          repos.id,
          repos.name,
          repos.full_name AS fullName,
          repos.description,
          repos.html_url AS htmlUrl,
          repos.default_branch AS defaultBranch,
          repos.main_language AS mainLanguage,
          repos.stars_count AS starsCount,
          repos.forks_count AS forksCount,
          repos.created_at AS createdAt,
          repos.updated_at AS updatedAt,
          repos.pushed_at AS pushedAt,
          COALESCE(repo_scores.overall_score, 0) AS score,
          MAX(repo_activity_daily.activity_date) AS lastCommitAt,
          COALESCE(SUM(CASE WHEN repo_activity_daily.activity_date >= @startDate THEN repo_activity_daily.commit_count ELSE 0 END), 0) AS commitCount30d,
          COUNT(DISTINCT CASE WHEN repo_activity_daily.activity_date >= @startDate THEN repo_activity_daily.activity_date END) AS activeDays30d
        FROM repos
        LEFT JOIN repo_scores ON repo_scores.repo_id = repos.id
        LEFT JOIN repo_activity_daily ON repo_activity_daily.repo_id = repos.id
        WHERE repos.user_id = @userId AND repos.id = @repoId
        GROUP BY repos.id
      `
    )
    .get({
      userId,
      repoId,
      startDate: getDayKey(subDays(new Date(), 29), config.timezone)
    }) as
    | {
        id: number;
        name: string;
        fullName: string;
        description: string;
        htmlUrl: string;
        defaultBranch: string;
        mainLanguage: string;
        starsCount: number;
        forksCount: number;
        score: number;
        createdAt: string;
        updatedAt: string;
        pushedAt: string | null;
        lastCommitAt: string | null;
        commitCount30d: number;
        activeDays30d: number;
      }
    | undefined;

  if (!repository) {
    throw new Error('仓库不存在');
  }

  const tags = db
    .prepare(
      `
        SELECT tag, confidence, source
        FROM repo_stack_tags
        WHERE repo_id = ?
        ORDER BY confidence DESC, tag ASC
      `
    )
    .all(repoId) as Array<{ tag: string; confidence: number; source: string }>;

  const languages = db
    .prepare(
      `
        SELECT language, percentage
        FROM repo_languages
        WHERE repo_id = ?
        ORDER BY percentage DESC, language ASC
      `
    )
    .all(repoId) as Array<{ language: string; percentage: number }>;

  const trafficSummary = db
    .prepare(
      `
        SELECT
          COALESCE(SUM(views_count), 0) AS views14d,
          COALESCE(SUM(unique_visitors), 0) AS visitors14d,
          COALESCE(SUM(clones_count), 0) AS clones14d
        FROM repo_traffic_daily
        WHERE repo_id = ? AND traffic_date >= ?
      `
    )
    .get(repoId, getDayKey(subDays(new Date(), 13), config.timezone)) as {
    views14d: number;
    visitors14d: number;
    clones14d: number;
  };

  return {
    ...repository,
    tags,
    languages,
    trafficSummary
  };
}

/* 获取仓库最近提交记录。 */
export function getRepositoryRecentCommits(
  userId: string,
  repoId: number
): Array<{
  sha: string;
  message: string;
  authorName: string;
  authorLogin: string | null;
  commitTime: string;
}> {
  const repository = db
    .prepare('SELECT id FROM repos WHERE user_id = ? AND id = ?')
    .get(userId, repoId) as { id: number } | undefined;

  if (!repository) {
    throw new Error('仓库不存在');
  }

  return db
    .prepare(
      `
        SELECT
          sha,
          message,
          author_name AS authorName,
          author_login AS authorLogin,
          commit_time AS commitTime
        FROM commits
        WHERE user_id = ? AND repo_id = ?
        ORDER BY commit_time DESC
        LIMIT 5
      `
    )
    .all(userId, repoId) as Array<{
    sha: string;
    message: string;
    authorName: string;
    authorLogin: string | null;
    commitTime: string;
  }>;
}

/* 获取仓库按日、周、月的提交趋势。 */
export function getRepositoryActivity(
  userId: string,
  repoId: number,
  granularity: 'day' | 'week' | 'month'
): Array<{ label: string; count: number }> {
  const tables = {
    day: { table: 'repo_activity_daily', label: 'activity_date' },
    week: { table: 'repo_activity_weekly', label: 'week_start' },
    month: { table: 'repo_activity_monthly', label: 'month_key' }
  } as const;

  const current = tables[granularity];

  return db
    .prepare(
      `
        SELECT ${current.label} AS label, commit_count AS count
        FROM ${current.table}
        WHERE user_id = ? AND repo_id = ?
        ORDER BY ${current.label} ASC
      `
    )
    .all(userId, repoId) as Array<{ label: string; count: number }>;
}

/* 获取仓库级热力图。 */
export function getRepositoryHeatmap(
  userId: string,
  repoId: number
): Array<{ date: string; count: number; repoCount: number }> {
  const rows = db
    .prepare(
      `
        SELECT activity_date AS date, commit_count AS count
        FROM repo_activity_daily
        WHERE user_id = ? AND repo_id = ?
        ORDER BY activity_date ASC
      `
    )
    .all(userId, repoId) as Array<{ date: string; count: number }>;

  return rows.map((item) => ({
      ...item,
      repoCount: item.count > 0 ? 1 : 0
    }));
}

/* 获取仓库技术栈识别明细。 */
export function getRepositoryStack(userId: string, repoId: number): {
  tags: Array<{ tag: string; confidence: number; source: string }>;
  files: Array<{ filePath: string }>;
} {
  const repository = db
    .prepare('SELECT id FROM repos WHERE user_id = ? AND id = ?')
    .get(userId, repoId) as { id: number } | undefined;

  if (!repository) {
    throw new Error('仓库不存在');
  }

  return {
    tags: db
      .prepare(
        `
          SELECT tag, confidence, source
          FROM repo_stack_tags
          WHERE repo_id = ?
          ORDER BY confidence DESC
        `
      )
      .all(repoId) as Array<{ tag: string; confidence: number; source: string }>,
    files: db
      .prepare(
        `
          SELECT file_path AS filePath
          FROM repo_files_snapshot
          WHERE repo_id = ?
          ORDER BY file_path ASC
        `
      )
      .all(repoId) as Array<{ filePath: string }>
  };
}

/* 获取仓库流量趋势。 */
export function getRepositoryTraffic(
  userId: string,
  repoId: number
): Array<{ date: string; views: number; visitors: number; clones: number }> {
  const repository = db
    .prepare('SELECT id FROM repos WHERE user_id = ? AND id = ?')
    .get(userId, repoId) as { id: number } | undefined;

  if (!repository) {
    throw new Error('仓库不存在');
  }

  return db
    .prepare(
      `
        SELECT
          traffic_date AS date,
          views_count AS views,
          unique_visitors AS visitors,
          clones_count AS clones
        FROM repo_traffic_daily
        WHERE repo_id = ?
        ORDER BY traffic_date ASC
      `
    )
    .all(repoId) as Array<{ date: string; views: number; visitors: number; clones: number }>;
}
