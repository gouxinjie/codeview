import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type Ref,
  type ReactElement,
  type ReactNode,
} from 'react';
import type { EChartsOption } from 'echarts';
import ReactECharts from 'echarts-for-react';
import type { LucideIcon } from 'lucide-react';
import {
  AlertTriangle,
  CheckCircle2,
  CircleAlert,
  Clock3,
  Lightbulb,
  RefreshCw,
  Settings2,
  TrendingUp,
  User
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { EmptyState } from '@/components/commons/EmptyState';
import { LoadingBlock } from '@/components/commons/LoadingBlock';
import { PanelHeading } from '@/components/commons/PanelHeading';
import { useAppStore } from '@/store/appStore';
import type {
  InsightCard,
  OverviewData,
  RepoActivityPoint,
  RepoDetail,
  RepoListItem,
  StackAnalysisData,
  StatisticsData
} from '@/types/api';
import {
  fetchInsights,
  fetchOverview,
  fetchRepositories,
  fetchRepositoryActivity,
  fetchRepositoryDetail,
  fetchStackAnalysis,
  fetchStatistics
} from '@/utils/api';
import { formatDate, formatDateTime, formatNumber, translateSyncStatus } from '@/utils/date';
import './index.scss';

type InsightRangeDays = 30 | 90;
type HeaderIconName = 'user' | 'clock' | 'success' | 'sync';
type SummaryIconName = 'lightbulb' | 'focus' | 'up' | 'risk';
type InsightTone = 'focus' | 'up' | 'risk';
type InsightSectionKey = 'overview' | 'active' | 'stack' | 'operation' | 'risk' | 'suggestion';

interface InsightCenterSnapshot {
  overview: OverviewData;
  insights: InsightCard[];
  repositories: RepoListItem[];
  statistics: StatisticsData;
  stackAnalysis: StackAnalysisData;
  featuredRepo: RepoDetail | null;
  repositoryActivityByRepo: Record<number, RepoActivityPoint[]>;
  featuredRepoActivityDay: RepoActivityPoint[];
  featuredRepoActivityWeek: RepoActivityPoint[];
}

/**
 * Props 说明：
 * icon：头部图标类型，必填，无默认值。
 * label：字段标题，必填，无默认值。
 * value：主值文案，必填，无默认值。
 * subValue：补充说明文案，必填，无默认值。
 */
interface TopInfoCellProps {
  icon: HeaderIconName;
  label: string;
  value: string;
  subValue: string;
}

/**
 * Props 说明：
 * icon：摘要卡图标类型，必填，无默认值。
 * label：指标标题，必填，无默认值。
 * value：指标值，必填，无默认值。
 * hint：指标说明，必填，无默认值。
 * tone：视觉强调色，必填，无默认值。
 */
interface InsightSummaryCardProps {
  icon: SummaryIconName;
  label: string;
  value: string;
  hint: string;
  tone: InsightTone;
}

/**
 * Props 说明：
 * elementRef：滚动定位 ref，选填，默认不绑定。
 * badge：左上角标签文案，必填，无默认值。
 * tone：卡片视觉语义，必填，无默认值。
 * title：标题文案，必填，无默认值。
 * summary：摘要文案，必填，无默认值。
 * footer：底部操作区，选填，默认不展示。
 * children：卡片主体内容，必填，无默认值。
 */
interface StoryCardProps {
  elementRef?: Ref<HTMLElement>;
  badge: string;
  tone: InsightTone;
  title: string;
  summary: string;
  footer?: ReactNode;
  children: ReactNode;
}

interface InsightDistributionItem {
  name: string;
  value: number;
  color: string;
}

interface RecommendationItem {
  id: string;
  title: string;
  detail: string;
  done: boolean;
}

interface RepositoryWindowMetrics {
  commitCount: number;
  activeDays: number;
}

interface InsightRepositoryItem extends RepoListItem {
  windowCommitCount: number;
  windowActiveDays: number;
}

const HEADER_ICON_MAP: Record<HeaderIconName, LucideIcon> = {
  user: User,
  clock: Clock3,
  success: CheckCircle2,
  sync: RefreshCw
};

const SUMMARY_ICON_MAP: Record<SummaryIconName, LucideIcon> = {
  lightbulb: Lightbulb,
  focus: CircleAlert,
  up: TrendingUp,
  risk: AlertTriangle
};

const SECTION_TABS: Array<{ key: InsightSectionKey; label: string }> = [
  { key: 'overview', label: '洞察总览' },
  { key: 'active', label: '活跃洞察' },
  { key: 'stack', label: '技术栈洞察' },
  { key: 'operation', label: '经营洞察' },
  { key: 'risk', label: '风险洞察' },
  { key: 'suggestion', label: '建议中心' }
];

/**
 * 页面说明：洞察中心页面。
 * Props 类型：无。
 * 含义：基于现有 GitHub 数据聚合接口，输出经营主力、技术栈趋势、风险项目和建议执行度等洞察视图。
 * 是否必填：无。
 * 默认值：无。
 */
function InsightCenterPage(): ReactElement {
  const { config } = useAppStore();
  const [rangeDays, setRangeDays] = useState<InsightRangeDays>(30);
  const [reloadSeed, setReloadSeed] = useState<number>(0);
  const [activeSection, setActiveSection] = useState<InsightSectionKey>('overview');
  const [snapshot, setSnapshot] = useState<InsightCenterSnapshot | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const overviewRef = useRef<HTMLElement | null>(null);
  const activeRef = useRef<HTMLElement | null>(null);
  const stackRef = useRef<HTMLElement | null>(null);
  const operationRef = useRef<HTMLElement | null>(null);
  const riskRef = useRef<HTMLElement | null>(null);
  const suggestionRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    let active = true;

    const loadInsightCenter = async (): Promise<void> => {
      setLoading(true);

      try {
        const stackMonths = rangeDays === 90 ? 12 : 6;
        const [overview, insights, repositories, statistics, stackAnalysis] = await Promise.all([
          fetchOverview(),
          fetchInsights(),
          fetchRepositories({ sortBy: 'activity' }),
          fetchStatistics({ rangeDays }),
          fetchStackAnalysis({ months: stackMonths })
        ]);
        const repositoryActivityByRepo =
          rangeDays === 90 ? await fetchRepositoryActivityByRepo(repositories) : {};

        const featuredRepoId = overview.featuredRepoId ?? repositories[0]?.id ?? null;
        let featuredRepo: RepoDetail | null = null;
        let featuredRepoActivityDay: RepoActivityPoint[] = [];
        let featuredRepoActivityWeek: RepoActivityPoint[] = [];

        if (featuredRepoId !== null) {
          const featuredRepoDayActivity =
            rangeDays === 90 ? repositoryActivityByRepo[featuredRepoId] : undefined;
          const [nextFeaturedRepo, nextFeaturedRepoActivityWeek, nextFeaturedRepoActivityDay] = await Promise.all([
            fetchRepositoryDetail(featuredRepoId),
            fetchRepositoryActivity(featuredRepoId, 'week'),
            featuredRepoDayActivity
              ? Promise.resolve(featuredRepoDayActivity)
              : fetchRepositoryActivity(featuredRepoId, 'day')
          ]);

          featuredRepo = nextFeaturedRepo;
          featuredRepoActivityDay = nextFeaturedRepoActivityDay;
          featuredRepoActivityWeek = nextFeaturedRepoActivityWeek;
        }

        if (!active) {
          return;
        }

        setSnapshot({
          overview,
          insights,
          repositories,
          statistics,
          stackAnalysis,
          featuredRepo,
          repositoryActivityByRepo,
          featuredRepoActivityDay,
          featuredRepoActivityWeek
        });
        setError('');
      } catch (requestError) {
        if (!active) {
          return;
        }

        setError(requestError instanceof Error ? requestError.message : '洞察中心加载失败');
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void loadInsightCenter();

    return () => {
      active = false;
    };
  }, [rangeDays, reloadSeed]);

  const scrollToSection = useCallback((key: InsightSectionKey): void => {
    setActiveSection(key);

    if (key === 'overview') {
      overviewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    if (key === 'active') {
      activeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    if (key === 'stack') {
      stackRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    if (key === 'operation') {
      operationRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    if (key === 'risk') {
      riskRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    suggestionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const summaryCards = useMemo<InsightSummaryCardProps[]>(() => {
    if (!snapshot) {
      return [];
    }

    const focusCount = snapshot.insights.filter((item) => normalizeInsightTone(item.level) === 'focus').length;
    const upCount = snapshot.insights.filter((item) => normalizeInsightTone(item.level) === 'up').length;
    const riskCount = snapshot.insights.filter((item) => normalizeInsightTone(item.level) === 'risk').length;

    return [
      {
        icon: 'lightbulb',
        label: '洞察总数',
        value: formatNumber(snapshot.insights.length),
        hint: '当前时间窗内自动生成',
        tone: 'focus'
      },
      {
        icon: 'focus',
        label: '重点关注',
        value: formatNumber(focusCount),
        hint: '需优先跟进',
        tone: 'focus'
      },
      {
        icon: 'up',
        label: '积极信号',
        value: formatNumber(upCount),
        hint: '持续向好',
        tone: 'up'
      },
      {
        icon: 'risk',
        label: '潜在风险',
        value: formatNumber(riskCount),
        hint: '需要注意',
        tone: 'risk'
      }
    ];
  }, [snapshot]);

  const repositoryMetricsByRepo = useMemo<Record<number, RepositoryWindowMetrics>>(() => {
    if (!snapshot) {
      return {};
    }

    return snapshot.repositories.reduce<Record<number, RepositoryWindowMetrics>>((metricsMap, repository) => {
      metricsMap[repository.id] = buildRepositoryWindowMetrics({
        rangeDays,
        repository,
        statistics: snapshot.statistics,
        activitySeries: snapshot.repositoryActivityByRepo[repository.id]
      });
      return metricsMap;
    }, {});
  }, [rangeDays, snapshot]);

  const repositoryRanking = useMemo<InsightRepositoryItem[]>(() => {
    if (!snapshot) {
      return [];
    }

    return snapshot.repositories
      .map((repository) => {
        const metrics = repositoryMetricsByRepo[repository.id] ?? {
          commitCount: repository.commitCount30d,
          activeDays: repository.activeDays30d
        };

        return {
          ...repository,
          windowCommitCount: metrics.commitCount,
          windowActiveDays: metrics.activeDays
        };
      })
      .sort((left, right) => {
        if (right.score === left.score) {
          if (right.windowCommitCount === left.windowCommitCount) {
            return right.windowActiveDays - left.windowActiveDays;
          }

          return right.windowCommitCount - left.windowCommitCount;
        }

        return right.score - left.score;
      });
  }, [repositoryMetricsByRepo, snapshot]);

  const featuredRepoMetrics = useMemo<RepositoryWindowMetrics>(() => {
    if (!snapshot?.featuredRepo) {
      return {
        commitCount: 0,
        activeDays: 0
      };
    }

    const metricsFromRanking = repositoryMetricsByRepo[snapshot.featuredRepo.id];
    if (metricsFromRanking) {
      return metricsFromRanking;
    }

    return buildRepositoryWindowMetrics({
      rangeDays,
      repository: snapshot.featuredRepo,
      statistics: snapshot.statistics,
      activitySeries: snapshot.featuredRepoActivityDay
    });
  }, [rangeDays, repositoryMetricsByRepo, snapshot]);

  const rangeLabel = useMemo<string>(() => (rangeDays === 30 ? '近 30 天' : '近 90 天'), [rangeDays]);

  const featuredRepoRank = useMemo<number>(() => {
    if (!snapshot?.featuredRepo) {
      return 0;
    }

    return repositoryRanking.findIndex((item) => item.id === snapshot.featuredRepo?.id) + 1;
  }, [repositoryRanking, snapshot?.featuredRepo]);

  const riskRepositories = useMemo<InsightRepositoryItem[]>(() => {
    const minimumCommitCount = rangeDays === 90 ? 12 : 5;
    const minimumActiveDays = rangeDays === 90 ? 9 : 3;

    return [...repositoryRanking]
      .filter((item) => item.windowCommitCount <= minimumCommitCount || item.windowActiveDays <= minimumActiveDays)
      .sort((left, right) => {
        const leftRiskScore = left.windowCommitCount * 3 + left.windowActiveDays * 7;
        const rightRiskScore = right.windowCommitCount * 3 + right.windowActiveDays * 7;

        if (leftRiskScore === rightRiskScore) {
          return new Date(left.updatedAt).getTime() - new Date(right.updatedAt).getTime();
        }

        return leftRiskScore - rightRiskScore;
      })
      .slice(0, 3);
  }, [rangeDays, repositoryRanking]);

  const topGrowthStacks = useMemo(() => {
    if (!snapshot) {
      return [];
    }

    return [...snapshot.stackAnalysis.topTechStacks]
      .filter((item) => item.trend >= 0)
      .sort((left, right) => right.trend - left.trend)
      .slice(0, 3);
  }, [snapshot]);

  const featuredRhythmSeries = useMemo<RepoActivityPoint[]>(() => {
    if (!snapshot) {
      return [];
    }

    return rangeDays === 90 ? snapshot.featuredRepoActivityWeek : snapshot.featuredRepoActivityDay;
  }, [rangeDays, snapshot]);

  const insightDistribution = useMemo<InsightDistributionItem[]>(() => {
    const items = summaryCards.slice(1);
    const colors: Record<InsightTone, string> = {
      focus: '#c8ee31',
      up: '#91da5f',
      risk: '#df7a26'
    };

    return items.map((item) => ({
      name: item.label,
      value: Number(item.value.replace(/,/g, '')),
      color: colors[item.tone]
    }));
  }, [summaryCards]);

  const signalTrendSeries = useMemo(
    () =>
      (snapshot?.statistics.trendDaily ?? []).slice(rangeDays === 90 ? -18 : -30).map((item) => ({
        label: item.date.slice(5),
        value: item.count
      })),
    [rangeDays, snapshot?.statistics.trendDaily]
  );

  const recommendationItems = useMemo<RecommendationItem[]>(() => {
    if (!snapshot) {
      return [];
    }

    const totalRepositories = snapshot.repositories.length;
    const activeRepositoryCount = repositoryRanking.filter((item) => item.windowCommitCount > 0).length;
    const activeDays = getStatisticsCardValue(snapshot.statistics, 'active-days');
    const highGrowthStack = topGrowthStacks[0];
    const featureExposure = snapshot.featuredRepo
      ? snapshot.featuredRepo.trafficSummary.views14d + snapshot.featuredRepo.trafficSummary.clones14d
      : 0;

    return [
      {
        id: 'coverage',
        title: '保持活跃仓库覆盖',
        detail: `${formatNumber(activeRepositoryCount)}/${formatNumber(totalRepositories)} 个仓库在窗口内有提交`,
        done: totalRepositories > 0 && activeRepositoryCount / totalRepositories >= 0.45
      },
      {
        id: 'risk',
        title: '处理低维护风险项目',
        detail:
          riskRepositories.length === 0
            ? '当前没有显著低维护风险仓库'
            : `${formatNumber(riskRepositories.length)} 个仓库需要补充维护动作`,
        done: riskRepositories.length <= 1
      },
      {
        id: 'stack',
        title: '跟进高增长技术栈',
        detail: highGrowthStack
          ? `${highGrowthStack.name} 趋势 +${highGrowthStack.trend.toFixed(1)}%`
          : '暂无显著上行技术栈',
        done: highGrowthStack !== undefined
      },
      {
        id: 'rhythm',
        title: '保持稳定交付节奏',
        detail: `${formatNumber(activeDays)} 个活跃日落在当前时间窗内`,
        done: activeDays >= Math.max(8, Math.round(rangeDays * 0.3))
      },
      {
        id: 'exposure',
        title: '提升主力仓库曝光',
        detail: `${formatNumber(featureExposure)} 次浏览与克隆信号来自近 14 天`,
        done: featureExposure >= 20
      }
    ];
  }, [rangeDays, repositoryRanking, riskRepositories.length, snapshot, topGrowthStacks]);

  const recommendationProgress = useMemo(() => {
    const doneCount = recommendationItems.filter((item) => item.done).length;
    const totalCount = recommendationItems.length;

    return {
      doneCount,
      totalCount,
      percent: totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0
    };
  }, [recommendationItems]);

  if (loading) {
    return <LoadingBlock text="正在加载洞察中心" />;
  }

  if (error || !snapshot) {
    return <EmptyState title="洞察中心暂不可用" description={error || '请稍后重试'} />;
  }

  return (
    <div className="insight-center">
      <section ref={overviewRef} className="insight-center__topbar">
        <TopInfoCell
          icon="user"
          label="用户名"
          value={snapshot.overview.header.githubUsername || 'your-username'}
          subValue={config?.hasToken ? 'GitHub 数据已连通' : '等待接入 GitHub Token'}
        />
        <TopInfoCell
          icon="clock"
          label="当前时间"
          value={formatDateTime(snapshot.overview.header.currentTime)}
          subValue={`时区 ${config?.timezone || 'Asia/Shanghai'}`}
        />
        <TopInfoCell
          icon="success"
          label="同步状态"
          value={translateSyncStatus(snapshot.overview.header.syncStatus)}
          subValue={config?.hasToken ? '同步配置已生效' : '请先完成配置'}
        />
        <TopInfoCell
          icon="sync"
          label="最近同步时间"
          value={formatDateTime(snapshot.overview.header.lastSyncedAt)}
          subValue={config?.includePrivateRepos ? '公开仓库 + 私有仓库' : '仅公开仓库'}
        />
        <div className="insight-center__topbar-actions">
          <Link className="insight-center__connect" to="/">
            <span className="insight-center__connect-dot" aria-hidden="true" />
            <span>{config?.hasToken ? 'GitHub 连通' : '配置入口'}</span>
          </Link>
          <Link className="insight-center__gear" to="/statistics" aria-label="查看统计页面">
            <Settings2 aria-hidden="true" strokeWidth={1.8} />
          </Link>
        </div>
      </section>

      <section className="insight-center__hero">
        <div className="insight-center__hero-main">
          <div className="insight-center__hero-copy">
            <h1>洞察中心</h1>
            <p>基于数据分析为你提供项目运营洞察与行动建议</p>
          </div>
          <div className="insight-center__hero-actions">
            <label className="insight-center__range-control">
              <span>时间范围</span>
              <select
                value={String(rangeDays)}
                onChange={(event) => setRangeDays(Number(event.target.value) as InsightRangeDays)}
              >
                <option value="30">近 30 天</option>
                <option value="90">近 90 天</option>
              </select>
            </label>
            <button type="button" className="insight-center__refresh" onClick={() => setReloadSeed((current) => current + 1)}>
              <RefreshCw aria-hidden="true" strokeWidth={1.8} />
              <span>刷新洞察</span>
            </button>
          </div>
        </div>
        <nav className="insight-center__tabs" aria-label="洞察中心分区">
          {SECTION_TABS.map((item) => (
            <button
              key={item.key}
              type="button"
              className={activeSection === item.key ? 'insight-center__tab insight-center__tab--active' : 'insight-center__tab'}
              onClick={() => scrollToSection(item.key)}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </section>

      <section className="insight-center__summary">
        {summaryCards.map((item) => (
          <InsightSummaryCard
            key={item.label}
            icon={item.icon}
            label={item.label}
            value={item.value}
            hint={item.hint}
            tone={item.tone}
          />
        ))}
      </section>

      <section className="insight-center__layout">
        <div className="insight-center__main">
          <section className="insight-panel insight-panel--stories">
            <PanelHeading variant="dashboard" eyebrow="KEY INSIGHTS" title="关键洞察" />

            <div className="insight-story-grid">
              <StoryCard
                elementRef={activeRef}
                badge="focus"
                tone="focus"
                title={snapshot.featuredRepo ? `${snapshot.featuredRepo.name} 是当前经营主力项目` : '等待主力项目识别'}
                summary={
                  snapshot.featuredRepo
                    ? snapshot.featuredRepo.description || '近一个窗口内该仓库兼具活跃度、评分与曝光信号，适合作为重点经营对象。'
                    : '完成同步后将根据仓库活跃度、评分和流量识别经营主力。'
                }
                footer={
                  snapshot.featuredRepo ? (
                    <Link className="insight-story__link" to={`/repos/${snapshot.featuredRepo.id}`}>
                      查看项目详情
                    </Link>
                  ) : null
                }
              >
                <div className="insight-story__metrics">
                  <MetricChip label="提交数" value={formatNumber(featuredRepoMetrics.commitCount)} meta={rangeLabel} />
                  <MetricChip label="活跃天数" value={formatNumber(featuredRepoMetrics.activeDays)} meta={rangeLabel} />
                  <MetricChip label="访问量" value={formatNumber(snapshot.featuredRepo?.trafficSummary.views14d ?? 0)} meta="近 14 天" />
                  <MetricChip label="仓库评分" value={(snapshot.featuredRepo?.score ?? 0).toFixed(1)} meta={buildRankLabel(featuredRepoRank, repositoryRanking.length)} />
                </div>
              </StoryCard>

              <StoryCard
                elementRef={stackRef}
                badge="up"
                tone="up"
                title="技术栈增长趋势向好"
                summary={
                  topGrowthStacks.length > 0
                    ? `${topGrowthStacks.map((item) => item.name).join('、')} 保持正向增长，建议继续围绕主力技术栈沉淀复用能力。`
                    : '当前未识别出明显上行的技术栈趋势，建议继续观察近两次同步后的变化。'
                }
                footer={<Link className="insight-story__link" to="/stack-analysis">查看技术栈分析</Link>}
              >
                <div className="insight-story__legend">
                  {topGrowthStacks.slice(0, 3).map((item) => (
                    <span key={item.name}>
                      <i style={{ backgroundColor: getTrendSeriesColor(topGrowthStacks.findIndex((current) => current.name === item.name)) }} />
                      {item.name}
                    </span>
                  ))}
                </div>
                <ReactECharts
                  option={buildTechTrendOption(snapshot.stackAnalysis)}
                  style={{ height: 170 }}
                  opts={{ renderer: 'svg' }}
                />
              </StoryCard>

              <StoryCard
                elementRef={riskRef}
                badge="risk"
                tone="risk"
                title="注意低维护风险项目"
                summary={
                  riskRepositories.length > 0
                    ? '以下仓库在当前时间窗内活跃度偏低，建议尽快安排修复、补文档或冻结决策。'
                    : '当前没有显著低维护风险仓库，建议继续保持。'
                }
                footer={<Link className="insight-story__link" to="/repos">查看项目列表</Link>}
              >
                {riskRepositories.length > 0 ? (
                  <div className="insight-story__list">
                    {riskRepositories.map((item) => (
                      <Link key={item.id} className="insight-story__list-item" to={`/repos/${item.id}`}>
                        <strong>{item.name}</strong>
                        <span>{`${rangeLabel} ${formatNumber(item.windowCommitCount)} 次提交 · ${formatNumber(item.windowActiveDays)} 个活跃日`}</span>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className="insight-story__empty">当前没有显著低维护风险仓库</div>
                )}
              </StoryCard>

              <StoryCard
                elementRef={operationRef}
                badge="up"
                tone="up"
                title="开源影响力保持曝光"
                summary={
                  snapshot.featuredRepo
                    ? `主力仓库近 14 天累计 ${formatNumber(snapshot.featuredRepo.trafficSummary.views14d)} 次浏览和 ${formatNumber(snapshot.featuredRepo.trafficSummary.clones14d)} 次克隆，具备继续放大的基础。`
                    : '等待仓库流量信号。'
                }
                footer={
                  snapshot.featuredRepo ? (
                    <Link className="insight-story__link" to={`/repos/${snapshot.featuredRepo.id}`}>
                      查看经营细节
                    </Link>
                  ) : null
                }
              >
                <div className="insight-story__metrics insight-story__metrics--compact">
                  <MetricChip label="Star 总量" value={formatNumber(snapshot.featuredRepo?.starsCount ?? 0)} meta="累计" />
                  <MetricChip label="Fork 总量" value={formatNumber(snapshot.featuredRepo?.forksCount ?? 0)} meta="累计" />
                  <MetricChip label="14 天浏览" value={`+${formatNumber(snapshot.featuredRepo?.trafficSummary.views14d ?? 0)}`} meta="曝光" />
                  <MetricChip label="14 天克隆" value={`+${formatNumber(snapshot.featuredRepo?.trafficSummary.clones14d ?? 0)}`} meta="转化" />
                </div>
              </StoryCard>

              <StoryCard
                elementRef={suggestionRef}
                badge="suggest"
                tone="focus"
                title="建议关注高增长技术栈"
                summary={
                  topGrowthStacks.length > 0
                    ? '高增长技术栈已经开始在多个仓库复用，适合继续沉淀模板、脚手架和通用方案。'
                    : '暂无高增长技术栈，建议继续观察近 90 天的变化。'
                }
                footer={<Link className="insight-story__link" to="/stack-analysis">查看技术栈详情</Link>}
              >
                <div className="insight-story__tags">
                  {topGrowthStacks.length > 0 ? (
                    topGrowthStacks.map((item) => (
                      <span key={item.name}>{`${item.name} +${item.trend.toFixed(1)}%`}</span>
                    ))
                  ) : (
                    <span>等待增长信号</span>
                  )}
                </div>
                <div className="insight-story__subcopy">
                  {snapshot.stackAnalysis.emergingTechStacks.slice(0, 2).map((item) => (
                    <span key={`${item.name}-${item.firstSeenAt}`}>{`${item.name} 首次使用：${formatDate(item.firstSeenAt)}`}</span>
                  ))}
                </div>
              </StoryCard>

              <StoryCard
                badge="focus"
                tone="focus"
                title="保持高频提交流程"
                summary={
                  featuredRhythmSeries.length > 0
                    ? `主力仓库在当前时间窗内保持连续交付，建议延续现有节奏，避免任务堆积到单点时段。`
                    : '暂未识别到连续交付节奏。'
                }
                footer={<Link className="insight-story__link" to="/statistics">查看提交趋势</Link>}
              >
                <div className="insight-story__mini-chart-caption">
                  {rangeDays === 90 ? '近 90 天按周提交流量' : '近 30 天按日提交流量'}
                </div>
                <ReactECharts
                  option={buildRhythmOption(featuredRhythmSeries, rangeDays)}
                  style={{ height: 150 }}
                  opts={{ renderer: 'svg' }}
                />
              </StoryCard>
            </div>
          </section>
        </div>

        <aside className="insight-center__aside">
          <section className="insight-panel">
            <PanelHeading variant="dashboard" eyebrow="DISTRIBUTION" title="洞察分布" />
            <div className="insight-side-panel__chart">
              <ReactECharts
                option={buildInsightDistributionOption(insightDistribution)}
                style={{ height: 188 }}
                opts={{ renderer: 'svg' }}
              />
            </div>
            <div className="insight-side-panel__legend">
              {insightDistribution.map((item) => (
                <div key={item.name} className="insight-side-panel__legend-item">
                  <span className="insight-side-panel__legend-label">
                    <i style={{ backgroundColor: item.color }} aria-hidden="true" />
                    {item.name}
                  </span>
                  <strong>{formatInsightShare(item.value, snapshot.insights.length)}</strong>
                </div>
              ))}
            </div>
          </section>

          <section className="insight-panel">
            <PanelHeading
              variant="dashboard"
              eyebrow="TREND"
              title="洞察趋势"
              accessory={<span className="insight-side-panel__corner-note">{rangeLabel}</span>}
            />
            <ReactECharts
              option={buildSignalTrendOption(signalTrendSeries)}
              style={{ height: 186 }}
              opts={{ renderer: 'svg' }}
            />
            <div className="insight-side-panel__footnote">基于提交活跃度与风险信号综合生成</div>
          </section>

          <section className="insight-panel">
            <PanelHeading variant="dashboard" eyebrow="SUGGESTIONS" title="建议执行度" />
            <div className="insight-progress">
              <div
                className="insight-progress__ring"
                style={
                  {
                    '--progress-angle': `${recommendationProgress.percent * 3.6}deg`
                  } as CSSProperties
                }
              >
                <div className="insight-progress__ring-value">{recommendationProgress.percent}%</div>
              </div>
              <div className="insight-progress__meta">
                <strong>{`${recommendationProgress.doneCount}/${recommendationProgress.totalCount}`}</strong>
                <span>已满足当前建议条件</span>
              </div>
            </div>
            <div className="insight-progress__list">
              {recommendationItems.map((item) => (
                <div key={item.id} className="insight-progress__item">
                  <span
                    className={
                      item.done
                        ? 'insight-progress__status insight-progress__status--done'
                        : 'insight-progress__status'
                    }
                  >
                    <CheckCircle2 aria-hidden="true" strokeWidth={1.8} />
                  </span>
                  <div>
                    <strong>{item.title}</strong>
                    <span>{item.detail}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="insight-panel insight-panel--note">
            <PanelHeading variant="dashboard" eyebrow="NOTE" title="洞察说明" />
            <p className="insight-side-panel__note">
              洞察结果基于 GitHub 仓库活跃度、技术栈变化、流量数据和风险信号自动生成，仅作为经营分析参考，建议结合实际目标继续判断。
            </p>
            <Link className="insight-story__link insight-story__link--inline" to="/statistics">
              了解洞察依据
            </Link>
          </section>
        </aside>
      </section>
    </div>
  );
}

function TopInfoCell(props: TopInfoCellProps): ReactElement {
  const { icon, label, value, subValue } = props;
  const Icon = HEADER_ICON_MAP[icon];

  return (
    <div className="insight-center__topbar-cell">
      <div className="insight-center__topbar-icon">
        <Icon aria-hidden="true" strokeWidth={1.8} />
      </div>
      <div className="insight-center__topbar-copy">
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{subValue}</small>
      </div>
    </div>
  );
}

function InsightSummaryCard(props: InsightSummaryCardProps): ReactElement {
  const { icon, label, value, hint, tone } = props;
  const Icon = SUMMARY_ICON_MAP[icon];

  return (
    <article className={`insight-summary-card insight-summary-card--${tone}`}>
      <div className="insight-summary-card__icon">
        <Icon aria-hidden="true" strokeWidth={1.8} />
      </div>
      <div className="insight-summary-card__copy">
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{hint}</small>
      </div>
    </article>
  );
}

function StoryCard(props: StoryCardProps): ReactElement {
  const { badge, children, elementRef, footer, summary, title, tone } = props;

  return (
    <article ref={elementRef} className={`insight-story insight-story--${tone}`}>
      <div className="insight-story__badge-wrap">
        <span className={`insight-story__badge insight-story__badge--${tone}`}>{badge}</span>
      </div>
      <strong className="insight-story__title">{title}</strong>
      <p className="insight-story__summary">{summary}</p>
      <div className="insight-story__body">{children}</div>
      {footer ? <div className="insight-story__footer">{footer}</div> : null}
    </article>
  );
}

function MetricChip(props: { label: string; value: string; meta: string }): ReactElement {
  const { label, meta, value } = props;

  return (
    <div className="insight-metric-chip">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{meta}</small>
    </div>
  );
}

function normalizeInsightTone(level: string): InsightTone {
  if (level === 'risk') {
    return 'risk';
  }

  if (level === 'up') {
    return 'up';
  }

  return 'focus';
}

function buildRankLabel(rank: number, total: number): string {
  if (rank <= 0 || total <= 0) {
    return '等待计算';
  }

  return `排名 ${rank}/${total}`;
}

function getStatisticsCardValue(statistics: StatisticsData, id: string): number {
  return statistics.summaryCards.find((item) => item.id === id)?.value ?? 0;
}

/**
 * 拉取仓库按日活跃序列，用于在 90 天视图下重新计算真实窗口指标。
 */
async function fetchRepositoryActivityByRepo(
  repositories: RepoListItem[]
): Promise<Record<number, RepoActivityPoint[]>> {
  const activityResults = await Promise.allSettled(
    repositories.map(async (repository) => ({
      repoId: repository.id,
      activitySeries: await fetchRepositoryActivity(repository.id, 'day')
    }))
  );

  return activityResults.reduce<Record<number, RepoActivityPoint[]>>((activityMap, result) => {
    if (result.status === 'fulfilled') {
      activityMap[result.value.repoId] = result.value.activitySeries;
    }

    return activityMap;
  }, {});
}

function buildRepositoryWindowMetrics(params: {
  rangeDays: InsightRangeDays;
  repository: Pick<RepoListItem, 'commitCount30d' | 'activeDays30d'> | Pick<RepoDetail, 'commitCount30d' | 'activeDays30d'>;
  statistics: StatisticsData;
  activitySeries?: RepoActivityPoint[];
}): RepositoryWindowMetrics {
  const { activitySeries, rangeDays, repository, statistics } = params;

  if (rangeDays === 30) {
    return {
      commitCount: repository.commitCount30d,
      activeDays: repository.activeDays30d
    };
  }

  if (!activitySeries || activitySeries.length === 0) {
    return {
      commitCount: repository.commitCount30d,
      activeDays: repository.activeDays30d
    };
  }

  const startDate = statistics.appliedRange.startDate;
  const endDate = statistics.appliedRange.endDate;

  return activitySeries.reduce<RepositoryWindowMetrics>(
    (metrics, item) => {
      if (item.label < startDate || item.label > endDate) {
        return metrics;
      }

      return {
        commitCount: metrics.commitCount + item.count,
        activeDays: item.count > 0 ? metrics.activeDays + 1 : metrics.activeDays
      };
    },
    {
      commitCount: 0,
      activeDays: 0
    }
  );
}

function buildInsightDistributionOption(data: InsightDistributionItem[]): EChartsOption {
  const total = data.reduce((sum, item) => sum + item.value, 0);

  return {
    color: data.map((item) => item.color),
    tooltip: {
      trigger: 'item',
      backgroundColor: '#0d1114',
      borderColor: 'rgba(184,255,59,0.18)',
      textStyle: {
        color: '#f3ebdd'
      },
      formatter: '{b}<br />{c} 条'
    },
    title: {
      text: `${formatNumber(total)}\n总洞察`,
      left: '50%',
      top: '42%',
      textAlign: 'center',
      textStyle: {
        color: '#f3ebdd',
        fontSize: 13,
        fontWeight: 700,
        lineHeight: 20
      }
    },
    series: [
      {
        type: 'pie',
        radius: ['53%', '78%'],
        center: ['50%', '50%'],
        startAngle: 88,
        avoidLabelOverlap: false,
        label: {
          show: false
        },
        itemStyle: {
          borderColor: '#0c1114',
          borderWidth: 2
        },
        data
      }
    ]
  };
}

function buildSignalTrendOption(data: Array<{ label: string; value: number }>): EChartsOption {
  return {
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#0d1114',
      borderColor: 'rgba(184,255,59,0.18)',
      textStyle: {
        color: '#f3ebdd'
      }
    },
    grid: {
      top: 16,
      left: 28,
      right: 14,
      bottom: 24
    },
    xAxis: {
      type: 'category',
      data: data.map((item) => item.label),
      boundaryGap: false,
      axisLabel: {
        color: '#7e887e',
        fontSize: 10
      },
      axisLine: {
        lineStyle: {
          color: 'rgba(255,255,255,0.06)'
        }
      }
    },
    yAxis: {
      type: 'value',
      axisLabel: {
        color: '#7e887e',
        fontSize: 10
      },
      splitLine: {
        lineStyle: {
          color: 'rgba(255,255,255,0.05)'
        }
      }
    },
    series: [
      {
        name: '活跃信号',
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: {
          color: '#c4ef28',
          width: 2
        },
        itemStyle: {
          color: '#d1ff37',
          borderColor: '#0f1317',
          borderWidth: 1
        },
        areaStyle: {
          color: 'rgba(196, 239, 40, 0.16)'
        },
        data: data.map((item) => item.value)
      }
    ]
  };
}

function buildTechTrendOption(stackAnalysis: StackAnalysisData): EChartsOption {
  const series = stackAnalysis.trendSeries.slice(0, 3);

  return {
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#0d1114',
      borderColor: 'rgba(184,255,59,0.18)',
      textStyle: {
        color: '#f3ebdd'
      }
    },
    grid: {
      top: 20,
      left: 30,
      right: 12,
      bottom: 26
    },
    xAxis: {
      type: 'category',
      data: stackAnalysis.trendMonths.map((item) => item.slice(5)),
      axisLabel: {
        color: '#7e887e',
        fontSize: 10
      },
      axisLine: {
        lineStyle: {
          color: 'rgba(255,255,255,0.06)'
        }
      }
    },
    yAxis: {
      type: 'value',
      axisLabel: {
        color: '#7e887e',
        fontSize: 10,
        formatter: '{value}%'
      },
      splitLine: {
        lineStyle: {
          color: 'rgba(255,255,255,0.05)'
        }
      }
    },
    series: series.map((item, index) => ({
      name: item.name,
      type: 'line',
      smooth: true,
      symbol: 'circle',
      symbolSize: 5,
      lineStyle: {
        width: 2,
        color: getTrendSeriesColor(index)
      },
      itemStyle: {
        color: getTrendSeriesColor(index),
        borderColor: '#0f1317',
        borderWidth: 1
      },
      data: item.values
    }))
  };
}

function buildRhythmOption(data: RepoActivityPoint[], rangeDays: InsightRangeDays): EChartsOption {
  const sliced = data.slice(rangeDays === 90 ? -12 : -14);

  return {
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#0d1114',
      borderColor: 'rgba(184,255,59,0.18)',
      textStyle: {
        color: '#f3ebdd'
      }
    },
    grid: {
      top: 14,
      left: 24,
      right: 10,
      bottom: 20
    },
    xAxis: {
      type: 'category',
      data: sliced.map((item) => item.label.replace('2026-', '').replace('2025-', '')),
      axisLabel: {
        color: '#7e887e',
        fontSize: 10
      },
      axisLine: {
        lineStyle: {
          color: 'rgba(255,255,255,0.06)'
        }
      }
    },
    yAxis: {
      type: 'value',
      axisLabel: {
        color: '#7e887e',
        fontSize: 10
      },
      splitLine: {
        lineStyle: {
          color: 'rgba(255,255,255,0.04)'
        }
      }
    },
    series: [
      {
        type: 'bar',
        barWidth: 9,
        itemStyle: {
          color: '#bde82c',
          borderRadius: [8, 8, 0, 0]
        },
        emphasis: {
          itemStyle: {
            color: '#d4ff4b'
          }
        },
        data: sliced.map((item) => item.count)
      }
    ]
  };
}

function formatInsightShare(value: number, total: number): string {
  if (total <= 0) {
    return '0 条';
  }

  const share = ((value / total) * 100).toFixed(1);
  return `${formatNumber(value)} (${share}%)`;
}

function getTrendSeriesColor(index: number): string {
  const colors = ['#c6e83a', '#5ab8ff', '#8f87ff'];
  return colors[index] ?? '#c6c9d2';
}

export default InsightCenterPage;
