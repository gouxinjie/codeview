import { escapeHtml } from '../../utils/security';

interface GitHubUserResponse {
  login: string;
}

export interface GitHubRepoResponse {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  private: boolean;
  default_branch: string;
  html_url: string;
  stargazers_count: number;
  forks_count: number;
  language: string | null;
  created_at: string;
  updated_at: string;
  pushed_at: string | null;
  owner: {
    login: string;
  };
  topics?: string[];
}

interface GitHubCommitItem {
  sha: string;
  commit: {
    author: {
      name: string | null;
      email: string | null;
      date: string | null;
    } | null;
    message: string;
  };
  author: {
    login: string;
  } | null;
  parents: Array<{ sha: string }>;
}

interface GitHubTrafficItem {
  timestamp: string;
  count: number;
  uniques: number;
}

interface GitHubTrafficResponse {
  views?: GitHubTrafficItem[];
  clones?: GitHubTrafficItem[];
}

interface GitHubFileResponse {
  content: string;
  encoding: string;
}

const KEY_FILES = [
  'package.json',
  'requirements.txt',
  'pyproject.toml',
  'go.mod',
  'pom.xml',
  'Cargo.toml',
  'Dockerfile'
] as const;

async function requestGitHub<T>(token: string, path: string): Promise<T> {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'User-Agent': 'Asset-Console'
    }
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`GitHub 请求失败：${response.status} ${message}`);
  }

  return (await response.json()) as T;
}

/* 拉取当前 Token 对应的 GitHub 用户信息。 */
export async function fetchGitHubUser(token: string): Promise<GitHubUserResponse> {
  return requestGitHub<GitHubUserResponse>(token, '/user');
}

/* 拉取 GitHub 仓库列表，并按更新时间降序返回。 */
export async function fetchGitHubRepos(
  token: string,
  includePrivateRepos: boolean
): Promise<GitHubRepoResponse[]> {
  const repositories: GitHubRepoResponse[] = [];
  let page = 1;

  while (true) {
    const visibilityQuery = includePrivateRepos ? 'visibility=all' : 'visibility=public';
    const items = await requestGitHub<GitHubRepoResponse[]>(
      token,
      `/user/repos?per_page=100&page=${page}&sort=updated&direction=desc&${visibilityQuery}`
    );

    repositories.push(...items);

    if (items.length < 100) {
      break;
    }

    page += 1;
  }

  return repositories;
}

/* 拉取仓库语言分布，用于技术栈画像和语言占比。 */
export async function fetchRepoLanguages(
  token: string,
  owner: string,
  repo: string
): Promise<Record<string, number>> {
  return requestGitHub<Record<string, number>>(token, `/repos/${owner}/${repo}/languages`);
}

/* 拉取仓库提交记录，支持按时间增量同步。 */
export async function fetchRepoCommits(
  token: string,
  owner: string,
  repo: string,
  since?: string
): Promise<GitHubCommitItem[]> {
  const commits: GitHubCommitItem[] = [];
  let page = 1;

  while (true) {
    const sinceQuery = since ? `&since=${encodeURIComponent(since)}` : '';
    const items = await requestGitHub<GitHubCommitItem[]>(
      token,
      `/repos/${owner}/${repo}/commits?per_page=100&page=${page}${sinceQuery}`
    );

    commits.push(...items);

    if (items.length < 100) {
      break;
    }

    page += 1;
  }

  return commits;
}

/* 拉取仓库近 14 天流量数据，若权限不足则降级为空。 */
export async function fetchRepoTraffic(
  token: string,
  owner: string,
  repo: string
): Promise<GitHubTrafficResponse> {
  try {
    const [views, clones] = await Promise.all([
      requestGitHub<{ views: GitHubTrafficItem[] }>(token, `/repos/${owner}/${repo}/traffic/views`),
      requestGitHub<{ clones: GitHubTrafficItem[] }>(token, `/repos/${owner}/${repo}/traffic/clones`)
    ]);

    return {
      views: views.views,
      clones: clones.clones
    };
  } catch {
    return {};
  }
}

/* 拉取关键文件快照，用于技术栈识别规则。 */
export async function fetchRepoFiles(
  token: string,
  owner: string,
  repo: string
): Promise<Array<{ filePath: string; content: string }>> {
  const files: Array<{ filePath: string; content: string }> = [];

  for (const filePath of KEY_FILES) {
    try {
      const payload = await requestGitHub<GitHubFileResponse | GitHubFileResponse[]>(
        token,
        `/repos/${owner}/${repo}/contents/${filePath}`
      );

      if (Array.isArray(payload)) {
        continue;
      }

      const content =
        payload.encoding === 'base64'
          ? Buffer.from(payload.content, 'base64').toString('utf8')
          : payload.content;

      files.push({
        filePath,
        content: escapeHtml(content)
      });
    } catch {
      continue;
    }
  }

  return files;
}

/* 将 GitHub traffic 接口数据整理为按天结构，便于入库。 */
export function mergeTrafficByDate(payload: GitHubTrafficResponse): Array<{
  trafficDate: string;
  viewsCount: number;
  uniqueVisitors: number;
  clonesCount: number;
}> {
  const trafficMap = new Map<
    string,
    {
      trafficDate: string;
      viewsCount: number;
      uniqueVisitors: number;
      clonesCount: number;
    }
  >();

  for (const item of payload.views ?? []) {
    const key = item.timestamp.slice(0, 10);
    trafficMap.set(key, {
      trafficDate: key,
      viewsCount: item.count,
      uniqueVisitors: item.uniques,
      clonesCount: trafficMap.get(key)?.clonesCount ?? 0
    });
  }

  for (const item of payload.clones ?? []) {
    const key = item.timestamp.slice(0, 10);
    const existing = trafficMap.get(key);

    trafficMap.set(key, {
      trafficDate: key,
      viewsCount: existing?.viewsCount ?? 0,
      uniqueVisitors: existing?.uniqueVisitors ?? 0,
      clonesCount: item.count
    });
  }

  return [...trafficMap.values()].sort((left, right) =>
    left.trafficDate.localeCompare(right.trafficDate)
  );
}

