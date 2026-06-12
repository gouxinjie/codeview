import { addDays, differenceInCalendarDays, subDays } from 'date-fns';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { db } from '../../database/client';
import { getConfig } from '../config/config.service';
import { getDayKey } from '../../utils/time';

interface DailyActivityRow {
  activity_date: string;
  commit_count: number;
}

interface StatisticsRange {
  mode: 'preset' | 'custom';
  days: number;
  startDate: string;
  endDate: string;
  startIso: string;
  endExclusiveIso: string;
  previousStartDate: string;
  previousEndDate: string;
  previousStartIso: string;
  previousEndExclusiveIso: string;
}

/* 汇总首页总览数据，减少前端并发请求数量。 */
export function getOverview(userId: string): {
  header: {
    title: string;
    githubUsername: string;
    lastSyncedAt: string | null;
    syncStatus: string;
    currentTime: string;
  };
  kpis: Array<{ label: string; value: string; hint: string }>;
  personalTrend: Array<{ date: string; count: number }>;
  personalHeatmap: Array<{ date: string; count: number; repoCount: number }>;
  rankings: Array<{
    repoId: number;
    name: string;
    fullName: string;
    commitCount30d: number;
    activeDays30d: number;
    lastCommitAt: string | null;
    score: number;
    starsCount: number;
    stackTags: string[];
  }>;
  languageDistribution: Array<{ name: string; value: number }>;
  stackTags: Array<{ tag: string; usageCount: number }>;
  featuredRepoId: number | null;
} {
  const config = getConfig(userId);
  const syncStatus = db
    .prepare(
      `
        SELECT status
        FROM sync_logs
        WHERE user_id = ?
        ORDER BY id DESC
        LIMIT 1
      `
    )
    .get(userId) as { status: string } | undefined;

  const totalReposRow = db
    .prepare('SELECT COUNT(*) AS count FROM repos WHERE user_id = ?')
    .get(userId) as { count: number };
  const totalCommitsRow = db
    .prepare(
      `
        SELECT COUNT(*) AS count
        FROM commits
        WHERE user_id = ? AND canonical_author_id = ? AND is_merge_commit = 0 AND is_bot = 0 AND commit_time >= ?
      `
    )
    .get(userId, `user:${userId}`, subDays(new Date(), 29).toISOString()) as { count: number };
  const activeReposRow = db
    .prepare(
      `
        SELECT COUNT(DISTINCT repo_id) AS count
        FROM repo_activity_daily
        WHERE user_id = ? AND activity_date >= ?
      `
    )
    .get(userId, getDayKey(subDays(new Date(), 29), config.timezone)) as { count: number };
  const trafficRow = db
    .prepare(
      `
        SELECT
          COALESCE(SUM(views_count), 0) AS totalViews,
          COALESCE(SUM(clones_count), 0) AS totalClones
        FROM repo_traffic_daily
        WHERE user_id = ? AND traffic_date >= ?
      `
    )
    .get(userId, getDayKey(subDays(new Date(), 13), config.timezone)) as {
    totalViews: number;
    totalClones: number;
  };

  const personalTrendSource = db
    .prepare(
      `
        SELECT activity_date, SUM(commit_count) AS commit_count
        FROM repo_activity_daily
        WHERE user_id = ? AND activity_date >= ?
        GROUP BY activity_date
        ORDER BY activity_date ASC
      `
    )
    .all(userId, getDayKey(subDays(new Date(), 29), config.timezone)) as DailyActivityRow[];

  const personalHeatmapSource = db
    .prepare(
      `
        SELECT
          repo_activity_daily.activity_date AS activityDate,
          SUM(repo_activity_daily.commit_count) AS commitCount,
          COUNT(DISTINCT repo_activity_daily.repo_id) AS repoCount
        FROM repo_activity_daily
        INNER JOIN commits ON commits.repo_id = repo_activity_daily.repo_id
        WHERE repo_activity_daily.user_id = ?
          AND commits.user_id = ?
          AND commits.canonical_author_id = ?
          AND commits.is_merge_commit = 0
          AND commits.is_bot = 0
          AND repo_activity_daily.activity_date >= ?
        GROUP BY repo_activity_daily.activity_date
        ORDER BY repo_activity_daily.activity_date ASC
      `
    )
    .all(userId, userId, `user:${userId}`, getDayKey(subDays(new Date(), 364), config.timezone)) as Array<{
    activityDate: string;
    commitCount: number;
    repoCount: number;
  }>;

  const rankings = db
    .prepare(
      `
        SELECT
          repos.id AS repoId,
          repos.name,
          repos.full_name AS fullName,
          repos.stars_count AS starsCount,
          repo_scores.overall_score AS score,
          COALESCE(SUM(CASE WHEN repo_activity_daily.activity_date >= @startDate THEN repo_activity_daily.commit_count ELSE 0 END), 0) AS commitCount30d,
          COUNT(DISTINCT CASE WHEN repo_activity_daily.activity_date >= @startDate THEN repo_activity_daily.activity_date END) AS activeDays30d,
          MAX(repo_activity_daily.activity_date) AS lastCommitAt
        FROM repos
        LEFT JOIN repo_scores ON repo_scores.repo_id = repos.id
        LEFT JOIN repo_activity_daily ON repo_activity_daily.repo_id = repos.id
        WHERE repos.user_id = @userId
        GROUP BY repos.id
        ORDER BY score DESC, commitCount30d DESC, repos.updated_at DESC
        LIMIT 8
      `
    )
    .all({
      userId,
      startDate: getDayKey(subDays(new Date(), 29), config.timezone)
    }) as Array<{
    repoId: number;
    name: string;
    fullName: string;
    starsCount: number;
    score: number | null;
    commitCount30d: number;
    activeDays30d: number;
    lastCommitAt: string | null;
  }>;

  const stackRows = db
    .prepare(
      `
        SELECT tag, COUNT(*) AS usageCount
        FROM repo_stack_tags
        WHERE repo_id IN (SELECT id FROM repos WHERE user_id = ?)
        GROUP BY tag
        ORDER BY usageCount DESC, tag ASC
      `
    )
    .all(userId) as Array<{ tag: string; usageCount: number }>;

  const languageDistribution = db
    .prepare(
      `
        SELECT language AS name, ROUND(SUM(bytes), 2) AS value
        FROM repo_languages
        WHERE repo_id IN (SELECT id FROM repos WHERE user_id = ?)
        GROUP BY language
        ORDER BY value DESC
        LIMIT 8
      `
    )
    .all(userId) as Array<{ name: string; value: number }>;

  const repoTags = db
    .prepare(
      `
        SELECT repo_id AS repoId, tag
        FROM repo_stack_tags
        WHERE repo_id IN (SELECT id FROM repos WHERE user_id = ?)
      `
    )
    .all(userId) as Array<{ repoId: number; tag: string }>;

  const tagsByRepo = new Map<number, string[]>();
  for (const row of repoTags) {
    const tags = tagsByRepo.get(row.repoId) ?? [];
    tags.push(row.tag);
    tagsByRepo.set(row.repoId, tags);
  }

  return {
    header: {
      title: 'CodeView',
      githubUsername: config.githubUsername,
      lastSyncedAt: config.lastSyncedAt,
      syncStatus: syncStatus?.status ?? 'idle',
      currentTime: new Date().toISOString()
    },
    kpis: [
      { label: '总仓库数', value: String(totalReposRow.count), hint: '纳入同步范围的 GitHub 仓库' },
      { label: '近 30 天提交', value: String(totalCommitsRow.count), hint: '仅统计本人非 bot 有效提交' },
      { label: '活跃项目数', value: String(activeReposRow.count), hint: '近 30 天至少有 1 次提交' },
      { label: '近 14 天访问量', value: String(trafficRow.totalViews), hint: 'views 总和' },
      { label: '近 14 天 clone', value: String(trafficRow.totalClones), hint: 'clones 总和' }
    ],
    personalTrend: personalTrendSource.map((item) => ({
      date: item.activity_date,
      count: item.commit_count
    })),
    personalHeatmap: personalHeatmapSource.map((item) => ({
      date: item.activityDate,
      count: item.commitCount,
      repoCount: item.repoCount
    })),
    rankings: rankings.map((item) => ({
      ...item,
      score: item.score ?? 0,
      stackTags: tagsByRepo.get(item.repoId) ?? []
    })),
    languageDistribution,
    stackTags: stackRows,
    featuredRepoId: rankings[0]?.repoId ?? null
  };
}

/* 返回个人洞察卡片。 */
export function getInsights(userId: string): Array<{
  id: number;
  level: string;
  title: string;
  summary: string;
}> {
  return db
    .prepare(
      `
        SELECT id, level, title, summary
        FROM insight_cards
        WHERE user_id = ?
        ORDER BY id ASC
        LIMIT 5
      `
    )
    .all(userId) as Array<{
    id: number;
    level: string;
    title: string;
    summary: string;
  }>;
}

/* 返回首页项目活跃排行，供独立列表刷新使用。 */
export function getActiveRankings(userId: string): Array<{
  repoId: number;
  name: string;
  fullName: string;
  score: number;
  commitCount30d: number;
  activeDays30d: number;
}> {
  return getOverview(userId).rankings.map((item) => ({
    repoId: item.repoId,
    name: item.name,
    fullName: item.fullName,
    score: item.score,
    commitCount30d: item.commitCount30d,
    activeDays30d: item.activeDays30d
  }));
}

/* 返回个人热力图数据。 */
export function getPersonalHeatmap(userId: string): Array<{
  date: string;
  count: number;
  repoCount: number;
}> {
  return getOverview(userId).personalHeatmap;
}

/* 返回数据统计页所需的全局统计数据。 */
export function getStatistics(
  userId: string,
  filters?: {
    rangeDays?: 7 | 30 | 90;
    startDate?: string;
    endDate?: string;
  }
): {
  header: {
    title: string;
    githubUsername: string;
    lastSyncedAt: string | null;
    syncStatus: string;
    currentTime: string;
  };
  appliedRange: {
    mode: 'preset' | 'custom';
    days: number;
    startDate: string;
    endDate: string;
  };
  summaryCards: Array<{
    id: string;
    label: string;
    value: number;
    hint: string;
    changeText: string;
    changeDirection: 'up' | 'down' | 'flat';
  }>;
  trendDaily: Array<{ date: string; count: number }>;
  yearlyHeatmap: Array<{ date: string; count: number; repoCount: number }>;
  commitTimeHeatmap: Array<{ weekday: number; hour: number; count: number }>;
  languageDistribution: Array<{ name: string; value: number }>;
  authorDistribution: Array<{ name: string; value: number }>;
  commitTypeDistribution: Array<{ name: string; value: number }>;
  changeTrend: Array<{ date: string; positive: number; negative: number }>;
  activityDistribution: Array<{
    label: string;
    repoCount: number;
    repoShare: number;
    commitCount: number;
    commitShare: number;
  }>;
  repoRanking: Array<{
    repoId: number;
    name: string;
    commitCount: number;
    activeDays: number;
    lastCommitAt: string | null;
    contributionShare: number;
  }>;
} {
  const config = getConfig(userId);
  const range = resolveStatisticsRange(filters, config.timezone);
  const syncStatus = db
    .prepare(
      `
        SELECT status
        FROM sync_logs
        WHERE user_id = ?
        ORDER BY id DESC
        LIMIT 1
      `
    )
    .get(userId) as { status: string } | undefined;

  const totalReposRow = db
    .prepare('SELECT COUNT(*) AS count FROM repos WHERE user_id = ?')
    .get(userId) as { count: number };
  const codeVolumeRow = db
    .prepare(
      `
        SELECT COALESCE(SUM(bytes), 0) AS totalBytes
        FROM repo_languages
        WHERE repo_id IN (SELECT id FROM repos WHERE user_id = ?)
      `
    )
    .get(userId) as { totalBytes: number };

  const currentSummaryRow = db
    .prepare(
      `
        SELECT
          COALESCE(SUM(CASE WHEN is_bot = 0 AND is_merge_commit = 0 THEN 1 ELSE 0 END), 0) AS totalCommits,
          COALESCE(SUM(CASE WHEN is_bot = 0 AND is_merge_commit = 1 THEN 1 ELSE 0 END), 0) AS mergeCommits,
          COUNT(DISTINCT CASE WHEN is_bot = 0 AND is_merge_commit = 0 THEN ${"substr(commit_time, 1, 10)"} END) AS activeDays
        FROM commits
        WHERE user_id = ? AND commit_time >= ? AND commit_time < ?
      `
    )
    .get(userId, range.startIso, range.endExclusiveIso) as {
    totalCommits: number;
    mergeCommits: number;
    activeDays: number;
  };

  const previousSummaryRow = db
    .prepare(
      `
        SELECT
          COALESCE(SUM(CASE WHEN is_bot = 0 AND is_merge_commit = 0 THEN 1 ELSE 0 END), 0) AS totalCommits,
          COALESCE(SUM(CASE WHEN is_bot = 0 AND is_merge_commit = 1 THEN 1 ELSE 0 END), 0) AS mergeCommits,
          COUNT(DISTINCT CASE WHEN is_bot = 0 AND is_merge_commit = 0 THEN ${"substr(commit_time, 1, 10)"} END) AS activeDays
        FROM commits
        WHERE user_id = ? AND commit_time >= ? AND commit_time < ?
      `
    )
    .get(userId, range.previousStartIso, range.previousEndExclusiveIso) as {
    totalCommits: number;
    mergeCommits: number;
    activeDays: number;
  };

  const activeReposRow = db
    .prepare(
      `
        SELECT COUNT(DISTINCT repo_id) AS count
        FROM repo_activity_daily
        WHERE user_id = ? AND activity_date >= ? AND activity_date <= ? AND commit_count > 0
      `
    )
    .get(userId, range.startDate, range.endDate) as { count: number };

  const previousActiveReposRow = db
    .prepare(
      `
        SELECT COUNT(DISTINCT repo_id) AS count
        FROM repo_activity_daily
        WHERE user_id = ? AND activity_date >= ? AND activity_date <= ? AND commit_count > 0
      `
    )
    .get(userId, range.previousStartDate, range.previousEndDate) as { count: number };

  const totalTrendRows = db
    .prepare(
      `
        SELECT activity_date AS date, SUM(commit_count) AS count
        FROM repo_activity_daily
        WHERE user_id = ? AND activity_date >= ? AND activity_date <= ?
        GROUP BY activity_date
        ORDER BY activity_date ASC
      `
    )
    .all(userId, range.startDate, range.endDate) as Array<{ date: string; count: number }>;

  const yearlyHeatmapRows = db
    .prepare(
      `
        SELECT activity_date AS date, SUM(commit_count) AS count, COUNT(DISTINCT repo_id) AS repoCount
        FROM repo_activity_daily
        WHERE user_id = ? AND activity_date >= ?
        GROUP BY activity_date
        ORDER BY activity_date ASC
      `
    )
    .all(userId, getDayKey(subDays(new Date(), 364), config.timezone)) as Array<{
    date: string;
    count: number;
    repoCount: number;
  }>;

  const commitTimeRows = db
    .prepare(
      `
        SELECT commit_time AS commitTime
        FROM commits
        WHERE user_id = ? AND is_bot = 0 AND commit_time >= ? AND commit_time < ?
      `
    )
    .all(userId, range.startIso, range.endExclusiveIso) as Array<{ commitTime: string }>;

  const languageDistribution = db
    .prepare(
      `
        SELECT language AS name, ROUND(SUM(bytes), 2) AS value
        FROM repo_languages
        WHERE repo_id IN (SELECT id FROM repos WHERE user_id = ?)
        GROUP BY language
        ORDER BY value DESC
        LIMIT 8
      `
    )
    .all(userId) as Array<{ name: string; value: number }>;

  const authorDistributionRow = db
    .prepare(
      `
        SELECT
          COALESCE(SUM(CASE WHEN canonical_author_id = ? AND is_bot = 0 THEN 1 ELSE 0 END), 0) AS personalCount,
          COALESCE(SUM(CASE WHEN canonical_author_id <> ? AND is_bot = 0 THEN 1 ELSE 0 END), 0) AS otherCount,
          COALESCE(SUM(CASE WHEN is_bot = 1 THEN 1 ELSE 0 END), 0) AS botCount
        FROM commits
        WHERE user_id = ? AND commit_time >= ? AND commit_time < ?
      `
    )
    .get(`user:${userId}`, `user:${userId}`, userId, range.startIso, range.endExclusiveIso) as {
    personalCount: number;
    otherCount: number;
    botCount: number;
  };

  const commitTypeRow = db
    .prepare(
      `
        SELECT
          COALESCE(SUM(CASE WHEN is_bot = 0 AND is_merge_commit = 0 THEN 1 ELSE 0 END), 0) AS regularCount,
          COALESCE(SUM(CASE WHEN is_bot = 0 AND is_merge_commit = 1 THEN 1 ELSE 0 END), 0) AS mergeCount,
          COALESCE(SUM(CASE WHEN is_bot = 1 THEN 1 ELSE 0 END), 0) AS botCount
        FROM commits
        WHERE user_id = ? AND commit_time >= ? AND commit_time < ?
      `
    )
    .get(userId, range.startIso, range.endExclusiveIso) as {
    regularCount: number;
    mergeCount: number;
    botCount: number;
  };

  const changeTrendRows = db
    .prepare(
      `
        SELECT
          substr(commit_time, 1, 10) AS date,
          COALESCE(SUM(CASE WHEN is_bot = 0 AND is_merge_commit = 0 THEN 1 ELSE 0 END), 0) AS positive,
          COALESCE(SUM(CASE WHEN is_bot = 0 AND is_merge_commit = 1 THEN 1 ELSE 0 END), 0) AS negative
        FROM commits
        WHERE user_id = ? AND commit_time >= ? AND commit_time < ?
        GROUP BY substr(commit_time, 1, 10)
        ORDER BY date ASC
      `
    )
    .all(userId, range.startIso, range.endExclusiveIso) as Array<{
    date: string;
    positive: number;
    negative: number;
  }>;

  const repoActivityRows = db
    .prepare(
      `
        SELECT
          repos.id AS repoId,
          repos.name,
          COALESCE(SUM(CASE WHEN repo_activity_daily.activity_date >= @startDate AND repo_activity_daily.activity_date <= @endDate THEN repo_activity_daily.commit_count ELSE 0 END), 0) AS commitCount,
          COUNT(DISTINCT CASE WHEN repo_activity_daily.activity_date >= @startDate AND repo_activity_daily.activity_date <= @endDate THEN repo_activity_daily.activity_date END) AS activeDays,
          MAX(CASE WHEN repo_activity_daily.activity_date >= @startDate AND repo_activity_daily.activity_date <= @endDate THEN repo_activity_daily.activity_date END) AS lastCommitAt
        FROM repos
        LEFT JOIN repo_activity_daily ON repo_activity_daily.repo_id = repos.id
        WHERE repos.user_id = @userId
        GROUP BY repos.id
        ORDER BY commitCount DESC, activeDays DESC, repos.updated_at DESC
      `
    )
    .all({
      userId,
      startDate: range.startDate,
      endDate: range.endDate
    }) as Array<{
    repoId: number;
    name: string;
    commitCount: number;
    activeDays: number;
    lastCommitAt: string | null;
  }>;

  const totalCommits = currentSummaryRow.totalCommits;
  const summaryCards = [
    {
      id: 'total-commits',
      label: '提交总数',
      value: totalCommits,
      hint: `${range.days} 天范围`,
      ...buildChangeMeta(totalCommits, previousSummaryRow.totalCommits)
    },
    {
      id: 'total-repos',
      label: '总仓库数',
      value: totalReposRow.count,
      hint: '纳入同步范围',
      ...buildChangeMeta(totalReposRow.count, Math.max(0, totalReposRow.count - previousActiveReposRow.count))
    },
    {
      id: 'active-repos',
      label: '活跃项目数',
      value: activeReposRow.count,
      hint: `${range.days} 天内有提交`,
      ...buildChangeMeta(activeReposRow.count, previousActiveReposRow.count)
    },
    {
      id: 'active-days',
      label: '活跃天数',
      value: currentSummaryRow.activeDays,
      hint: `${range.days} 天范围`,
      ...buildChangeMeta(currentSummaryRow.activeDays, previousSummaryRow.activeDays)
    },
    {
      id: 'code-volume',
      label: '代码体量',
      value: codeVolumeRow.totalBytes,
      hint: '语言字节总量',
      ...buildChangeMeta(codeVolumeRow.totalBytes, codeVolumeRow.totalBytes)
    },
    {
      id: 'merge-commits',
      label: '合并提交数',
      value: currentSummaryRow.mergeCommits,
      hint: `${range.days} 天范围`,
      ...buildChangeMeta(currentSummaryRow.mergeCommits, previousSummaryRow.mergeCommits)
    }
  ];

  const commitTimeHeatmap = buildCommitTimeHeatmap(commitTimeRows, config.timezone);
  const authorDistribution = [
    { name: '个人提交', value: authorDistributionRow.personalCount },
    { name: '其他提交', value: authorDistributionRow.otherCount },
    { name: 'Bot 提交', value: authorDistributionRow.botCount }
  ];
  const commitTypeDistribution = [
    { name: '普通提交', value: commitTypeRow.regularCount },
    { name: 'Merge 提交', value: commitTypeRow.mergeCount },
    { name: 'Bot 提交', value: commitTypeRow.botCount }
  ];
  const activityDistribution = buildActivityDistribution(repoActivityRows, totalCommits);
  const repoRanking = repoActivityRows.slice(0, 5).map((item) => ({
    repoId: item.repoId,
    name: item.name,
    commitCount: item.commitCount,
    activeDays: item.activeDays,
    lastCommitAt: item.lastCommitAt,
    contributionShare: totalCommits > 0 ? Number(((item.commitCount / totalCommits) * 100).toFixed(1)) : 0
  }));

  return {
    header: {
      title: '数据统计',
      githubUsername: config.githubUsername,
      lastSyncedAt: config.lastSyncedAt,
      syncStatus: syncStatus?.status ?? 'idle',
      currentTime: new Date().toISOString()
    },
    appliedRange: {
      mode: range.mode,
      days: range.days,
      startDate: range.startDate,
      endDate: range.endDate
    },
    summaryCards,
    trendDaily: totalTrendRows,
    yearlyHeatmap: yearlyHeatmapRows,
    commitTimeHeatmap,
    languageDistribution,
    authorDistribution,
    commitTypeDistribution,
    changeTrend: changeTrendRows,
    activityDistribution,
    repoRanking
  };
}

function resolveStatisticsRange(
  filters: {
    rangeDays?: 7 | 30 | 90;
    startDate?: string;
    endDate?: string;
  } | undefined,
  timezone: string
): StatisticsRange {
  const customStart = filters?.startDate?.trim() ?? '';
  const customEnd = filters?.endDate?.trim() ?? '';

  if (customStart && customEnd) {
    if (customStart > customEnd) {
      throw new Error('自定义时间范围不合法');
    }

    const dayCount = differenceInCalendarDays(new Date(customEnd), new Date(customStart)) + 1;
    const previousEnd = getDayKey(subDays(new Date(customStart), 1), timezone);
    const previousStart = getDayKey(subDays(new Date(customStart), dayCount), timezone);

    return {
      mode: 'custom',
      days: dayCount,
      startDate: customStart,
      endDate: customEnd,
      startIso: buildRangeBoundaryIso(customStart, timezone),
      endExclusiveIso: buildRangeBoundaryIso(getDayKey(addDays(new Date(customEnd), 1), timezone), timezone),
      previousStartDate: previousStart,
      previousEndDate: previousEnd,
      previousStartIso: buildRangeBoundaryIso(previousStart, timezone),
      previousEndExclusiveIso: buildRangeBoundaryIso(customStart, timezone)
    };
  }

  const days = filters?.rangeDays ?? 30;
  const endDate = getDayKey(new Date(), timezone);
  const startDate = getDayKey(subDays(new Date(), days - 1), timezone);
  const previousEndDate = getDayKey(subDays(new Date(startDate), 1), timezone);
  const previousStartDate = getDayKey(subDays(new Date(startDate), days), timezone);

  return {
    mode: 'preset',
    days,
    startDate,
    endDate,
    startIso: buildRangeBoundaryIso(startDate, timezone),
    endExclusiveIso: buildRangeBoundaryIso(getDayKey(addDays(new Date(endDate), 1), timezone), timezone),
    previousStartDate,
    previousEndDate,
    previousStartIso: buildRangeBoundaryIso(previousStartDate, timezone),
    previousEndExclusiveIso: buildRangeBoundaryIso(startDate, timezone)
  };
}

function buildRangeBoundaryIso(dayKey: string, timezone: string): string {
  return fromZonedTime(`${dayKey}T00:00:00`, timezone).toISOString();
}

function buildChangeMeta(
  current: number,
  previous: number
): {
  changeText: string;
  changeDirection: 'up' | 'down' | 'flat';
} {
  if (current === previous) {
    return {
      changeText: '较上期 持平',
      changeDirection: 'flat'
    };
  }

  if (previous <= 0) {
    return {
      changeText: `较上期 ↑ ${current - previous}`,
      changeDirection: 'up'
    };
  }

  const ratio = Math.abs(((current - previous) / previous) * 100);
  return {
    changeText: `较上期 ${current > previous ? '↑' : '↓'} ${ratio.toFixed(1)}%`,
    changeDirection: current > previous ? 'up' : 'down'
  };
}

function buildCommitTimeHeatmap(
  rows: Array<{ commitTime: string }>,
  timezone: string
): Array<{ weekday: number; hour: number; count: number }> {
  const countMap = new Map<string, number>();

  rows.forEach((item) => {
    const weekday = Number(formatInTimeZone(item.commitTime, timezone, 'i')) - 1;
    const hour = Number(formatInTimeZone(item.commitTime, timezone, 'H'));
    const key = `${weekday}-${hour}`;
    countMap.set(key, (countMap.get(key) ?? 0) + 1);
  });

  const result: Array<{ weekday: number; hour: number; count: number }> = [];

  for (let weekday = 0; weekday < 7; weekday += 1) {
    for (let hour = 0; hour < 24; hour += 1) {
      const key = `${weekday}-${hour}`;
      result.push({
        weekday,
        hour,
        count: countMap.get(key) ?? 0
      });
    }
  }

  return result;
}

function buildActivityDistribution(
  rows: Array<{
    repoId: number;
    name: string;
    commitCount: number;
    activeDays: number;
    lastCommitAt: string | null;
  }>,
  totalCommits: number
): Array<{
  label: string;
  repoCount: number;
  repoShare: number;
  commitCount: number;
  commitShare: number;
}> {
  const buckets = [
    { label: '高活跃（>100）', match: (value: number) => value > 100 },
    { label: '中活跃（20-100）', match: (value: number) => value >= 20 && value <= 100 },
    { label: '低活跃（5-20）', match: (value: number) => value >= 5 && value < 20 },
    { label: '不活跃（1-5）', match: (value: number) => value >= 1 && value < 5 },
    { label: '无提交（0）', match: (value: number) => value === 0 }
  ];

  const totalRepos = rows.length;

  return buckets.map((bucket) => {
    const matchedRows = rows.filter((item) => bucket.match(item.commitCount));
    const commitCount = matchedRows.reduce((sum, item) => sum + item.commitCount, 0);

    return {
      label: bucket.label,
      repoCount: matchedRows.length,
      repoShare: totalRepos > 0 ? Number(((matchedRows.length / totalRepos) * 100).toFixed(1)) : 0,
      commitCount,
      commitShare: totalCommits > 0 ? Number(((commitCount / totalCommits) * 100).toFixed(1)) : 0
    };
  });
}
