import { useEffect, useMemo, useState } from 'react';
import type { EChartsOption } from 'echarts';
import ReactECharts from 'echarts-for-react';
import { Link } from 'react-router-dom';
import { EmptyState } from '../../components/commons/EmptyState';
import { LoadingBlock } from '../../components/commons/LoadingBlock';
import { useAppStore } from '../../store/appStore';
import type {
  ConfigPayload,
  HeatmapCell,
  InsightCard,
  OverviewData,
  RepoActivityPoint,
  RepoDetail
} from '../../types/api';
import {
  fetchInsights,
  fetchOverview,
  fetchRepositoryActivity,
  fetchRepositoryDetail,
  saveConfig,
  triggerFullSync,
  triggerIncrementalSync
} from '../../utils/api';
import { formatDateTime, formatNumber, translateSyncStatus } from '../../utils/date';
import './index.scss';

interface ConfigFormState extends ConfigPayload {
  githubToken: string;
  emailAliasesText: string;
}

type MetricIconName = 'repos' | 'commits' | 'active' | 'views' | 'clones';
type HeaderIconName = 'user' | 'clock' | 'sync' | 'success' | 'github' | 'settings';
type InsightLevel = 'focus' | 'up' | 'risk';
type TrendGranularity = 'day' | 'week' | 'month';

interface HeatmapMatrixCell {
  key: string;
  date: string;
  count: number;
  column: number;
  row: number;
}

interface HeatmapMatrixModel {
  months: Array<{ label: string; column: number }>;
  cells: HeatmapMatrixCell[];
  maxValue: number;
}

/**
 * 页面说明：首页 Dashboard。
 * Props 类型：无。
 * 含义：按参考图重构 CodeView 总览界面。
 * 是否必填：无。
 * 默认值：无。
 */
function DashboardPage(): JSX.Element {
  const { config, selectedRepoId, setConfig, setSelectedRepoId } = useAppStore();
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
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [configModalOpen, setConfigModalOpen] = useState<boolean>(false);
  const [formState, setFormState] = useState<ConfigFormState>({
    githubUsername: '',
    githubToken: '',
    emailAliases: [],
    emailAliasesText: '',
    includePrivateRepos: false,
    syncIntervalMinutes: 720,
    defaultTimeRange: '30d',
    timezone: 'Asia/Shanghai'
  });

  useEffect(() => {
    if (!config) {
      return;
    }

    setFormState({
      githubUsername: config.githubUsername,
      githubToken: '',
      emailAliases: config.emailAliases,
      emailAliasesText: config.emailAliases.join(', '),
      includePrivateRepos: config.includePrivateRepos,
      syncIntervalMinutes: config.syncIntervalMinutes,
      defaultTimeRange: config.defaultTimeRange as '30d' | '90d' | '180d',
      timezone: config.timezone
    });
  }, [config]);

  useEffect(() => {
    if (!config) {
      return;
    }

    if (!config.githubUsername || !config.hasToken) {
      setConfigModalOpen(true);
    }
  }, [config]);

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
  const longestStreak = useMemo(() => getLongestStreak(overview?.personalHeatmap ?? []), [overview?.personalHeatmap]);
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

  const saveConfigHandler = async (): Promise<void> => {
    setActionLoading(true);
    setActionError('');

    try {
      const payload: ConfigPayload = {
        githubUsername: formState.githubUsername.trim(),
        githubToken: formState.githubToken.trim() || undefined,
        emailAliases: formState.emailAliasesText
          .split(',')
          .map((item) => item.trim())
          .filter((item) => item.length > 0),
        includePrivateRepos: formState.includePrivateRepos,
        syncIntervalMinutes: formState.syncIntervalMinutes,
        defaultTimeRange: formState.defaultTimeRange,
        timezone: formState.timezone.trim()
      };

      const result = await saveConfig(payload);
      setConfig(result);
      setFormState((current) => ({
        ...current,
        githubToken: '',
        emailAliasesText: result.emailAliases.join(', ')
      }));
      setConfigModalOpen(false);
    } catch (requestError) {
      setActionError(requestError instanceof Error ? requestError.message : '保存配置失败');
    } finally {
      setActionLoading(false);
    }
  };

  const syncHandler = async (mode: 'full' | 'incremental'): Promise<void> => {
    setActionLoading(true);
    setActionError('');

    try {
      if (mode === 'full') {
        await triggerFullSync();
      } else {
        await triggerIncrementalSync();
      }

      const [overviewResult, insightsResult] = await Promise.all([fetchOverview(), fetchInsights()]);
      setOverview(overviewResult);
      setInsights(insightsResult);
    } catch (requestError) {
      setActionError(requestError instanceof Error ? requestError.message : '同步失败');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return <LoadingBlock text="正在加载 Dashboard" />;
  }

  if (error || !overview) {
    return <EmptyState title="首页数据暂不可用" description={error || '请先完成配置并同步数据。'} />;
  }

  return (
    <div className="dashboard">
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
          <button className="dashboard__connect" onClick={() => setConfigModalOpen(true)} disabled={actionLoading}>
            <span className="dashboard__connect-dot" aria-hidden="true" />
            <HeaderIcon name="github" />
            <span>GitHub 连接</span>
          </button>
          <button className="dashboard__gear" onClick={() => setConfigModalOpen(true)} disabled={actionLoading}>
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
          <PanelHeading title="ACTIVITY MATRIX" subtitle="个人活动矩阵" />

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
              option={buildActivityTrendOption(overview.personalTrend)}
              style={{ height: 212 }}
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
          <PanelHeading title="REPO OPERATIONS" subtitle="项目运营中心" />

          <div className="dashboard-repo">
            <div className="dashboard-repo__ranking">
              <div className="dashboard-repo__block-title">项目活跃排行榜（近 30 天）</div>
              <div className="dashboard-repo__rank-head">
                <span className="dashboard-repo__rank-head-label">仓库</span>
                <span>提交数</span>
                <span>活跃天数</span>
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
                    <div className="dashboard-repo__rank-copy">
                      <strong>{item.name}</strong>
                      <small>{item.stackTags.join(' · ') || item.fullName}</small>
                      <span className="dashboard-repo__rank-progress">
                        <i
                          style={{
                            width: `${getRankingProgressWidth(item.commitCount30d, maxRankingCommitCount)}%`
                          }}
                        />
                      </span>
                    </div>
                    <div className="dashboard-repo__rank-metrics">
                      <span>{item.commitCount30d}</span>
                      <span>{item.activeDays30d}</span>
                    </div>
                  </button>
                ))
              ) : (
                <EmptyState title="暂无项目排行" description="完成同步后这里会展示近 30 天最活跃的仓库。" />
              )}
            </div>

            <div className="dashboard-repo__detail">
              {featuredRepo ? (
                <>
                  <div className="dashboard-repo__detail-head">
                    <div className="dashboard-repo__detail-icon">
                      <MetricIcon name="repos" />
                    </div>
                    <div>
                      <strong>{featuredRepo.name}</strong>
                      <p>{featuredRepo.description || 'CodeView 项目数据看板'}</p>
                    </div>
                  </div>

                  <div className="dashboard-repo__tags">
                    {featuredRepo.tags.slice(0, 5).map((item) => (
                      <span key={item.tag}>{item.tag}</span>
                    ))}
                  </div>

                  <div className="dashboard-repo__detail-stats">
                    <div>
                      <span>近 30 天提交数</span>
                      <strong>{formatNumber(featuredRepo.commitCount30d)}</strong>
                    </div>
                    <div>
                      <span>活跃天数</span>
                      <strong>{formatNumber(featuredRepo.activeDays30d)}</strong>
                    </div>
                    <div>
                      <span>最近提交时间</span>
                      <strong>{formatDateTime(featuredRepo.lastCommitAt)}</strong>
                    </div>
                    <div>
                      <span>Star / Fork</span>
                      <strong>
                        {featuredRepo.starsCount} / {featuredRepo.forksCount}
                      </strong>
                    </div>
                  </div>

                  <div className="dashboard-repo__detail-footer">
                    <ScoreRing score={featuredRepo.score} />
                    <Link className="dashboard-repo__detail-link" to={`/repos/${featuredRepo.id}`}>
                      查看详情
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
              option={buildRepoBarOption(selectedTrendData)}
              style={{ height: 190 }}
              opts={{ renderer: 'svg' }}
            />
          </div>
        </section>

        <section className="dashboard-panel dashboard-panel--stack">
          <PanelHeading title="STACK PROFILE" subtitle="技术栈看板" />

          <div className="dashboard-stack__block">
            <div className="dashboard-stack__block-title">语言占比（按字节数）</div>
            {overview.languageDistribution.length > 0 ? (
              <ReactECharts
                option={buildLanguageDonutOption(overview.languageDistribution)}
                style={{ height: 260 }}
                opts={{ renderer: 'svg' }}
              />
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
              option={buildStackProjectionOption(projectionSeries)}
              style={{ height: 178 }}
              opts={{ renderer: 'svg' }}
            />
          </div>
        </section>
      </section>

      <section className="dashboard-panel dashboard-insights-panel">
        <header className="dashboard-insights-panel__header">
          <div>
            <p className="dashboard-panel__title">INSIGHTS</p>
            <h2 className="dashboard-panel__subtitle">智能洞察</h2>
          </div>
        </header>
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

      {configModalOpen && (
        <div
          className="dashboard-modal__backdrop"
          onClick={() => {
            if (!actionLoading) {
              setConfigModalOpen(false);
            }
          }}
        >
          <section
            className="dashboard-modal"
            onClick={(event) => {
              event.stopPropagation();
            }}
          >
            <div className="dashboard-modal__header">
              <div>
                <p className="dashboard-modal__eyebrow">GitHub Source Config</p>
                <h2 className="dashboard-modal__title">配置 GitHub 数据源</h2>
                <p className="dashboard-modal__description">填写 GitHub 用户名、Token、邮箱别名和同步参数，然后保存。</p>
              </div>
              <button type="button" className="dashboard-modal__close" onClick={() => setConfigModalOpen(false)} disabled={actionLoading}>
                关闭
              </button>
            </div>

            <div className="form-grid">
              <label className="form-field">
                <span className="form-field__label">GitHub 用户名</span>
                <input
                  value={formState.githubUsername}
                  onChange={(event) =>
                    setFormState((current) => ({ ...current, githubUsername: event.target.value }))
                  }
                  placeholder="例如：octocat"
                />
              </label>
              <label className="form-field">
                <span className="form-field__label">GitHub Token</span>
                <input
                  type="password"
                  value={formState.githubToken}
                  onChange={(event) =>
                    setFormState((current) => ({ ...current, githubToken: event.target.value }))
                  }
                  placeholder={config?.hasToken ? '保持为空则沿用已有 Token' : '输入新 Token'}
                />
              </label>
              <label className="form-field form-grid__full">
                <span className="form-field__label">邮箱别名</span>
                <input
                  value={formState.emailAliasesText}
                  onChange={(event) =>
                    setFormState((current) => ({ ...current, emailAliasesText: event.target.value }))
                  }
                  placeholder="多个邮箱使用逗号分隔"
                />
              </label>
              <label className="form-field">
                <span className="form-field__label">同步周期（分钟）</span>
                <input
                  type="number"
                  min={15}
                  max={1440}
                  value={formState.syncIntervalMinutes}
                  onChange={(event) =>
                    setFormState((current) => ({
                      ...current,
                      syncIntervalMinutes: Number(event.target.value)
                    }))
                  }
                />
              </label>
              <label className="form-field">
                <span className="form-field__label">默认时间范围</span>
                <select
                  value={formState.defaultTimeRange}
                  onChange={(event) =>
                    setFormState((current) => ({
                      ...current,
                      defaultTimeRange: event.target.value as '30d' | '90d' | '180d'
                    }))
                  }
                >
                  <option value="30d">30 天</option>
                  <option value="90d">90 天</option>
                  <option value="180d">180 天</option>
                </select>
              </label>
              <label className="form-field form-grid__full">
                <span className="form-field__label">时区</span>
                <input
                  value={formState.timezone}
                  onChange={(event) =>
                    setFormState((current) => ({ ...current, timezone: event.target.value }))
                  }
                  placeholder="Asia/Shanghai"
                />
              </label>
              <label className="dashboard-modal__checkbox">
                <input
                  type="checkbox"
                  checked={formState.includePrivateRepos}
                  onChange={(event) =>
                    setFormState((current) => ({
                      ...current,
                      includePrivateRepos: event.target.checked
                    }))
                  }
                />
                <span>同步私有仓库</span>
              </label>
            </div>

            <div className="dashboard-modal__actions">
              <button type="button" onClick={() => void saveConfigHandler()} disabled={actionLoading}>
                保存配置
              </button>
              <button type="button" onClick={() => void syncHandler('incremental')} disabled={actionLoading}>
                增量同步
              </button>
              <button type="button" onClick={() => void syncHandler('full')} disabled={actionLoading}>
                全量同步
              </button>
            </div>
            {actionError && <div className="dashboard-modal__error">{actionError}</div>}
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

function PanelHeading(props: {
  title: string;
  subtitle: string;
  accessory?: JSX.Element;
}): JSX.Element {
  const { title, subtitle, accessory } = props;

  return (
    <header className="dashboard-panel__header">
      <div>
        <p className="dashboard-panel__title">{title}</p>
        <h2 className="dashboard-panel__subtitle">{subtitle}</h2>
      </div>
      {accessory}
    </header>
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

function ScoreRing(props: { score: number }): JSX.Element {
  const { score } = props;
  const normalizedScore = Number.isFinite(score) ? Math.max(0, Math.min(100, score)) : 0;

  return (
    <div
      className="dashboard-score-ring"
      style={{
        background: `conic-gradient(#b8ff3b 0deg ${normalizedScore * 3.6}deg, rgba(255,255,255,0.08) ${normalizedScore * 3.6}deg 360deg)`
      }}
    >
      <div className="dashboard-score-ring__inner">
        <strong>{normalizedScore.toFixed(1)}</strong>
      </div>
    </div>
  );
}

function InsightMarker(props: { level: InsightLevel }): JSX.Element {
  const { level } = props;

  return (
    <span className={`dashboard-insight__marker dashboard-insight__marker--${level}`}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="7.2" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <path d="M12 8.5v3.8M12 15.5h.01" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    </span>
  );
}

function HeaderIcon(props: { name: HeaderIconName }): JSX.Element {
  const { name } = props;

  if (name === 'user') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="8" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M6.4 18.2a6.2 6.2 0 0 1 11.2 0" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }

  if (name === 'clock') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="7.6" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M12 7.8v4.6l3.2 1.9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (name === 'sync') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7.2 7.7h4V3.8M16.8 16.3h-4v3.9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M8 6.5A6.8 6.8 0 0 1 19 11m-3 6.5A6.8 6.8 0 0 1 5 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }

  if (name === 'success') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="7.6" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="m8.7 12.3 2.2 2.2 4.4-4.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (name === 'github') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M12 3.6a8.4 8.4 0 0 0-2.7 16.4c.4.1.6-.2.6-.5V18c-2.4.5-2.9-1-2.9-1-.4-.8-.9-1.1-.9-1.1-.7-.5 0-.5 0-.5.8.1 1.2.8 1.2.8.7 1.1 1.9.8 2.4.6.1-.5.3-.8.5-1-1.9-.2-4-.9-4-4.2 0-.9.3-1.7.8-2.3-.1-.2-.4-1 .1-2.2 0 0 .7-.2 2.3.8a8 8 0 0 1 4.2 0c1.6-1 2.3-.8 2.3-.8.5 1.2.2 2 .1 2.2.5.6.8 1.4.8 2.3 0 3.3-2.1 4-4 4.2.3.2.5.7.5 1.4v2c0 .3.2.6.6.5A8.4 8.4 0 0 0 12 3.6Z"
          fill="currentColor"
        />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 5.5 9.8 4.2 8 5.5l-2.5-.3-.9 2.3L3 9l1.1 2.2-.4 2.4 2.1 1.4.8 2.3 2.5-.1 2 1.5 2-1.5 2.5.1.8-2.3 2.1-1.4-.4-2.4L21 9l-1.6-1.5-.9-2.3-2.5.3L14.2 4.2 12 5.5Zm0 3a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MetricIcon(props: { name: MetricIconName }): JSX.Element {
  const { name } = props;

  if (name === 'commits') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5.5 12h5m3 0h5M10.5 8l-3 4 3 4M13.5 8l3 4-3 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (name === 'active') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4.5 12h3.5l2-4.4 3.1 9 2.2-5h4.2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (name === 'views') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M2.8 12s3.2-5 9.2-5 9.2 5 9.2 5-3.2 5-9.2 5-9.2-5-9.2-5Z" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="12" cy="12" r="2.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    );
  }

  if (name === 'clones') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 5v10M8 11l4 4 4-4M6 18h12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3.4 4.5 7.5v9L12 20.6l7.5-4.1v-9L12 3.4Z" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M4.5 7.5 12 11l7.5-3.5M12 11v9.6" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function buildActivityTrendOption(data: Array<{ date: string; count: number }>): EChartsOption {
  const sliced = data.slice(-30);

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
      left: 34,
      right: 12,
      bottom: 22
    },
    xAxis: {
      type: 'category',
      data: sliced.map((item) => item.date.slice(5)),
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
        data: sliced.map((item) => item.count)
      }
    ]
  };
}

function buildRepoBarOption(data: RepoActivityPoint[]): EChartsOption {
  const sliced = data.slice(-18);

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
      top: 18,
      left: 28,
      right: 10,
      bottom: 24
    },
    xAxis: {
      type: 'category',
      data: sliced.map((item) => item.label.replace('2026-', '')),
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
        barWidth: 10,
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

function buildLanguageDonutOption(data: Array<{ name: string; value: number }>): EChartsOption {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  const normalized = data.map((item) => ({
    name: item.name,
    value: total > 0 ? Number(((item.value / total) * 100).toFixed(1)) : 0
  }));
  const top = normalized[0];
  const colorPalette = ['#c5e832', '#8fda6b', '#668cff', '#7d85ff', '#f4c44e', '#5ab8ff', '#ff965f', '#c6c9d2'];

  return {
    color: colorPalette,
    tooltip: {
      trigger: 'item',
      backgroundColor: '#0d1114',
      borderColor: 'rgba(184,255,59,0.18)',
      textStyle: {
        color: '#f3ebdd'
      }
    },
    legend: {
      orient: 'vertical',
      icon: 'circle',
      itemWidth: 8,
      itemHeight: 8,
      itemGap: 12,
      right: 2,
      top: 'center',
      textStyle: {
        color: '#d7dccf',
        fontSize: 11
      },
      formatter: (value: string) => {
        const target = normalized.find((item) => item.name === value);
        return target ? `${value}      ${target.value.toFixed(1)}%` : value;
      }
    },
    title: {
      text: top ? `主要语言\n${top.name}\n${top.value.toFixed(1)}%` : '暂无数据',
      left: '33%',
      top: '37%',
      textAlign: 'center',
      textStyle: {
        color: '#f3ebdd',
        fontSize: 13,
        fontWeight: 600,
        lineHeight: 20
      }
    },
    series: [
      {
        type: 'pie',
        radius: ['50%', '72%'],
        center: ['35%', '51%'],
        startAngle: 95,
        avoidLabelOverlap: false,
        label: {
          show: false
        },
        itemStyle: {
          borderColor: '#0f1317',
          borderWidth: 2
        },
        data: normalized
      }
    ]
  };
}

function buildStackProjectionOption(series: Array<{ name: string; values: number[] }>): EChartsOption {
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
      right: 0,
      textStyle: {
        color: '#d7dccf',
        fontSize: 10
      }
    },
    grid: {
      top: 30,
      left: 28,
      right: 10,
      bottom: 24
    },
    xAxis: {
      type: 'category',
      data: ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06'],
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
      max: 60,
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
        width: 2
      },
      itemStyle: {
        color: ['#c7ef2d', '#63a7ff', '#90a1b6'][index] ?? '#d96c3f'
      },
      data: item.values
    }))
  };
}

function buildHeatmapMatrix(data: HeatmapCell[]): HeatmapMatrixModel {
  const end = new Date();
  const normalizedEnd = new Date(end);
  const day = normalizedEnd.getDay();
  const weekOffset = day === 0 ? 6 : day - 1;
  normalizedEnd.setDate(normalizedEnd.getDate() + (6 - weekOffset));

  const start = new Date(normalizedEnd);
  start.setDate(normalizedEnd.getDate() - 52 * 7 - 6);

  const dataMap = new Map<string, number>();
  let maxValue = 0;

  data.forEach((item) => {
    dataMap.set(item.date, item.count);
    if (item.count > maxValue) {
      maxValue = item.count;
    }
  });

  const cells: HeatmapMatrixCell[] = [];
  const months: Array<{ label: string; column: number }> = [];
  const monthSet = new Set<string>();

  for (let column = 0; column < 53; column += 1) {
    for (let row = 0; row < 7; row += 1) {
      const current = new Date(start);
      current.setDate(start.getDate() + column * 7 + row);
      const date = current.toISOString().slice(0, 10);
      const count = dataMap.get(date) ?? 0;
      const monthLabel = `${current.getMonth() + 1}月`;
      const monthKey = `${current.getFullYear()}-${current.getMonth()}`;

      if (current.getDate() <= 7 && !monthSet.has(monthKey)) {
        monthSet.add(monthKey);
        months.push({ label: monthLabel, column });
      }

      cells.push({
        key: `${date}-${column}-${row}`,
        date,
        count,
        column,
        row
      });
    }
  }

  return {
    months,
    cells,
    maxValue
  };
}

function buildHeatmapMonthLabels(months: Array<{ label: string; column: number }>): string[] {
  const labels = months.map((item) => item.label);
  return labels.slice(-12);
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

function getLongestStreak(data: HeatmapCell[]): number {
  const sorted = [...data].sort((left, right) => left.date.localeCompare(right.date));
  let longest = 0;
  let current = 0;

  sorted.forEach((item) => {
    if (item.count > 0) {
      current += 1;
      longest = Math.max(longest, current);
    } else {
      current = 0;
    }
  });

  return longest;
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
