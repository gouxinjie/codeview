/* 前端统一接口类型定义，保证请求和页面状态都有明确类型。 */
export interface ApiSuccess<T> {
  success: true;
  code: 200;
  message: '操作成功';
  data: T;
}

export interface ApiFailure {
  success: false;
  code: string;
  message: string;
  data: null;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export interface ConfigView {
  userId: string;
  githubUsername: string;
  hasToken: boolean;
  emailAliases: string[];
  includePrivateRepos: boolean;
  syncIntervalMinutes: number;
  defaultTimeRange: string;
  timezone: string;
  csrfToken: string;
  lastSyncedAt: string | null;
  canManage: boolean;
  adminConfigured: boolean;
}

export interface AdminSessionView {
  authenticated: boolean;
  adminConfigured: boolean;
  loginCsrfToken: string;
  adminUsername: string;
}

export interface ConfigPayload {
  githubUsername: string;
  githubToken?: string;
  emailAliases: string[];
  includePrivateRepos: boolean;
  syncIntervalMinutes: number;
  defaultTimeRange: '30d' | '90d' | '180d' | '365d';
  timezone: string;
}

export interface SyncStatus {
  userId: string;
  status: string;
  message: string;
  startedAt: string | null;
  finishedAt: string | null;
  scope: string | null;
  progressTotal: number;
  progressCompleted: number;
  currentRepository: string | null;
  updatedAt: string | null;
}

export interface OverviewKpi {
  label: string;
  value: string;
  hint: string;
}

export interface HeatmapCell {
  date: string;
  count: number;
  repoCount: number;
}

export interface RankingItem {
  repoId: number;
  name: string;
  fullName: string;
  commitCount30d: number;
  activeDays30d: number;
  lastCommitAt: string | null;
  score: number;
  starsCount: number;
  stackTags: string[];
}

export interface OverviewData {
  header: {
    title: string;
    githubUsername: string;
    lastSyncedAt: string | null;
    syncStatus: string;
    currentTime: string;
  };
  kpis: OverviewKpi[];
  personalTrend: Array<{ date: string; count: number }>;
  personalHeatmap: HeatmapCell[];
  rankings: RankingItem[];
  languageDistribution: Array<{ name: string; value: number }>;
  stackTags: Array<{ tag: string; usageCount: number }>;
  featuredRepoId: number | null;
}

export interface InsightCard {
  id: number;
  level: string;
  title: string;
  summary: string;
}

export interface RepoListItem {
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
}

export interface RepoDetail {
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
}

export interface RepoActivityPoint {
  label: string;
  count: number;
}

export interface RepoStackDetail {
  tags: Array<{ tag: string; confidence: number; source: string }>;
  files: Array<{ filePath: string }>;
}

export interface RepoTrafficPoint {
  date: string;
  views: number;
  visitors: number;
  clones: number;
}

export interface RepoRecentCommit {
  sha: string;
  message: string;
  authorName: string;
  authorLogin: string | null;
  commitTime: string;
}

export type StackAnalysisTrendDirection = 'up' | 'down' | 'flat';

export interface StackAnalysisSummaryCard {
  id: string;
  label: string;
  value: string;
  hint: string;
  trend: string;
  trendDirection: StackAnalysisTrendDirection;
}

export interface StackAnalysisLanguageItem {
  name: string;
  bytes: number;
  percentage: number;
}

export interface StackAnalysisCategoryItem {
  name: string;
  techCount: number;
  percentage: number;
}

export interface StackAnalysisTopTechItem {
  name: string;
  category: string;
  repoCount: number;
  activeRepoCount: number;
  percentage: number;
  heat: number;
  trend: number;
  commitCount30d: number;
}

export interface StackAnalysisTrendSeriesItem {
  name: string;
  category: string;
  values: number[];
}

export interface StackAnalysisEmergingTechItem {
  name: string;
  category: string;
  firstSeenAt: string;
  repoCount: number;
  representativeRepo: string;
}

export interface StackAnalysisMatrixRow {
  repoId: number;
  repoName: string;
  activeDays30d: number;
  commitCount30d: number;
  intensityLabel: string;
  values: number[];
}

export interface StackAnalysisRelationItem {
  source: string;
  target: string;
  weight: number;
}

export interface StackAnalysisData {
  header: {
    title: string;
    githubUsername: string;
    lastSyncedAt: string | null;
    syncStatus: string;
    currentTime: string;
  };
  appliedWindow: {
    months: number;
    startMonth: string;
    endMonth: string;
  };
  summaryCards: StackAnalysisSummaryCard[];
  languageDistribution: StackAnalysisLanguageItem[];
  categoryDistribution: StackAnalysisCategoryItem[];
  topTechStacks: StackAnalysisTopTechItem[];
  trendMonths: string[];
  trendSeries: StackAnalysisTrendSeriesItem[];
  emergingTechStacks: StackAnalysisEmergingTechItem[];
  matrixColumns: string[];
  projectMatrix: StackAnalysisMatrixRow[];
  relationships: StackAnalysisRelationItem[];
}

export interface StatisticsSummaryCard {
  id: string;
  label: string;
  value: number;
  hint: string;
  changeText: string;
  changeDirection: 'up' | 'down' | 'flat';
}

export interface StatisticsTimeHeatCell {
  weekday: number;
  hour: number;
  count: number;
}

export interface StatisticsBreakdownItem {
  name: string;
  value: number;
}

export interface StatisticsActivityDistributionRow {
  label: string;
  repoCount: number;
  repoShare: number;
  commitCount: number;
  commitShare: number;
}

export interface StatisticsRepoRankingRow {
  repoId: number;
  name: string;
  commitCount: number;
  activeDays: number;
  lastCommitAt: string | null;
  contributionShare: number;
}

export interface StatisticsData {
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
    historyCoverage: {
      availableStartDate: string | null;
      availableDays: number;
      isCurrentRangeComplete: boolean;
      isPreviousRangeComplete: boolean;
    };
  };
  summaryCards: StatisticsSummaryCard[];
  trendDaily: Array<{ date: string; count: number }>;
  yearlyHeatmap: HeatmapCell[];
  commitTimeHeatmap: StatisticsTimeHeatCell[];
  languageDistribution: Array<{ name: string; value: number }>;
  authorDistribution: StatisticsBreakdownItem[];
  commitTypeDistribution: StatisticsBreakdownItem[];
  changeTrend: Array<{ date: string; positive: number; negative: number }>;
  activityDistribution: StatisticsActivityDistributionRow[];
  repoRanking: StatisticsRepoRankingRow[];
}
