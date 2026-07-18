import { useCallback, useEffect, useId, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import type { EChartsOption } from 'echarts';
import ReactECharts from 'echarts-for-react';
import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  AlertCircle,
  BarChart3,
  CheckCircle2,
  Clock3,
  Copy,
  FolderOpen,
  GitBranch,
  GitCommitHorizontal,
  RefreshCw,
  Settings2,
  User
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { ConfigWorkbench } from '@/components/commons/ConfigWorkbench';
import { EmptyState } from '@/components/commons/EmptyState';
import { LoadingBlock } from '@/components/commons/LoadingBlock';
import { PanelHeading } from '@/components/commons/PanelHeading';
import { ScoreRing } from '@/components/commons/ScoreRing';
import { useAppStore } from '@/store/appStore';
import type {
  HeatmapCell,
  InsightCard,
  OverviewData,
  RankingItem,
  RepoActivityPoint,
  RepoDetail
} from '@/types/api';
import {
  fetchInsights,
  fetchOverview,
  fetchRepositoryActivity,
  fetchRepositoryDetail
} from '@/utils/api';
import { formatDateTime, formatNumber, translateSyncStatus } from '@/utils/date';
import { buildHeatmapMatrix, buildHeatmapMonthLabels, getLongestHeatmapStreak } from '@/utils/heatmap';
import { getResponsiveChartHeight, useResponsiveViewport, type ResponsiveViewport } from '@/utils/responsive';
import './index.scss';

type MetricIconName = 'repos' | 'commits' | 'active' | 'views' | 'clones';
type HeaderIconName = 'user' | 'clock' | 'sync' | 'success' | 'github' | 'settings';
type InsightLevel = 'focus' | 'up' | 'risk';
type TrendGranularity = 'day' | 'week' | 'month';
type ConfigModalStatus = 'closed' | 'open' | 'closing';

const CONFIG_MODAL_EXIT_DELAY_MS = 260;
const MODAL_FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(', ');

interface LanguageDonutItem {
  name: string;
  value: number;
  color: string;
}

const HEADER_ICON_MAP: Record<HeaderIconName, LucideIcon> = {
  user: User,
  clock: Clock3,
  sync: RefreshCw,
  success: CheckCircle2,
  github: GitBranch,
  settings: Settings2
};

const METRIC_ICON_MAP: Record<MetricIconName, LucideIcon> = {
  repos: FolderOpen,
  commits: GitCommitHorizontal,
  active: Activity,
  views: BarChart3,
  clones: Copy
};

function getModalFocusableElements(container: HTMLElement | null): HTMLElement[] {
  if (!container) {
    return [];
  }

  return Array.from(container.querySelectorAll<HTMLElement>(MODAL_FOCUSABLE_SELECTOR)).filter((element) => {
    if (element.getAttribute('aria-hidden') === 'true') {
      return false;
    }

    return element.getClientRects().length > 0;
  });
}

/**
 * 页面说明：首页 Dashboard。
 * Props 类型：无。
 * 含义：按参考图重构 CodeView 总览界面。
 * 是否必填：无。
 * 默认值：无。
 */
function DashboardPage(): JSX.Element {
  const { config, selectedRepoId, setSelectedRepoId } = useAppStore();
  const viewport = useResponsiveViewport();
  const configModalTitleId = useId();
  const configModalRef = useRef<HTMLElement | null>(null);
  const configModalLastActiveRef = useRef<HTMLElement | null>(null);
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [insights, setInsights] = useState<InsightCard[]>([]);
  const [featuredRepo, setFeaturedRepo] = useState<RepoDetail | null>(null);
  const [featuredDay, setFeaturedDay] = useState<RepoActivityPoint[]>([]);
  const [featuredWeek, setFeaturedWeek] = useState<RepoActivityPoint[]>([]);
  const [featuredMonth, setFeaturedMonth] = useState<RepoActivityPoint[]>([]);
  const [trendGranularity, setTrendGranularity] = useState<TrendGranularity>('day');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [actionError, setActionError] = useState<string>('');
  const [configModalStatus, setConfigModalStatus] = useState<ConfigModalStatus>('closed');
  const configModalCloseTimerRef = useRef<number | null>(null);
  const configModalVisible = configModalStatus !== 'closed';

  useEffect(() => {
    if (!config) {
      return;
    }

    if (!config.githubUsername || !config.hasToken) {
      setConfigModalStatus('open');
    }
  }, [config]);

  useEffect(() => {
    return () => {
      if (configModalCloseTimerRef.current !== null) {
        window.clearTimeout(configModalCloseTimerRef.current);
      }
    };
  }, []);

  const openConfigQuickConfig = useCallback((event?: ReactMouseEvent<HTMLButtonElement>): void => {
    if (configModalCloseTimerRef.current !== null) {
      window.clearTimeout(configModalCloseTimerRef.current);
      configModalCloseTimerRef.current = null;
    }

    if (event?.currentTarget) {
      configModalLastActiveRef.current = event.currentTarget;
    } else if (document.activeElement instanceof HTMLElement) {
      configModalLastActiveRef.current = document.activeElement;
    }

    setConfigModalStatus('open');
  }, []);

  const closeConfigQuickConfig = useCallback((): void => {
    if (configModalStatus === 'closed' || configModalStatus === 'closing') {
      return;
    }

    if (configModalCloseTimerRef.current !== null) {
      window.clearTimeout(configModalCloseTimerRef.current);
    }

    setConfigModalStatus('closing');
    configModalCloseTimerRef.current = window.setTimeout(() => {
      setConfigModalStatus('closed');
      configModalCloseTimerRef.current = null;

      if (configModalLastActiveRef.current?.isConnected) {
        configModalLastActiveRef.current.focus();
      }
    }, CONFIG_MODAL_EXIT_DELAY_MS);
  }, [configModalStatus]);

  useEffect(() => {
    if (!configModalVisible) {
      return;
    }

    const scrollY = window.scrollY;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const previousOverflow = document.body.style.overflow;
    const previousPosition = document.body.style.position;
    const previousTop = document.body.style.top;
    const previousWidth = document.body.style.width;
    const previousLeft = document.body.style.left;
    const previousRight = document.body.style.right;

    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.left = '0';
    document.body.style.right = '0';
    document.body.style.width = '100%';

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeConfigQuickConfig();
        return;
      }

      if (event.key !== 'Tab') {
        return;
      }

      const focusableElements = getModalFocusableElements(configModalRef.current);

      if (focusableElements.length === 0) {
        event.preventDefault();
        configModalRef.current?.focus();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      const activeElement = document.activeElement;
      const focusInsideModal = activeElement instanceof Node && configModalRef.current?.contains(activeElement);

      if (event.shiftKey) {
        if (!focusInsideModal || activeElement === firstElement) {
          event.preventDefault();
          lastElement.focus();
        }

        return;
      }

      if (!focusInsideModal || activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.body.style.overflow = previousOverflow;
      document.body.style.position = previousPosition;
      document.body.style.top = previousTop;
      document.body.style.width = previousWidth;
      document.body.style.left = previousLeft;
      document.body.style.right = previousRight;
      window.scrollTo(0, scrollY);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [closeConfigQuickConfig, configModalVisible]);

  useEffect(() => {
    if (configModalStatus !== 'open') {
      return;
    }

    const focusTimer = window.setTimeout(() => {
      const focusableElements = getModalFocusableElements(configModalRef.current);
      const nextFocusedElement = focusableElements[0] ?? configModalRef.current;
      nextFocusedElement?.focus();
    }, 32);

    return () => {
      window.clearTimeout(focusTimer);
    };
  }, [configModalStatus]);

  useEffect(() => {
    let active = true;

    const loadDashboard = async (): Promise<void> => {
      setLoading(true);

      try {
        const [overviewResult, insightsResult] = await Promise.all([fetchOverview(), fetchInsights()]);

        if (!active) {
          return;
        }

        setOverview(overviewResult);
        setInsights(insightsResult);
        setError('');

        if (!selectedRepoId && overviewResult.featuredRepoId) {
          setSelectedRepoId(overviewResult.featuredRepoId);
        }
      } catch (requestError) {
        if (active) {
          setError(requestError instanceof Error ? requestError.message : '首页数据加载失败');
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void loadDashboard();

    return () => {
      active = false;
    };
  }, [selectedRepoId, setSelectedRepoId]);

  useEffect(() => {
    if (!selectedRepoId) {
      return;
    }

    let active = true;

    const loadFeaturedRepo = async (): Promise<void> => {
      try {
        const [detail, day, week, month] = await Promise.all([
          fetchRepositoryDetail(selectedRepoId),
          fetchRepositoryActivity(selectedRepoId, 'day'),
          fetchRepositoryActivity(selectedRepoId, 'week'),
          fetchRepositoryActivity(selectedRepoId, 'month')
        ]);

        if (!active) {
          return;
        }

        setFeaturedRepo(detail);
        setFeaturedDay(day);
        setFeaturedWeek(week);
        setFeaturedMonth(month);
      } catch (requestError) {
        if (active) {
          setActionError(requestError instanceof Error ? requestError.message : '项目详情加载失败');
        }
      }
    };

    void loadFeaturedRepo();

    return () => {
      active = false;
    };
  }, [selectedRepoId]);

  const heatmapModel = useMemo(() => buildHeatmapMatrix(overview?.personalHeatmap ?? []), [overview?.personalHeatmap]);
  const heatmapMonthLabels = useMemo(() => buildHeatmapMonthLabels(heatmapModel.months), [heatmapModel.months]);
  const longestStreak = useMemo(
    () => getLongestHeatmapStreak(overview?.personalHeatmap ?? []),
    [overview?.personalHeatmap]
  );
  const activeDaysCurrentMonth = useMemo(
    () => getCurrentMonthActiveDays(overview?.personalHeatmap ?? []),
    [overview?.personalHeatmap]
  );
  const averageDailyCommits = useMemo(
    () => getAverageDailyCommits(overview?.personalHeatmap ?? []),
    [overview?.personalHeatmap]
  );

  const stackTags = useMemo(
    () => (overview?.stackTags ?? []).map((item) => `${item.tag}`),
    [overview?.stackTags]
  );
  const projectionSeries = useMemo(
    () => buildStackProjectionSeries(overview?.languageDistribution ?? []),
    [overview?.languageDistribution]
  );
  const languageDonutData = useMemo(
    () => normalizeLanguageDistribution(overview?.languageDistribution ?? []),
    [overview?.languageDistribution]
  );
  const maxRankingCommitCount = useMemo(
    () => (overview?.rankings ?? []).reduce((max, item) => Math.max(max, item.commitCount30d), 0),
    [overview?.rankings]
  );

  const selectedTrendData = useMemo(() => {
    if (trendGranularity === 'week') {
      return featuredWeek;
    }

    if (trendGranularity === 'month') {
      return featuredMonth;
    }

    return featuredDay;
  }, [featuredDay, featuredMonth, featuredWeek, trendGranularity]);

  const metricIcons: MetricIconName[] = ['repos', 'commits', 'active', 'views', 'clones'];

  if (loading) {
    return <LoadingBlock text="正在加载 Dashboard" />;
  }

  if (error || !overview) {
    return <EmptyState title="首页数据暂不可用" description={error || '请先完成配置并同步数据。'} />;
  }

  return (
    <div className="dashboard">
      <div className="dashboard__shell" aria-hidden={configModalVisible}>
      <section className="dashboard__topbar">
        <TopInfoCell
          icon="user"
          label="用户名"
          value={config?.githubUsername || 'your-username'}
          subValue={config?.hasToken ? 'GitHub Token 已连接' : '等待连接 GitHub'}
        />
        <TopInfoCell
          icon="clock"
          label="当前时间"
          value={formatDateTime(overview.header.currentTime)}
          subValue={`时区 ${config?.timezone || 'Asia/Shanghai'}`}
        />
        <TopInfoCell
          icon="success"
          label="同步状态"
          value={translateSyncStatus(overview.header.syncStatus)}
          subValue={config?.hasToken ? '同步已就绪' : '请先配置 Token'}
        />
        <TopInfoCell
          icon="sync"
          label="最近同步时间"
          value={formatDateTime(overview.header.lastSyncedAt)}
          subValue={config?.includePrivateRepos ? '公开仓库 + 私有仓库' : '仅同步公开仓库'}
        />
        <div className="dashboard__topbar-actions">
          <button className="dashboard__connect" onClick={(event) => openConfigQuickConfig(event)}>
            <span className="dashboard__connect-dot" aria-hidden="true" />
            <HeaderIcon name="github" />
            <span>GitHub 连接</span>
          </button>
          <button className="dashboard__gear" onClick={(event) => openConfigQuickConfig(event)} aria-label="打开快捷配置">
            <HeaderIcon name="settings" />
          </button>
        </div>
      </section>

      <section className="dashboard__metrics">
        {overview.kpis.map((item, index) => (
          <article key={item.label} className="dashboard-metric">
            <div className="dashboard-metric__icon">
              <MetricIcon name={metricIcons[index] ?? 'repos'} />
            </div>
            <div className="dashboard-metric__content">
              <span className="dashboard-metric__label">{item.label}</span>
              <strong className="dashboard-metric__value">{item.value}</strong>
              <span className="dashboard-metric__hint">{item.hint}</span>
            </div>
          </article>
        ))}
      </section>

      {actionError && <div className="dashboard__banner-error">{actionError}</div>}

      <section className="dashboard__grid">
        <section className="dashboard-panel dashboard-panel--activity">
          <PanelHeading variant="dashboard" eyebrow="ACTIVITY MATRIX" title="个人活动矩阵" />

          <div className="dashboard-heatmap">
            <div className="dashboard-heatmap__header">
              <strong>
                个人提交热力图
                <span>（过去 12 个月）</span>
              </strong>
              <span className="dashboard-heatmap__legend">
                <span>少</span>
                <span className="dashboard-heatmap__legend-scale" aria-hidden="true">
                  <i className="dashboard-heatmap__legend-cell dashboard-heatmap__legend-cell--0" />
                  <i className="dashboard-heatmap__legend-cell dashboard-heatmap__legend-cell--1" />
                  <i className="dashboard-heatmap__legend-cell dashboard-heatmap__legend-cell--2" />
                  <i className="dashboard-heatmap__legend-cell dashboard-heatmap__legend-cell--3" />
                  <i className="dashboard-heatmap__legend-cell dashboard-heatmap__legend-cell--4" />
                </span>
                <span>多</span>
              </span>
            </div>
            <div className="dashboard-heatmap__body">
              <div className="dashboard-heatmap__weekdays">
                {['周一', '', '周三', '', '周五', '', '周日'].map((label, index) => (
                  <span key={`${label || 'empty'}-${index}`}>{label}</span>
                ))}
              </div>
              <div className="dashboard-heatmap__main">
                <div className="dashboard-heatmap__grid">
                  {heatmapModel.cells.map((cell) => (
                    <span
                      key={cell.key}
                      className={getHeatLevelClass(cell.count, heatmapModel.maxValue)}
                      title={`${cell.date} · ${cell.count} 次提交`}
                      style={{
                        gridColumn: cell.column + 1,
                        gridRow: cell.row + 1
                      }}
                    />
                  ))}
                </div>
                <div className="dashboard-heatmap__months">
                  {heatmapMonthLabels.map((label) => (
                    <span key={label}>{label}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="dashboard-activity-trend">
            <div className="dashboard-activity-trend__header">
              <strong>近 30 天日提交趋势</strong>
              <span>按自然日统计</span>
            </div>
            <ReactECharts
              option={buildActivityTrendOption(overview.personalTrend, viewport)}
              style={{ height: getResponsiveChartHeight(viewport, { desktop: 212, tablet: 192, mobile: 176 }) }}
              opts={{ renderer: 'svg' }}
            />
          </div>

          <div className="dashboard-activity-stats">
            <ActivityStatCard label="最长连续提交天数" value={`${longestStreak} 天`} hint="截止今天" />
            <ActivityStatCard label="本月活跃天数" value={`${activeDaysCurrentMonth} 天`} hint="按自然月统计" />
            <ActivityStatCard label="平均每日提交数" value={averageDailyCommits} hint="近 30 天均值" />
          </div>
        </section>

        <section className="dashboard-panel dashboard-panel--repo">
          <PanelHeading variant="dashboard" eyebrow="REPO OPERATIONS" title="项目运营中心" />

          <div className="dashboard-repo">
            <div className="dashboard-repo__ranking">
              <div className="dashboard-repo__ranking-header">
                <div className="dashboard-repo__block-title">
                  <span className="dashboard-repo__ranking-title-main">项目活跃排行榜</span>
                  <span className="dashboard-repo__ranking-title-sub">（近 30 天）</span>
                </div>
                <div className="dashboard-repo__rank-head">
                  <span>提交数</span>
                  <span>活跃天数</span>
                </div>
              </div>
              {overview.rankings.length > 0 ? (
                overview.rankings.slice(0, 5).map((item, index) => (
                  <button
                    key={item.repoId}
                    type="button"
                    className={
                      item.repoId === selectedRepoId
                        ? 'dashboard-repo__rank-item dashboard-repo__rank-item--active'
                        : 'dashboard-repo__rank-item'
                    }
                    onClick={() => setSelectedRepoId(item.repoId)}
                    >
                    <span className="dashboard-repo__rank-index">{index + 1}</span>
                    <div className="dashboard-repo__rank-main">
                      <div className="dashboard-repo__rank-row">
                        <div className="dashboard-repo__rank-copy">
                          <strong>{item.name}</strong>
                          <small>{buildRankingSubtitle(item)}</small>
                        </div>
                        <div className="dashboard-repo__rank-metrics">
                          <span>{item.commitCount30d}</span>
                          <span>{item.activeDays30d}</span>
                        </div>
                      </div>
                      <span className="dashboard-repo__rank-progress">
                        <i
                          style={{
                            width: `${getRankingProgressWidth(item.commitCount30d, maxRankingCommitCount)}%`
                          }}
                        />
                      </span>
                    </div>
                  </button>
                ))
              ) : (
                <EmptyState title="暂无项目排行" description="完成同步后这里会展示近 30 天最活跃的仓库。" />
              )}
              {overview.rankings.length > 0 && (
                <Link className="dashboard-repo__ranking-link" to="/repos">
                  <span>查看全部项目</span>
                  <span aria-hidden="true">→</span>
                </Link>
              )}
            </div>

            <div className="dashboard-repo__detail">
              {featuredRepo ? (
                <>
                  <div className="dashboard-repo__detail-head">
                    <div className="dashboard-repo__detail-icon">
                      <MetricIcon name="repos" />
                    </div>
                    <div className="dashboard-repo__detail-copy">
                      <strong>{featuredRepo.name}</strong>
                      <p>{featuredRepo.description || '个人项目资产看板系统'}</p>
                    </div>
                  </div>

                  <div className="dashboard-repo__detail-techs">
                    {buildRepoTechTags(featuredRepo).map((item, index) => (
                      <span key={`${item}-${index}`} className="dashboard-repo__detail-tech">
                        <i
                          aria-hidden="true"
                          className={`dashboard-repo__detail-tech-dot dashboard-repo__detail-tech-dot--${index % 4}`}
                        />
                        {item}
                      </span>
                    ))}
                  </div>

                  <div className="dashboard-repo__detail-metrics">
                    <div className="dashboard-repo__detail-metric-grid dashboard-repo__detail-metric-grid--primary">
                      <RepoMetricCell label="近 30 天提交数" value={formatNumber(featuredRepo.commitCount30d)} />
                      <RepoMetricCell label="活跃天数" value={formatNumber(featuredRepo.activeDays30d)} />
                    </div>
                    <div className="dashboard-repo__detail-metric-grid dashboard-repo__detail-metric-grid--secondary">
                      <RepoMetricCell label="最近提交时间" value={formatRepoCardDateTime(featuredRepo.lastCommitAt)} compact />
                      <RepoMetricCell label="Star 数" value={formatNumber(featuredRepo.starsCount)} compact />
                      <RepoMetricCell label="Fork 数" value={formatNumber(featuredRepo.forksCount)} compact />
                    </div>
                  </div>

                  <div className="dashboard-repo__detail-footer">
                    <div className="dashboard-repo__detail-score">
                      <span className="dashboard-repo__detail-score-label">综合评分</span>
                      <ScoreRing variant="dashboard" score={featuredRepo.score} />
                    </div>
                    <Link className="dashboard-repo__detail-link" to={`/repos/${featuredRepo.id}`}>
                      <span>查看详情</span>
                      <span aria-hidden="true">→</span>
                    </Link>
                  </div>
                </>
              ) : (
                <EmptyState title="暂无项目详情" description="点击左侧排行项目后，这里会显示重点仓库画像。" />
              )}
            </div>
          </div>

          <div className="dashboard-repo__trend">
            <div className="dashboard-repo__trend-head">
              <div className="dashboard-repo__block-title">提交趋势</div>
              <div className="dashboard-repo__tabs">
                {(['day', 'week', 'month'] as TrendGranularity[]).map((item) => (
                  <button
                    key={item}
                    type="button"
                    className={
                      item === trendGranularity
                        ? 'dashboard-repo__tab dashboard-repo__tab--active'
                        : 'dashboard-repo__tab'
                    }
                    onClick={() => setTrendGranularity(item)}
                  >
                    {item === 'day' ? '日趋势' : item === 'week' ? '周趋势' : '月趋势'}
                  </button>
                ))}
              </div>
            </div>
            <ReactECharts
              option={buildRepoBarOption(selectedTrendData, viewport)}
              style={{ height: getResponsiveChartHeight(viewport, { desktop: 190, tablet: 176, mobile: 164 }) }}
              opts={{ renderer: 'svg' }}
            />
          </div>
        </section>

        <section className="dashboard-panel dashboard-panel--stack">
          <PanelHeading variant="dashboard" eyebrow="STACK PROFILE" title="技术栈看板" />

          <div className="dashboard-stack__block">
            <div className="dashboard-stack__block-title">语言占比（按字节数）</div>
            {overview.languageDistribution.length > 0 ? (
              <div className="dashboard-language">
                <div className="dashboard-language__chart">
                  <ReactECharts
                    option={buildLanguageDonutOption(languageDonutData, viewport)}
                    style={{ height: getResponsiveChartHeight(viewport, { desktop: 196, tablet: 188, mobile: 178 }) }}
                    opts={{ renderer: 'svg' }}
                  />
                </div>
                <div className="dashboard-language__legend">
                  {languageDonutData.map((item) => (
                    <div key={item.name} className="dashboard-language__legend-item">
                      <span className="dashboard-language__legend-label">
                        <i
                          className="dashboard-language__legend-dot"
                          aria-hidden="true"
                          style={{ backgroundColor: item.color }}
                        />
                        <span>{item.name}</span>
                      </span>
                      <strong>{item.value.toFixed(1)}%</strong>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <EmptyState title="暂无语言分布" description="同步语言数据后这里会展示当前主力语言结构。" />
            )}
          </div>

          <div className="dashboard-stack__block">
            <div className="dashboard-stack__block-title">技术栈标签</div>
            <div className="dashboard-stack__tags">
              {stackTags.length > 0 ? stackTags.map((item) => <span key={item}>{item}</span>) : <span>等待同步后生成</span>}
            </div>
          </div>

          <div className="dashboard-stack__block">
            <div className="dashboard-stack__block-title">栈变化趋势（按当前构成投影）</div>
            <ReactECharts
              option={buildStackProjectionOption(projectionSeries, viewport)}
              style={{ height: getResponsiveChartHeight(viewport, { desktop: 178, tablet: 170, mobile: 164 }) }}
              opts={{ renderer: 'svg' }}
            />
          </div>
        </section>
      </section>

      <section className="dashboard-panel dashboard-insights-panel">
        <PanelHeading variant="dashboard" eyebrow="INSIGHTS" title="智能洞察" />
        <section className="dashboard__insights">
          {insights.slice(0, 5).map((item) => (
            <article key={item.id} className="dashboard-insight">
              <div className="dashboard-insight__head">
                <InsightMarker level={normalizeInsightLevel(item.level)} />
                <span className={`dashboard-insight__badge dashboard-insight__badge--${normalizeInsightLevel(item.level)}`}>
                  {item.level}
                </span>
              </div>
              <strong className="dashboard-insight__title">{item.title}</strong>
              <p className="dashboard-insight__summary">{item.summary}</p>
            </article>
          ))}
        </section>
      </section>
      </div>

      {configModalVisible && (
        <div
          className={
            configModalStatus === 'closing'
              ? 'dashboard-config-modal__backdrop dashboard-config-modal__backdrop--closing'
              : 'dashboard-config-modal__backdrop dashboard-config-modal__backdrop--open'
          }
          onClick={() => {
            closeConfigQuickConfig();
          }}
        >
          <section
            ref={configModalRef}
            className={
              configModalStatus === 'closing'
                ? 'dashboard-config-modal dashboard-config-modal--closing'
                : 'dashboard-config-modal dashboard-config-modal--open'
            }
            role="dialog"
            aria-modal="true"
            aria-labelledby={configModalTitleId}
            tabIndex={-1}
            onClick={(event) => {
              event.stopPropagation();
            }}
          >
            <header className="dashboard-config-modal__header">
              <div className="dashboard-config-modal__copy">
                <p className="dashboard-config-modal__eyebrow">Quick Config</p>
                <h2 id={configModalTitleId} className="dashboard-config-modal__title">首页快捷配置</h2>
                <p className="dashboard-config-modal__description">
                  此弹窗与配置中心使用同一套配置项、同一套保存逻辑和同一套说明文案。
                </p>
              </div>
              <div className="dashboard-config-modal__actions">
                <Link className="dashboard-config-modal__link" to="/config-center" onClick={closeConfigQuickConfig}>
                  打开独立配置中心
                </Link>
                <button type="button" className="dashboard-config-modal__close" onClick={closeConfigQuickConfig}>
                  关闭
                </button>
              </div>
            </header>

            <div className="dashboard-config-modal__body">
              <ConfigWorkbench variant="modal" />
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function TopInfoCell(props: {
  icon: HeaderIconName;
  label: string;
  value: string;
  subValue: string;
}): JSX.Element {
  const { icon, label, value, subValue } = props;

  return (
    <div className="dashboard__topbar-cell">
      <div className="dashboard__topbar-icon">
        <HeaderIcon name={icon} />
      </div>
      <div className="dashboard__topbar-copy">
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{subValue}</small>
      </div>
    </div>
  );
}

function ActivityStatCard(props: { label: string; value: string; hint: string }): JSX.Element {
  const { label, value, hint } = props;

  return (
    <div className="dashboard-activity-stat">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{hint}</small>
    </div>
  );
}

function RepoMetricCell(props: { label: string; value: string; compact?: boolean }): JSX.Element {
  const { label, value, compact = false } = props;

  return (
    <div className={compact ? 'dashboard-repo__detail-metric dashboard-repo__detail-metric--compact' : 'dashboard-repo__detail-metric'}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function InsightMarker(props: { level: InsightLevel }): JSX.Element {
  const { level } = props;

  return (
    <span className={`dashboard-insight__marker dashboard-insight__marker--${level}`}>
      <AlertCircle aria-hidden="true" strokeWidth={1.8} />
    </span>
  );
}

function HeaderIcon(props: { name: HeaderIconName }): JSX.Element {
  const { name } = props;
  const Icon = HEADER_ICON_MAP[name];

  return <Icon aria-hidden="true" strokeWidth={1.8} />;
}

function MetricIcon(props: { name: MetricIconName }): JSX.Element {
  const { name } = props;
  const Icon = METRIC_ICON_MAP[name];

  return <Icon aria-hidden="true" strokeWidth={1.8} />;
}

function formatRepoCardDateTime(value: string | null): string {
  if (!value) {
    return '--';
  }

  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');

  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

function buildRepoTechTags(repo: RepoDetail): string[] {
  const candidates = [
    ...repo.tags.map((item) => item.tag.trim()),
    repo.mainLanguage.trim(),
    ...repo.languages.map((item) => item.language.trim())
  ].filter((item) => item.length > 0);

  const uniqueItems = candidates.filter((item, index, array) => {
    const normalizedItem = item.toLowerCase();
    return array.findIndex((current) => current.toLowerCase() === normalizedItem) === index;
  });

  return uniqueItems.slice(0, 4);
}

function buildRankingSubtitle(item: RankingItem): string {
  const stackSummary = item.stackTags.join(' · ').trim();
  return stackSummary || item.fullName;
}

function buildActivityTrendOption(
  data: Array<{ date: string; count: number }>,
  viewport: ResponsiveViewport
): EChartsOption {
  const sliced = data.slice(-30);
  const isMobile = viewport === 'mobile';

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
      top: isMobile ? 16 : 20,
      left: isMobile ? 26 : 34,
      right: isMobile ? 8 : 12,
      bottom: isMobile ? 20 : 22
    },
    xAxis: {
      type: 'category',
      data: sliced.map((item) => item.date.slice(5)),
      axisLabel: {
        color: '#7e887e',
        fontSize: isMobile ? 9 : 10
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
        fontSize: isMobile ? 9 : 10
      },
      splitLine: {
        lineStyle: {
          color: 'rgba(255,255,255,0.05)'
        }
      }
    },
    series: [
      {
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: isMobile ? 5 : 6,
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
        data: sliced.map((item) => item.count)
      }
    ]
  };
}

function buildRepoBarOption(data: RepoActivityPoint[], viewport: ResponsiveViewport): EChartsOption {
  const sliced = data.slice(-18);
  const isMobile = viewport === 'mobile';

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
      top: isMobile ? 14 : 18,
      left: isMobile ? 24 : 28,
      right: isMobile ? 8 : 10,
      bottom: isMobile ? 22 : 24
    },
    xAxis: {
      type: 'category',
      data: sliced.map((item) => item.label.replace('2026-', '')),
      axisLabel: {
        color: '#7e887e',
        fontSize: isMobile ? 9 : 10
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
        fontSize: isMobile ? 9 : 10
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
        barWidth: isMobile ? 8 : 10,
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

function normalizeLanguageDistribution(data: Array<{ name: string; value: number }>): LanguageDonutItem[] {
  const visibleLimit = 6;
  const total = data.reduce((sum, item) => sum + item.value, 0);
  const colorPalette = ['#c6e83a', '#58b4ff', '#4f7eff', '#7b87ff', '#f6a154', '#78c8ff', '#c3c9d4'];

  const sortedItems = [...data].sort((left, right) => right.value - left.value);
  const mainItems = sortedItems.slice(0, visibleLimit);
  const otherValue = sortedItems.slice(visibleLimit).reduce((sum, item) => sum + item.value, 0);
  const normalizedItems = otherValue > 0 ? [...mainItems, { name: '其他', value: otherValue }] : mainItems;

  return normalizedItems.map((item, index) => ({
    name: item.name,
    value: total > 0 ? Number(((item.value / total) * 100).toFixed(1)) : 0,
    color: colorPalette[index] ?? '#c6c9d2'
  }));
}

function buildLanguageDonutOption(data: LanguageDonutItem[], viewport: ResponsiveViewport): EChartsOption {
  const top = data[0];
  const isMobile = viewport === 'mobile';

  return {
    color: data.map((item) => item.color),
    tooltip: {
      trigger: 'item',
      backgroundColor: '#0d1114',
      borderColor: 'rgba(184,255,59,0.18)',
      textStyle: {
        color: '#f3ebdd'
      },
      formatter: '{b}<br />占比 {c}%'
    },
    graphic: top
      ? [
          {
            type: 'text',
            left: 'center',
            top: '41%',
            silent: true,
            style: {
              text: '主要语言',
              fill: '#88909b',
              fontSize: isMobile ? 8 : 9,
              fontWeight: 500,
              align: 'center'
            }
          },
          {
            type: 'text',
            left: 'center',
            top: '49%',
            silent: true,
            style: {
              text: top.name,
              fill: '#f4f7fb',
              fontSize: isMobile ? 10 : 12,
              fontWeight: 700,
              align: 'center'
            }
          },
          {
            type: 'text',
            left: 'center',
            top: '58%',
            silent: true,
            style: {
              text: `${top.value.toFixed(1)}%`,
              fill: '#d9dde4',
              fontSize: isMobile ? 10 : 11,
              fontWeight: 600,
              align: 'center'
            }
          }
        ]
      : undefined,
    series: [
      {
        type: 'pie',
        radius: isMobile ? ['50%', '74%'] : ['53%', '78%'],
        center: ['50%', '54%'],
        startAngle: 88,
        avoidLabelOverlap: false,
        label: {
          show: false
        },
        emphasis: {
          scale: true,
          itemStyle: {
            shadowBlur: 14,
            shadowColor: 'rgba(59,196,255,0.18)'
          }
        },
        itemStyle: {
          borderColor: '#091019',
          borderWidth: 2
        },
        data
      }
    ]
  };
}

function buildStackProjectionOption(
  series: Array<{ name: string; values: number[] }>,
  viewport: ResponsiveViewport
): EChartsOption {
  const isMobile = viewport === 'mobile';

  return {
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#0d1114',
      borderColor: 'rgba(184,255,59,0.18)',
      textStyle: {
        color: '#f3ebdd'
      }
    },
    legend: {
      top: 0,
      right: isMobile ? 'center' : 0,
      left: isMobile ? 'center' : 'auto',
      itemWidth: isMobile ? 8 : 10,
      itemHeight: isMobile ? 8 : 10,
      textStyle: {
        color: '#d7dccf',
        fontSize: isMobile ? 9 : 10
      }
    },
    grid: {
      top: isMobile ? 42 : 30,
      left: isMobile ? 24 : 28,
      right: isMobile ? 8 : 10,
      bottom: isMobile ? 22 : 24
    },
    xAxis: {
      type: 'category',
      data: ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06'],
      axisLabel: {
        color: '#7e887e',
        fontSize: isMobile ? 9 : 10
      },
      axisLine: {
        lineStyle: {
          color: 'rgba(255,255,255,0.06)'
        }
      }
    },
    yAxis: {
      type: 'value',
      max: 60,
      axisLabel: {
        color: '#7e887e',
        fontSize: isMobile ? 9 : 10,
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
      symbolSize: isMobile ? 4 : 5,
      lineStyle: {
        width: 2
      },
      itemStyle: {
        color: ['#c7ef2d', '#63a7ff', '#90a1b6'][index] ?? '#d96c3f'
      },
      data: item.values
    }))
  };
}

function getHeatLevelClass(value: number, maxValue: number): string {
  if (value <= 0 || maxValue <= 0) {
    return 'dashboard-heatmap__cell dashboard-heatmap__cell--0';
  }

  const ratio = value / maxValue;

  if (ratio > 0.8) {
    return 'dashboard-heatmap__cell dashboard-heatmap__cell--5';
  }

  if (ratio > 0.6) {
    return 'dashboard-heatmap__cell dashboard-heatmap__cell--4';
  }

  if (ratio > 0.4) {
    return 'dashboard-heatmap__cell dashboard-heatmap__cell--3';
  }

  if (ratio > 0.2) {
    return 'dashboard-heatmap__cell dashboard-heatmap__cell--2';
  }

  return 'dashboard-heatmap__cell dashboard-heatmap__cell--1';
}

function getCurrentMonthActiveDays(data: HeatmapCell[]): number {
  const currentMonth = new Date().toISOString().slice(0, 7);
  return data.filter((item) => item.date.startsWith(currentMonth) && item.count > 0).length;
}

function getAverageDailyCommits(data: HeatmapCell[]): string {
  const today = new Date();
  const start = new Date(today);
  start.setDate(today.getDate() - 29);
  const startKey = start.toISOString().slice(0, 10);
  const total = data
    .filter((item) => item.date >= startKey)
    .reduce((sum, item) => sum + item.count, 0);

  return (total / 30).toFixed(1);
}

function buildStackProjectionSeries(data: Array<{ name: string; value: number }>): Array<{ name: string; values: number[] }> {
  const total = data.reduce((sum, item) => sum + item.value, 0);

  return data.slice(0, 3).map((item, index) => {
    const base = total > 0 ? Number(((item.value / total) * 100).toFixed(1)) : 0;
    const offsets = [
      [0, 1.2, -1, 0.5, 1.5, -0.4],
      [-0.8, 0.6, 1.1, -1.3, 0.8, 1.4],
      [1, -0.5, 0.7, 1.4, -1.1, 0.5]
    ][index] ?? [0, 0, 0, 0, 0, 0];

    return {
      name: item.name,
      values: offsets.map((offset) => Number(Math.max(0, Math.min(60, base + offset)).toFixed(1)))
    };
  });
}

function normalizeInsightLevel(level: string): InsightLevel {
  if (level === 'risk') {
    return 'risk';
  }

  if (level === 'up') {
    return 'up';
  }

  return 'focus';
}

function getRankingProgressWidth(value: number, maxValue: number): number {
  if (maxValue <= 0) {
    return 0;
  }

  const ratio = (value / maxValue) * 100;
  return Math.max(18, Math.min(100, Number(ratio.toFixed(1))));
}

export default DashboardPage;
