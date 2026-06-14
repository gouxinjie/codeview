import { subDays, subMonths } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';
import { db } from '@/database/client';
import { getConfig } from '@/modules/config/config.service';
import { getDayKey } from '@/utils/time';

type StackCategory = '语言' | '前端' | '后端' | '数据层' | '工程化' | '其他';

interface RepoBaseRow {
  repoId: number;
  repoName: string;
  fullName: string;
  mainLanguage: string;
  createdAt: string;
  updatedAt: string;
  commitCount30d: number;
  activeDays30d: number;
}

interface RepoLanguageRow {
  repoId: number;
  language: string;
  bytes: number;
  percentage: number;
}

interface RepoTagRow {
  repoId: number;
  tag: string;
}

interface RepoFileRow {
  repoId: number;
  filePath: string;
  content: string;
}

interface RepoMonthlyActivityRow {
  repoId: number;
  monthKey: string;
  commitCount: number;
}

interface TechAggregate {
  name: string;
  category: StackCategory;
  repoIds: Set<number>;
  explicitRepoIds: Set<number>;
  activeRepoIds: Set<number>;
  commitCount30d: number;
  firstSeenAt: string;
  representativeRepo: string;
  monthlyActivity: Map<string, number>;
}

interface CategoryAggregate {
  name: StackCategory;
  techCount: number;
  percentage: number;
}

interface TopTechItem {
  name: string;
  category: StackCategory;
  repoCount: number;
  activeRepoCount: number;
  percentage: number;
  heat: number;
  trend: number;
  commitCount30d: number;
}

interface EmergingTechItem {
  name: string;
  category: StackCategory;
  firstSeenAt: string;
  repoCount: number;
  representativeRepo: string;
}

interface MatrixRow {
  repoId: number;
  repoName: string;
  activeDays30d: number;
  commitCount30d: number;
  intensityLabel: string;
  values: number[];
}

interface RelationItem {
  source: string;
  target: string;
  weight: number;
}

const CATEGORY_ORDER: StackCategory[] = ['语言', '前端', '后端', '数据层', '工程化', '其他'];
const LOW_SIGNAL_RANKING_TECHS = new Set(['HTML', 'CSS', 'SCSS', 'Shell', 'Batchfile', 'PowerShell', 'Jupyter Notebook']);
const LOW_SIGNAL_EMERGING_TECHS = new Set(['HTML', 'CSS', 'SCSS', 'Shell', 'Batchfile', 'PowerShell']);
const MATRIX_EXCLUDED_TECHS = new Set(['HTML', 'CSS', 'SCSS', 'JavaScript', 'Shell', 'Batchfile', 'PowerShell', 'Jupyter Notebook']);
const RELATION_EXCLUDED_TECHS = new Set(['HTML', 'CSS', 'SCSS', 'JavaScript', 'Shell', 'Batchfile', 'PowerShell']);
const CATEGORY_HEAT_FACTOR: Record<StackCategory, number> = {
  '语言': 0.9,
  '前端': 1.14,
  '后端': 1.12,
  '数据层': 1.08,
  '工程化': 1.02,
  '其他': 0.96
};

const TECHNOLOGY_ALIASES: Record<string, string | string[]> = {
  'typescript': 'TypeScript',
  'javascript': 'JavaScript',
  'python': 'Python',
  'rust': 'Rust',
  'go': 'Go',
  'java': 'Java',
  'html': 'HTML',
  'css': 'CSS',
  'scss': 'SCSS',
  'shell': 'Shell',
  'powershell': 'PowerShell',
  'batchfile': 'Batchfile',
  'jupyter notebook': 'Jupyter Notebook',
  'plpgsql': 'PLpgSQL',
  'react + vite': ['React', 'Vite'],
  'react+vite': ['React', 'Vite'],
  'react': 'React',
  'react-dom': 'React',
  'react router': 'React Router',
  'react-router': 'React Router',
  'react-router-dom': 'React Router',
  'vue': 'Vue',
  'next': 'Next.js',
  'next.js': 'Next.js',
  'nuxt': 'Nuxt',
  'vite': 'Vite',
  'vitepress': 'VitePress',
  'tailwind css': 'Tailwind CSS',
  'tailwindcss': 'Tailwind CSS',
  'zustand': 'Zustand',
  'echarts': 'ECharts',
  'node': 'Node.js',
  'node.js': 'Node.js',
  'nodejs': 'Node.js',
  'express': 'Express',
  'fastapi': 'FastAPI',
  'bun': 'Bun',
  'sqlite': 'SQLite',
  'postgresql': 'PostgreSQL',
  'postgres': 'PostgreSQL',
  'prisma': 'Prisma',
  'drizzle': 'Drizzle ORM',
  'drizzle orm': 'Drizzle ORM',
  'docker': 'Docker',
  'dockerfile': 'Docker',
  'expo': 'Expo',
  'github actions': 'GitHub Actions'
};

/**
 * 函数说明：聚合技术栈分析页所需的所有统计数据。
 * 参数说明：`userId` 为当前用户标识；`months` 为趋势窗口月份数。
 * 返回说明：返回技术栈概览、趋势、热度、项目矩阵和关联关系等聚合结果。
 */
export function getStackAnalysis(
  userId: string,
  months: 6 | 12 | 24 = 12
): {
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
  summaryCards: Array<{
    id: string;
    label: string;
    value: string;
    hint: string;
    trend: string;
    trendDirection: 'up' | 'down' | 'flat';
  }>;
  languageDistribution: Array<{
    name: string;
    bytes: number;
    percentage: number;
  }>;
  categoryDistribution: CategoryAggregate[];
  topTechStacks: TopTechItem[];
  trendMonths: string[];
  trendSeries: Array<{
    name: string;
    category: StackCategory;
    values: number[];
  }>;
  emergingTechStacks: EmergingTechItem[];
  matrixColumns: string[];
  projectMatrix: MatrixRow[];
  relationships: RelationItem[];
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

  const monthKeys = buildMonthKeys(config.timezone, months);
  const recentMonthKeys = monthKeys.slice(-3);
  const previousMonthKeys = monthKeys.slice(Math.max(0, monthKeys.length - 6), Math.max(0, monthKeys.length - 3));
  const recentStartDate = getDayKey(subDays(new Date(), 29), config.timezone);
  const windowStartDate = buildWindowStartDate(monthKeys[0], config.timezone);

  const repoRows = db
    .prepare(
      `
        SELECT
          repos.id AS repoId,
          repos.name AS repoName,
          repos.full_name AS fullName,
          repos.main_language AS mainLanguage,
          repos.created_at AS createdAt,
          repos.updated_at AS updatedAt,
          COALESCE(SUM(CASE WHEN repo_activity_daily.activity_date >= @recentStartDate THEN repo_activity_daily.commit_count ELSE 0 END), 0) AS commitCount30d,
          COUNT(DISTINCT CASE WHEN repo_activity_daily.activity_date >= @recentStartDate THEN repo_activity_daily.activity_date END) AS activeDays30d
        FROM repos
        LEFT JOIN repo_activity_daily ON repo_activity_daily.repo_id = repos.id
        WHERE repos.user_id = @userId
        GROUP BY repos.id
        ORDER BY commitCount30d DESC, activeDays30d DESC, repos.updated_at DESC
      `
    )
    .all({
      userId,
      recentStartDate
    }) as RepoBaseRow[];

  const languageRows = db
    .prepare(
      `
        SELECT
          repo_languages.repo_id AS repoId,
          repo_languages.language AS language,
          repo_languages.bytes AS bytes,
          repo_languages.percentage AS percentage
        FROM repo_languages
        INNER JOIN repos ON repos.id = repo_languages.repo_id
        WHERE repos.user_id = ?
      `
    )
    .all(userId) as RepoLanguageRow[];

  const tagRows = db
    .prepare(
      `
        SELECT
          repo_stack_tags.repo_id AS repoId,
          repo_stack_tags.tag AS tag
        FROM repo_stack_tags
        INNER JOIN repos ON repos.id = repo_stack_tags.repo_id
        WHERE repos.user_id = ?
      `
    )
    .all(userId) as RepoTagRow[];

  const fileRows = db
    .prepare(
      `
        SELECT
          repo_files_snapshot.repo_id AS repoId,
          repo_files_snapshot.file_path AS filePath,
          repo_files_snapshot.content AS content
        FROM repo_files_snapshot
        INNER JOIN repos ON repos.id = repo_files_snapshot.repo_id
        WHERE repos.user_id = ?
      `
    )
    .all(userId) as RepoFileRow[];

  const monthlyRows = db
    .prepare(
      `
        SELECT
          repo_id AS repoId,
          month_key AS monthKey,
          commit_count AS commitCount
        FROM repo_activity_monthly
        WHERE user_id = ? AND month_key >= ? AND month_key <= ?
        ORDER BY month_key ASC
      `
    )
    .all(userId, monthKeys[0], monthKeys[monthKeys.length - 1]) as RepoMonthlyActivityRow[];

  const tagsByRepo = groupValuesByRepo(tagRows, (item) => item.tag);
  const filesByRepo = groupValuesByRepo(fileRows, (item) => item);
  const languagesByRepo = groupValuesByRepo(languageRows, (item) => item);
  const monthlyByRepo = buildMonthlyMap(monthlyRows);

  const repoTechnologies = new Map<number, string[]>();
  const repoExplicitTechnologies = new Map<number, string[]>();
  const repoTechnologyStrengths = new Map<number, Map<string, number>>();

  repoRows.forEach((repo) => {
    const technologies = new Set<string>();
    const explicitTechnologies = new Set<string>();

    collectTechnologyTokens(repo.mainLanguage).forEach((item) => technologies.add(item));
    (languagesByRepo.get(repo.repoId) ?? []).forEach((item) => {
      if (item.percentage >= 6) {
        collectTechnologyTokens(item.language).forEach((name) => technologies.add(name));
      }
    });
    (tagsByRepo.get(repo.repoId) ?? []).forEach((item) => {
      collectTechnologyTokens(item).forEach((name) => {
        technologies.add(name);
        explicitTechnologies.add(name);
      });
    });
    (filesByRepo.get(repo.repoId) ?? []).forEach((item) => {
      inferTechnologiesFromFile(item.filePath, item.content).forEach((name) => {
        technologies.add(name);
        explicitTechnologies.add(name);
      });
    });

    repoTechnologies.set(repo.repoId, [...technologies]);
    repoExplicitTechnologies.set(repo.repoId, [...explicitTechnologies]);
    repoTechnologyStrengths.set(
      repo.repoId,
      buildRepoTechnologyStrengths(
        repo.mainLanguage,
        languagesByRepo.get(repo.repoId) ?? [],
        explicitTechnologies,
        technologies
      )
    );
  });

  const techAggregates = new Map<string, TechAggregate>();

  repoRows.forEach((repo) => {
    const technologies = repoTechnologies.get(repo.repoId) ?? [];
    const explicitTechnologies = new Set(repoExplicitTechnologies.get(repo.repoId) ?? []);
    const technologyStrengths = repoTechnologyStrengths.get(repo.repoId) ?? new Map<string, number>();
    const totalTechnologyStrength = sumTechnologyStrengths(technologyStrengths);
    const monthActivity = monthlyByRepo.get(repo.repoId) ?? new Map<string, number>();

    technologies.forEach((technology) => {
      const existing = techAggregates.get(technology);
      const aggregate =
        existing ??
        {
          name: technology,
          category: getTechnologyCategory(technology),
          repoIds: new Set<number>(),
          explicitRepoIds: new Set<number>(),
          activeRepoIds: new Set<number>(),
          commitCount30d: 0,
          firstSeenAt: repo.createdAt,
          representativeRepo: repo.repoName,
          monthlyActivity: new Map<string, number>()
        };

      aggregate.repoIds.add(repo.repoId);
      aggregate.commitCount30d += repo.commitCount30d;

      if (explicitTechnologies.has(technology)) {
        aggregate.explicitRepoIds.add(repo.repoId);
      }

      if (repo.commitCount30d > 0) {
        aggregate.activeRepoIds.add(repo.repoId);
      }

      if (new Date(repo.createdAt).getTime() < new Date(aggregate.firstSeenAt).getTime()) {
        aggregate.firstSeenAt = repo.createdAt;
        aggregate.representativeRepo = repo.repoName;
      }

      monthKeys.forEach((monthKey) => {
        const currentCount = aggregate.monthlyActivity.get(monthKey) ?? 0;
        const monthlyCommitCount = monthActivity.get(monthKey) ?? 0;
        const technologyStrength = technologyStrengths.get(technology) ?? 0;
        const weightedMonthlyCommitCount =
          totalTechnologyStrength > 0
            ? (monthlyCommitCount * technologyStrength) / totalTechnologyStrength
            : 0;

        aggregate.monthlyActivity.set(monthKey, currentCount + weightedMonthlyCommitCount);
      });

      techAggregates.set(technology, aggregate);
    });
  });

  const totalLanguageBytes = languageRows.reduce((sum, item) => sum + item.bytes, 0);
  const languageBytesMap = new Map<string, number>();

  languageRows.forEach((item) => {
    languageBytesMap.set(item.language, (languageBytesMap.get(item.language) ?? 0) + item.bytes);
  });

  const languageDistribution = [...languageBytesMap.entries()]
    .map(([language, bytes]) => ({
      name: language,
      bytes,
      percentage: totalLanguageBytes > 0 ? Number(((bytes / totalLanguageBytes) * 100).toFixed(1)) : 0
    }))
    .sort((left, right) => right.bytes - left.bytes)
    .slice(0, 8);

  const categoryDistribution = buildCategoryDistribution(techAggregates);
  const topTechStacks = buildTopTechStacks(techAggregates, repoRows.length, recentMonthKeys, previousMonthKeys);
  const trendSeries = buildTrendSeries(topTechStacks, techAggregates, monthKeys, monthlyRows);
  const emergingTechStacks = buildEmergingTechStacks(techAggregates, windowStartDate);
  const matrixColumns = topTechStacks
    .filter((item) => !MATRIX_EXCLUDED_TECHS.has(item.name))
    .slice(0, 6)
    .map((item) => item.name);
  const projectMatrix = buildProjectMatrix(repoRows, repoTechnologies, repoTechnologyStrengths, matrixColumns);
  const relationships = buildTechnologyRelationships(
    repoTechnologies,
    topTechStacks
      .filter((item) => !RELATION_EXCLUDED_TECHS.has(item.name))
      .slice(0, 10)
      .map((item) => item.name)
  );

  const primaryLanguage = languageDistribution[0];
  const activeTechCount = [...techAggregates.values()].filter((item) => item.activeRepoIds.size > 0).length;
  const newTechCount = emergingTechStacks.filter((item) => new Date(item.firstSeenAt).getTime() >= windowStartDate.getTime()).length;
  const hotTechCount = topTechStacks.filter((item) => item.heat >= 70).length;
  const summaryCards: Array<{
    id: string;
    label: string;
    value: string;
    hint: string;
    trend: string;
    trendDirection: 'up' | 'down' | 'flat';
  }> = [
    {
      id: 'primary-language',
      label: '主要编程语言',
      value: primaryLanguage?.name ?? '--',
      hint: '按总代码字节统计',
      trend: primaryLanguage ? `${primaryLanguage.percentage.toFixed(1)}% 占比` : '暂无语言数据',
      trendDirection: 'flat' as const
    },
    {
      id: 'total-tech',
      label: '技术栈总数',
      value: String(techAggregates.size),
      hint: '语言、框架、运行时与工具去重后统计',
      trend: `${categoryDistribution.length} 个分类`,
      trendDirection: 'up' as const
    },
    {
      id: 'active-tech',
      label: '活跃技术栈',
      value: String(activeTechCount),
      hint: '近 30 天出现在活跃仓库中的技术',
      trend: `${repoRows.filter((item) => item.commitCount30d > 0).length} 个活跃仓库`,
      trendDirection: activeTechCount > 0 ? 'up' : 'flat'
    },
    {
      id: 'new-tech',
      label: `近 ${months} 个月新增`,
      value: String(newTechCount),
      hint: '按仓库首次创建时间推断首次引入',
      trend: emergingTechStacks[0] ? `最新 ${emergingTechStacks[0].name}` : '暂无新增技术',
      trendDirection: newTechCount > 0 ? 'up' : 'flat'
    },
    {
      id: 'hot-tech',
      label: '高热技术栈',
      value: String(hotTechCount),
      hint: '按仓库覆盖、活跃度与近月热度综合评分',
      trend: topTechStacks[0] ? `TOP 1 ${topTechStacks[0].name}` : '暂无热度排行',
      trendDirection: hotTechCount > 0 ? 'up' : 'flat'
    }
  ];

  return {
    header: {
      title: '技术栈分析',
      githubUsername: config.githubUsername,
      lastSyncedAt: config.lastSyncedAt,
      syncStatus: syncStatus?.status ?? 'idle',
      currentTime: new Date().toISOString()
    },
    appliedWindow: {
      months,
      startMonth: monthKeys[0],
      endMonth: monthKeys[monthKeys.length - 1]
    },
    summaryCards,
    languageDistribution,
    categoryDistribution,
    topTechStacks,
    trendMonths: monthKeys,
    trendSeries,
    emergingTechStacks,
    matrixColumns,
    projectMatrix,
    relationships
  };
}

/**
 * 函数说明：根据仓库维度的技术集合构建技术栈分类分布。
 * 参数说明：`techAggregates` 为技术栈聚合映射。
 * 返回说明：返回各分类下的技术数量及占比。
 */
function buildCategoryDistribution(techAggregates: Map<string, TechAggregate>): CategoryAggregate[] {
  const grouped = new Map<StackCategory, number>();

  CATEGORY_ORDER.forEach((category) => {
    grouped.set(category, 0);
  });

  techAggregates.forEach((item) => {
    grouped.set(item.category, (grouped.get(item.category) ?? 0) + 1);
  });

  const total = [...grouped.values()].reduce((sum, item) => sum + item, 0);

  return CATEGORY_ORDER
    .map((category) => ({
      name: category,
      techCount: grouped.get(category) ?? 0,
      percentage: total > 0 ? Number((((grouped.get(category) ?? 0) / total) * 100).toFixed(1)) : 0
    }))
    .filter((item) => item.techCount > 0);
}

/**
 * 函数说明：生成技术热度排行。
 * 参数说明：`techAggregates` 为技术聚合映射；`repoCount` 为仓库总数。
 * 返回说明：返回按综合热度排序的技术列表。
 */
function buildTopTechStacks(
  techAggregates: Map<string, TechAggregate>,
  repoCount: number,
  recentMonthKeys: string[],
  previousMonthKeys: string[]
): TopTechItem[] {
  const aggregates = [...techAggregates.values()].filter((item) => isRankingTechnology(item));
  const maxRepoCount = Math.max(1, ...aggregates.map((item) => item.repoIds.size));
  const maxExplicitRepoCount = Math.max(1, ...aggregates.map((item) => item.explicitRepoIds.size));
  const maxActiveRepoCount = Math.max(1, ...aggregates.map((item) => item.activeRepoIds.size));
  const maxCommitCount = Math.max(1, ...aggregates.map((item) => item.commitCount30d));
  const maxRecentActivity = Math.max(
    1,
    ...aggregates.map((item) => sumMonthActivity(item.monthlyActivity, recentMonthKeys))
  );

  return aggregates
    .map((item) => {
      const recentActivity = sumMonthActivity(item.monthlyActivity, recentMonthKeys);
      const previousActivity = sumMonthActivity(item.monthlyActivity, previousMonthKeys);
      const trend = buildTrendValue(recentActivity, previousActivity);
      const baseHeat = Math.max(
        24,
        Math.min(
          99,
          Math.round(
            (item.repoIds.size / maxRepoCount) * 20 +
              (item.explicitRepoIds.size / maxExplicitRepoCount) * 24 +
              (item.activeRepoIds.size / maxActiveRepoCount) * 24 +
              (item.commitCount30d / maxCommitCount) * 16 +
              (recentActivity / maxRecentActivity) * 16
          )
        )
      );
      const heat = Math.max(18, Math.min(99, Math.round(baseHeat * CATEGORY_HEAT_FACTOR[item.category])));

      return {
        name: item.name,
        category: item.category,
        repoCount: item.repoIds.size,
        activeRepoCount: item.activeRepoIds.size,
        percentage: repoCount > 0 ? Number(((item.repoIds.size / repoCount) * 100).toFixed(1)) : 0,
        heat,
        trend,
        commitCount30d: item.commitCount30d
      };
    })
    .sort((left, right) => {
      if (right.heat !== left.heat) {
        return right.heat - left.heat;
      }

      if (right.activeRepoCount !== left.activeRepoCount) {
        return right.activeRepoCount - left.activeRepoCount;
      }

      return right.commitCount30d - left.commitCount30d;
    })
    .slice(0, 10);
}

/**
 * 函数说明：生成技术趋势折线图序列。
 * 参数说明：`topTechStacks` 为技术热度排行；`monthlyRows` 为仓库月度活跃数据。
 * 返回说明：返回近 N 月的技术热度占比趋势。
 */
function buildTrendSeries(
  topTechStacks: TopTechItem[],
  techAggregates: Map<string, TechAggregate>,
  monthKeys: string[],
  monthlyRows: RepoMonthlyActivityRow[]
): Array<{ name: string; category: StackCategory; values: number[] }> {
  const totalByMonth = new Map<string, number>();

  monthKeys.forEach((monthKey) => {
    totalByMonth.set(monthKey, 0);
  });

  monthlyRows.forEach((item) => {
    totalByMonth.set(item.monthKey, (totalByMonth.get(item.monthKey) ?? 0) + item.commitCount);
  });

  return topTechStacks.slice(0, 5).map((item) => {
    const aggregate = techAggregates.get(item.name);
    const values = monthKeys.map((monthKey) => {
      const total = totalByMonth.get(monthKey) ?? 0;
      const techValue = aggregate?.monthlyActivity.get(monthKey) ?? 0;

      if (total <= 0) {
        return 0;
      }

      return Number(((techValue / total) * 100).toFixed(1));
    });

    return {
      name: item.name,
      category: item.category,
      values
    };
  });
}

/**
 * 函数说明：按窗口期筛选“新增技术栈”。
 * 参数说明：`techAggregates` 为技术聚合映射；`windowStartDate` 为窗口起始时间。
 * 返回说明：返回按首次出现时间倒序排列的技术列表。
 */
function buildEmergingTechStacks(
  techAggregates: Map<string, TechAggregate>,
  windowStartDate: Date
): EmergingTechItem[] {
  const allItems = [...techAggregates.values()]
    .filter((item) => !LOW_SIGNAL_EMERGING_TECHS.has(item.name))
    .map((item) => ({
      name: item.name,
      category: item.category,
      firstSeenAt: item.firstSeenAt,
      repoCount: item.repoIds.size,
      representativeRepo: item.representativeRepo
    }))
    .sort((left, right) => new Date(right.firstSeenAt).getTime() - new Date(left.firstSeenAt).getTime());

  const inWindow = allItems.filter((item) => new Date(item.firstSeenAt).getTime() >= windowStartDate.getTime());
  return (inWindow.length > 0 ? inWindow : allItems).slice(0, 6);
}

/**
 * 函数说明：构建项目与技术栈矩阵热力表。
 * 参数说明：`repoRows` 为仓库基础信息；`repoTechnologies` 为仓库技术集合。
 * 返回说明：返回矩阵列定义和行数据。
 */
function buildProjectMatrix(
  repoRows: RepoBaseRow[],
  repoTechnologies: Map<number, string[]>,
  repoTechnologyStrengths: Map<number, Map<string, number>>,
  matrixColumns: string[]
): MatrixRow[] {
  return repoRows.slice(0, 8).map((repo) => ({
    repoId: repo.repoId,
    repoName: repo.repoName,
    activeDays30d: repo.activeDays30d,
    commitCount30d: repo.commitCount30d,
    intensityLabel: getActivityLabel(repo.commitCount30d, repo.activeDays30d),
    values: matrixColumns.map((column) => {
      const technologies = repoTechnologies.get(repo.repoId) ?? [];
      const technologyStrengths = repoTechnologyStrengths.get(repo.repoId) ?? new Map<string, number>();
      const maxTechnologyStrength = getMaxTechnologyStrength(technologyStrengths);

      if (!technologies.includes(column)) {
        return 0;
      }

      return getTechnologyMatrixIntensity(
        repo.commitCount30d,
        repo.activeDays30d,
        technologyStrengths.get(column) ?? 0,
        maxTechnologyStrength
      );
    })
  }));
}

/**
 * 函数说明：构建技术栈共现关系。
 * 参数说明：`repoTechnologies` 为仓库技术集合；`focusTechnologies` 为需要聚焦的技术名单。
 * 返回说明：返回共现权重最高的技术组合。
 */
function buildTechnologyRelationships(
  repoTechnologies: Map<number, string[]>,
  focusTechnologies: string[]
): RelationItem[] {
  const focusSet = new Set(focusTechnologies);
  const relationMap = new Map<string, number>();

  repoTechnologies.forEach((technologies) => {
    const normalized = technologies.filter((item) => focusSet.has(item)).sort((left, right) => left.localeCompare(right));

    for (let index = 0; index < normalized.length; index += 1) {
      for (let nextIndex = index + 1; nextIndex < normalized.length; nextIndex += 1) {
        const source = normalized[index];
        const target = normalized[nextIndex];
        const key = `${source}__${target}`;
        relationMap.set(key, (relationMap.get(key) ?? 0) + 1);
      }
    }
  });

  return [...relationMap.entries()]
    .map(([key, weight]) => {
      const [source, target] = key.split('__');
      return {
        source,
        target,
        weight
      };
    })
    .sort((left, right) => {
      if (right.weight !== left.weight) {
        return right.weight - left.weight;
      }

      return `${left.source}${left.target}`.localeCompare(`${right.source}${right.target}`);
    })
    .slice(0, 12);
}

/**
 * 函数说明：按 repoId 聚合同一仓库下的记录。
 * 参数说明：`rows` 为原始列表；`resolver` 为值提取函数。
 * 返回说明：返回以仓库 ID 为键的数组映射。
 */
function groupValuesByRepo<T extends { repoId: number }, TValue>(
  rows: T[],
  resolver: (item: T) => TValue
): Map<number, TValue[]> {
  const grouped = new Map<number, TValue[]>();

  rows.forEach((item) => {
    const repoId = item.repoId;
    const current = grouped.get(repoId) ?? [];
    current.push(resolver(item));
    grouped.set(repoId, current);
  });

  return grouped;
}

/**
 * 函数说明：构建仓库月度活跃映射。
 * 参数说明：`rows` 为仓库月度活跃记录。
 * 返回说明：返回 repoId -> monthKey -> commitCount 的映射。
 */
function buildMonthlyMap(rows: RepoMonthlyActivityRow[]): Map<number, Map<string, number>> {
  const monthlyByRepo = new Map<number, Map<string, number>>();

  rows.forEach((item) => {
    const current = monthlyByRepo.get(item.repoId) ?? new Map<string, number>();
    current.set(item.monthKey, item.commitCount);
    monthlyByRepo.set(item.repoId, current);
  });

  return monthlyByRepo;
}

/**
 * 函数说明：提取并规范化技术标记。
 * 参数说明：`rawValue` 为原始技术名称或标签。
 * 返回说明：返回去重前的规范化技术名称数组。
 */
function collectTechnologyTokens(rawValue: string): string[] {
  const normalized = rawValue.trim();

  if (!normalized) {
    return [];
  }

  const alias = TECHNOLOGY_ALIASES[normalized.toLowerCase()];

  if (Array.isArray(alias)) {
    return alias;
  }

  if (typeof alias === 'string') {
    return [alias];
  }

  return [normalized];
}

/**
 * 函数说明：构建单个仓库内各技术的信号强度，用于趋势分摊和项目矩阵强弱判断。
 * 参数说明：`mainLanguage` 为仓库主语言；`languageRows` 为语言占比；`explicitTechnologies` 为显式识别的技术；`technologies` 为仓库最终技术集合。
 * 返回说明：返回技术名到强度值的映射，数值越大表示该技术越接近仓库主技术。
 */
function buildRepoTechnologyStrengths(
  mainLanguage: string,
  languageRows: RepoLanguageRow[],
  explicitTechnologies: Set<string>,
  technologies: Set<string>
): Map<string, number> {
  const strengths = new Map<string, number>();

  collectTechnologyTokens(mainLanguage).forEach((technology) => {
    addTechnologyStrength(strengths, technology, 1.15);
  });

  languageRows.forEach((item) => {
    if (item.percentage < 6) {
      return;
    }

    const languageWeight = Math.max(0.35, Number((item.percentage / 100).toFixed(2)));

    collectTechnologyTokens(item.language).forEach((technology) => {
      addTechnologyStrength(strengths, technology, languageWeight);
    });
  });

  explicitTechnologies.forEach((technology) => {
    addTechnologyStrength(strengths, technology, 0.95);
  });

  technologies.forEach((technology) => {
    if (!strengths.has(technology)) {
      strengths.set(technology, 0.25);
    }
  });

  return strengths;
}

/**
 * 函数说明：向技术强度映射追加分值。
 * 参数说明：`strengths` 为强度映射；`technology` 为技术名；`score` 为本次追加权重。
 * 返回说明：无返回值，直接修改传入映射。
 */
function addTechnologyStrength(strengths: Map<string, number>, technology: string, score: number): void {
  strengths.set(technology, Number(((strengths.get(technology) ?? 0) + score).toFixed(4)));
}

/**
 * 函数说明：根据快照文件推断技术栈。
 * 参数说明：`filePath` 为文件路径；`content` 为快照内容。
 * 返回说明：返回从快照中识别到的技术名称。
 */
function inferTechnologiesFromFile(filePath: string, content: string): string[] {
  const technologies = new Set<string>();
  const normalizedPath = filePath.toLowerCase();
  const normalizedContent = decodeSnapshotContent(content).toLowerCase();

  if (normalizedPath.endsWith('requirements.txt') || normalizedPath.endsWith('pyproject.toml')) {
    technologies.add('Python');
  }

  if (normalizedPath.endsWith('dockerfile')) {
    technologies.add('Docker');
  }

  if (normalizedContent.includes('"react"') || normalizedContent.includes('react-dom')) {
    technologies.add('React');
  }

  if (normalizedContent.includes('"vue"') || normalizedContent.includes('vue-cli-service')) {
    technologies.add('Vue');
  }

  if (normalizedContent.includes('"next"') || normalizedContent.includes('next dev')) {
    technologies.add('Next.js');
  }

  if (normalizedContent.includes('nuxt')) {
    technologies.add('Nuxt');
  }

  if (normalizedContent.includes('vitepress')) {
    technologies.add('VitePress');
  }

  if (normalizedContent.includes('"vite"') || normalizedContent.includes('vite build')) {
    technologies.add('Vite');
  }

  if (normalizedContent.includes('tailwindcss') || normalizedContent.includes('tailwind css')) {
    technologies.add('Tailwind CSS');
  }

  if (normalizedContent.includes('zustand')) {
    technologies.add('Zustand');
  }

  if (normalizedContent.includes('echarts')) {
    technologies.add('ECharts');
  }

  if (normalizedContent.includes('"express"') || normalizedContent.includes(' express ')) {
    technologies.add('Express');
    technologies.add('Node.js');
  }

  if (normalizedContent.includes('fastapi')) {
    technologies.add('FastAPI');
  }

  if (normalizedContent.includes('prisma')) {
    technologies.add('Prisma');
  }

  if (normalizedContent.includes('drizzle')) {
    technologies.add('Drizzle ORM');
  }

  if (normalizedContent.includes('sqlite')) {
    technologies.add('SQLite');
  }

  if (normalizedContent.includes('expo')) {
    technologies.add('Expo');
  }

  if (normalizedContent.includes('"bun"') || normalizedContent.includes('bun run')) {
    technologies.add('Bun');
  }

  if (normalizedContent.includes('"sass"') || normalizedContent.includes('"scss"')) {
    technologies.add('SCSS');
  }

  return [...technologies];
}

/**
 * 函数说明：对快照内容做基础 HTML 实体解码。
 * 参数说明：`content` 为数据库中存储的文件快照内容。
 * 返回说明：返回可用于关键字识别的普通文本。
 */
function decodeSnapshotContent(content: string): string {
  return content
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>');
}

/**
 * 函数说明：将技术名称归类到展示分类。
 * 参数说明：`technology` 为技术名称。
 * 返回说明：返回页面使用的分类名称。
 */
function getTechnologyCategory(technology: string): StackCategory {
  const normalized = technology.toLowerCase();

  if (
    ['typescript', 'javascript', 'python', 'rust', 'go', 'java', 'html', 'css', 'shell', 'powershell', 'batchfile', 'jupyter notebook'].includes(
      normalized
    )
  ) {
    return '语言';
  }

  if (['react', 'react router', 'vue', 'next.js', 'nuxt', 'vite', 'vitepress', 'tailwind css', 'zustand', 'echarts', 'expo', 'scss'].includes(normalized)) {
    return '前端';
  }

  if (['node.js', 'express', 'fastapi', 'bun'].includes(normalized)) {
    return '后端';
  }

  if (['sqlite', 'postgresql', 'prisma', 'drizzle orm', 'plpgsql'].includes(normalized)) {
    return '数据层';
  }

  if (['docker', 'github actions'].includes(normalized)) {
    return '工程化';
  }

  return '其他';
}

/**
 * 函数说明：判断技术项是否适合进入热度榜。
 * 参数说明：`item` 为技术栈聚合结果。
 * 返回说明：返回当前技术是否适合作为重点技术展示。
 */
function isRankingTechnology(item: TechAggregate): boolean {
  if (LOW_SIGNAL_RANKING_TECHS.has(item.name)) {
    return false;
  }

  if (item.repoIds.size >= 2) {
    return true;
  }

  if (item.activeRepoIds.size > 0 && item.commitCount30d >= 8) {
    return true;
  }

  return item.category === '数据层' || item.category === '工程化';
}

/**
 * 函数说明：构建最近 N 个月的月份序列。
 * 参数说明：`timezone` 为展示时区；`months` 为月份数量。
 * 返回说明：返回按时间升序排列的月份键。
 */
function buildMonthKeys(timezone: string, months: number): string[] {
  const keys: string[] = [];

  for (let index = months - 1; index >= 0; index -= 1) {
    keys.push(formatInTimeZone(subMonths(new Date(), index), timezone, 'yyyy-MM'));
  }

  return keys;
}

/**
 * 函数说明：根据月份键生成窗口起始日期。
 * 参数说明：`monthKey` 为窗口首月；`timezone` 为展示时区。
 * 返回说明：返回窗口首日的本地时间对象。
 */
function buildWindowStartDate(monthKey: string, timezone: string): Date {
  const [yearText, monthText] = monthKey.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const baseDate = new Date(year, Math.max(0, month - 1), 1);
  const dayKey = getDayKey(baseDate, timezone);

  return new Date(`${dayKey}T00:00:00`);
}

/**
 * 函数说明：累计指定月份范围内的活跃值。
 * 参数说明：`monthlyActivity` 为月份活跃映射；`monthKeys` 为目标月份数组。
 * 返回说明：返回月份范围内的活跃值总和。
 */
function sumMonthActivity(monthlyActivity: Map<string, number>, monthKeys: string[]): number {
  return monthKeys.reduce((sum, monthKey) => sum + (monthlyActivity.get(monthKey) ?? 0), 0);
}

/**
 * 函数说明：统计单个仓库全部技术强度之和。
 * 参数说明：`technologyStrengths` 为仓库技术强度映射。
 * 返回说明：返回该仓库全部技术强度总和。
 */
function sumTechnologyStrengths(technologyStrengths: Map<string, number>): number {
  return [...technologyStrengths.values()].reduce((sum, value) => sum + value, 0);
}

/**
 * 函数说明：获取单个仓库内最强技术信号的权重。
 * 参数说明：`technologyStrengths` 为仓库技术强度映射。
 * 返回说明：返回映射中的最大权重值，最小返回 0。
 */
function getMaxTechnologyStrength(technologyStrengths: Map<string, number>): number {
  return Math.max(0, ...technologyStrengths.values());
}

/**
 * 函数说明：根据近两段时间的活跃值构建趋势百分比。
 * 参数说明：`currentValue` 为当前窗口值；`previousValue` 为上一窗口值。
 * 返回说明：返回百分比变化值。
 */
function buildTrendValue(currentValue: number, previousValue: number): number {
  if (previousValue <= 0) {
    return currentValue > 0 ? 100 : 0;
  }

  return Number((((currentValue - previousValue) / previousValue) * 100).toFixed(1));
}

/**
 * 函数说明：根据仓库活跃度生成矩阵格子的强度值。
 * 参数说明：`commitCount30d` 为近 30 天提交数；`activeDays30d` 为活跃天数。
 * 返回说明：返回 1-4 级热度强度。
 */
function getMatrixIntensity(commitCount30d: number, activeDays30d: number): number {
  if (commitCount30d >= 50 || activeDays30d >= 15) {
    return 4;
  }

  if (commitCount30d >= 20 || activeDays30d >= 8) {
    return 3;
  }

  if (commitCount30d >= 5 || activeDays30d >= 3) {
    return 2;
  }

  return 1;
}

/**
 * 函数说明：结合仓库活跃度与技术信号强度生成技术级矩阵强度。
 * 参数说明：`technologyStrength` 为当前技术权重；`maxTechnologyStrength` 为仓库内最高技术权重。
 * 返回说明：返回 1-4 级技术矩阵强度，弱技术会在仓库基础热度上适当降级。
 */
function getTechnologyMatrixIntensity(
  commitCount30d: number,
  activeDays30d: number,
  technologyStrength: number,
  maxTechnologyStrength: number
): number {
  const baseIntensity = getMatrixIntensity(commitCount30d, activeDays30d);

  if (maxTechnologyStrength <= 0) {
    return baseIntensity;
  }

  const strengthRatio = technologyStrength / maxTechnologyStrength;

  if (strengthRatio >= 0.85) {
    return baseIntensity;
  }

  if (strengthRatio >= 0.55) {
    return Math.max(1, baseIntensity - 1);
  }

  if (strengthRatio >= 0.3) {
    return Math.max(1, baseIntensity - 2);
  }

  return Math.max(1, baseIntensity - 3);
}

/**
 * 函数说明：根据仓库活跃度生成文本标签。
 * 参数说明：`commitCount30d` 为近 30 天提交数；`activeDays30d` 为活跃天数。
 * 返回说明：返回可直接展示的活跃标签。
 */
function getActivityLabel(commitCount30d: number, activeDays30d: number): string {
  const intensity = getMatrixIntensity(commitCount30d, activeDays30d);

  if (intensity >= 4) {
    return '高频使用';
  }

  if (intensity === 3) {
    return '稳定使用';
  }

  if (intensity === 2) {
    return '低频使用';
  }

  return '偶发使用';
}
