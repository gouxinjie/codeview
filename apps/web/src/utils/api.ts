import { useAppStore } from '@/store/appStore';
import type {
  ApiResponse,
  ConfigPayload,
  ConfigView,
  HeatmapCell,
  InsightCard,
  OverviewData,
  RepoActivityPoint,
  RepoRecentCommit,
  RepoDetail,
  RepoListItem,
  RepoStackDetail,
  RepoTrafficPoint,
  StatisticsData,
  SyncStatus
} from '@/types/api';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3101/api';

type QueryValue = string | number | boolean | undefined;

interface RequestOptions {
  method?: 'GET' | 'POST';
  query?: Record<string, QueryValue>;
  body?: object;
}

function buildUrl(path: string, query?: Record<string, QueryValue>): string {
  const url = new URL(`${apiBaseUrl}${path}`);
  const userId = useAppStore.getState().userId;

  url.searchParams.set('userId', userId);

  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }
  }

  return url.toString();
}

async function requestApi<T>(path: string, options?: RequestOptions): Promise<T> {
  const state = useAppStore.getState();
  const response = await fetch(buildUrl(path, options?.query), {
    method: options?.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(options?.method === 'POST' && state.csrfToken ? { 'x-csrf-token': state.csrfToken } : {})
    },
    body:
      options?.method === 'POST'
        ? JSON.stringify({
            userId: state.userId,
            ...(options.body ?? {})
          })
        : undefined
  });

  const payload = (await response.json()) as ApiResponse<T>;

  if (!payload.success) {
    throw new Error(payload.message);
  }

  return payload.data;
}

/* 读取当前用户配置。 */
export function fetchConfig(): Promise<ConfigView> {
  return requestApi<ConfigView>('/config');
}

/* 保存配置。 */
export function saveConfig(payload: ConfigPayload): Promise<ConfigView> {
  return requestApi<ConfigView>('/config', {
    method: 'POST',
    body: payload
  });
}

/* 触发全量同步。 */
export function triggerFullSync(): Promise<SyncStatus> {
  return requestApi<SyncStatus>('/sync/full', {
    method: 'POST'
  });
}

/* 触发增量同步。 */
export function triggerIncrementalSync(): Promise<SyncStatus> {
  return requestApi<SyncStatus>('/sync/incremental', {
    method: 'POST'
  });
}

/* 查询同步状态。 */
export function fetchSyncStatus(): Promise<SyncStatus> {
  return requestApi<SyncStatus>('/sync/status');
}

/* 获取首页总览。 */
export function fetchOverview(): Promise<OverviewData> {
  return requestApi<OverviewData>('/overview');
}

/* 获取洞察卡片。 */
export function fetchInsights(): Promise<InsightCard[]> {
  return requestApi<InsightCard[]>('/insights');
}

/* 获取仓库列表。 */
export function fetchRepositories(filters: {
  search?: string;
  language?: string;
  stackTag?: string;
  sortBy?: 'activity' | 'updated';
}): Promise<RepoListItem[]> {
  return requestApi<RepoListItem[]>('/repos', {
    query: filters
  });
}

/* 获取仓库详情。 */
export function fetchRepositoryDetail(repoId: number): Promise<RepoDetail> {
  return requestApi<RepoDetail>(`/repos/${repoId}`);
}

/* 获取仓库趋势。 */
export function fetchRepositoryActivity(
  repoId: number,
  granularity: 'day' | 'week' | 'month'
): Promise<RepoActivityPoint[]> {
  return requestApi<RepoActivityPoint[]>(`/repos/${repoId}/activity`, {
    query: {
      granularity
    }
  });
}

/* 获取仓库热力图。 */
export function fetchRepositoryHeatmap(repoId: number): Promise<HeatmapCell[]> {
  return requestApi<HeatmapCell[]>(`/repos/${repoId}/heatmap`);
}

/* 获取仓库技术栈。 */
export function fetchRepositoryStack(repoId: number): Promise<RepoStackDetail> {
  return requestApi<RepoStackDetail>(`/repos/${repoId}/stack`);
}

/* 获取仓库流量。 */
export function fetchRepositoryTraffic(repoId: number): Promise<RepoTrafficPoint[]> {
  return requestApi<RepoTrafficPoint[]>(`/repos/${repoId}/traffic`);
}

/* 获取仓库最近提交记录。 */
export function fetchRepositoryRecentCommits(repoId: number): Promise<RepoRecentCommit[]> {
  return requestApi<RepoRecentCommit[]>(`/repos/${repoId}/commits/recent`);
}

/* 获取数据统计页聚合数据。 */
export function fetchStatistics(filters?: {
  rangeDays?: 7 | 30 | 90;
  startDate?: string;
  endDate?: string;
}): Promise<StatisticsData> {
  return requestApi<StatisticsData>('/statistics', {
    query: filters
  });
}
