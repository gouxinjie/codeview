import { useEffect, useMemo, useState } from 'react';
import type { EChartsOption } from 'echarts';
import ReactECharts from 'echarts-for-react';
import { Link, useParams } from 'react-router-dom';
import { EmptyState } from '@/components/commons/EmptyState';
import { LoadingBlock } from '@/components/commons/LoadingBlock';
import { PanelHeading } from '@/components/commons/PanelHeading';
import { ScoreRing } from '@/components/commons/ScoreRing';
import type {
  HeatmapCell,
  RepoActivityPoint,
  RepoDetail,
  RepoRecentCommit,
  RepoStackDetail,
  RepoTrafficPoint
} from '@/types/api';
import {
  fetchRepositoryActivity,
  fetchRepositoryDetail,
  fetchRepositoryHeatmap,
  fetchRepositoryRecentCommits,
  fetchRepositoryStack,
  fetchRepositoryTraffic
} from '@/utils/api';
import { formatDateTime, formatNumber } from '@/utils/date';
import { buildHeatmapMatrix, getLongestHeatmapStreak, sumHeatmapCount } from '@/utils/heatmap';
import './index.scss';

type TrendGranularity = 'day' | 'week' | 'month';
type RecommendationLevel = 'focus' | 'up' | 'risk';

interface ScoreMetricItem {
  label: string;
  value: number;
}

interface HeroFieldItem {
  label: string;
  value: string;
  href?: string;
}

interface TrendMetricItem {
  label: string;
  value: string;
  hint: string;
}

interface VersionRecordItem {
  title: string;
  summary: string;
  date: string;
  badge?: string;
}

interface RecommendationItem {
  level: RecommendationLevel;
  title: string;
  summary: string;
}

interface HeroFieldProps {
  label: string;
  value: string;
  href?: string;
}

interface TrendMetricProps {
  label: string;
  value: string;
  hint: string;
}

const SECTION_TABS = ['概览', '提交分析', '热力图', '技术栈', '经营数据', '文件分析', '洞察与建议', '设置'];
const STACK_TABS = ['语言分布', '技术栈标签', '依赖文件'];

/**
 * 页面说明：项目详情页。
 * Props 类型：无。
 * 含义：按设计图重构项目详情的头部画像、趋势分析和底部卡片布局。
 * 是否必填：无。
 * 默认值：无。
 */
function RepositoryDetailPage(): JSX.Element {
  const params = useParams<{ repoId: string }>();
  const repoId = Number(params.repoId);
  const [detail, setDetail] = useState<RepoDetail | null>(null);
  const [heatmap, setHeatmap] = useState<HeatmapCell[]>([]);
  const [stack, setStack] = useState<RepoStackDetail | null>(null);
  const [traffic, setTraffic] = useState<RepoTrafficPoint[]>([]);
  const [recentCommits, setRecentCommits] = useState<RepoRecentCommit[]>([]);
  const [dayActivity, setDayActivity] = useState<RepoActivityPoint[]>([]);
  const [weekActivity, setWeekActivity] = useState<RepoActivityPoint[]>([]);
  const [monthActivity, setMonthActivity] = useState<RepoActivityPoint[]>([]);
  const [granularity, setGranularity] = useState<TrendGranularity>('day');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    if (!Number.isInteger(repoId) || repoId <= 0) {
      setError('仓库 ID 不合法');
      setLoading(false);
      return;
    }

    let active = true;

    const loadRepository = async (): Promise<void> => {
      setLoading(true);

      try {
        const [
          detailResult,
          heatmapResult,
          stackResult,
          trafficResult,
          recentCommitResult,
          dayResult,
          weekResult,
          monthResult
        ] = await Promise.all([
          fetchRepositoryDetail(repoId),
          fetchRepositoryHeatmap(repoId),
          fetchRepositoryStack(repoId),
          fetchRepositoryTraffic(repoId),
          fetchRepositoryRecentCommits(repoId),
          fetchRepositoryActivity(repoId, 'day'),
          fetchRepositoryActivity(repoId, 'week'),
          fetchRepositoryActivity(repoId, 'month')
        ]);

        if (!active) {
          return;
        }

        setDetail(detailResult);
        setHeatmap(heatmapResult);
        setStack(stackResult);
        setTraffic(trafficResult);
        setRecentCommits(recentCommitResult);
        setDayActivity(dayResult);
        setWeekActivity(weekResult);
        setMonthActivity(monthResult);
        setError('');
      } catch (requestError) {
        if (active) {
          setError(requestError instanceof Error ? requestError.message : '项目详情加载失败');
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void loadRepository();

    return () => {
      active = false;
    };
  }, [repoId]);

  const activeSeries = useMemo(() => {
    if (granularity === 'week') {
      return weekActivity;
    }

    if (granularity === 'month') {
      return monthActivity;
    }

    return dayActivity;
  }, [dayActivity, granularity, monthActivity, weekActivity]);

  const summaryTags = useMemo(() => {
    if (!detail || !stack) {
      return [];
    }

    const mergedTags = [detail.mainLanguage, ...stack.tags.map((item) => item.tag)].filter((item) => item.trim().length > 0);
    return [...new Set(mergedTags)].slice(0, 6);
  }, [detail, stack]);

  const heroFields = useMemo<HeroFieldItem[]>(() => {
    if (!detail) {
      return [];
    }

    return [
      { label: '仓库地址', value: detail.htmlUrl, href: detail.htmlUrl },
      { label: '默认分支', value: detail.defaultBranch || '--' },
      { label: '创建时间', value: formatDateLabel(detail.createdAt) },
      { label: '最近更新时间', value: formatDateTime(detail.updatedAt) }
    ];
  }, [detail]);

  const scoreMetrics = useMemo(() => {
    if (!detail || !stack) {
      return [];
    }

    return buildScoreMetrics(detail, stack);
  }, [detail, stack]);

  const trendMetrics = useMemo<TrendMetricItem[]>(() => {
    if (!detail) {
      return [];
    }

    return [
      {
        label: '近 7 天提交数',
        value: formatNumber(sumActivityCount(dayActivity.slice(-7))),
        hint: '按自然日统计'
      },
      {
        label: '近 30 天提交数',
        value: formatNumber(detail.commitCount30d),
        hint: '较上期保持稳定'
      },
      {
        label: '近 30 天活跃天数',
        value: formatNumber(detail.activeDays30d),
        hint: '持续开发节奏'
      },
      {
        label: '最近提交时间',
        value: formatDateTime(detail.lastCommitAt),
        hint: '以仓库活动为准'
      }
    ];
  }, [dayActivity, detail]);

  const heatmapMatrix = useMemo(() => buildHeatmapMatrix(heatmap), [heatmap]);

  const trafficMetrics = useMemo(
    () =>
      detail
        ? [
            {
              label: '访问量',
              value: formatCompactMetric(detail.trafficSummary.views14d),
              hint: `较近 14 天 ${detail.trafficSummary.views14d > 0 ? '有有效曝光' : '暂无变化'}`
            },
            {
              label: '独立访客',
              value: formatCompactMetric(detail.trafficSummary.visitors14d),
              hint: '近 14 天累计'
            },
            {
              label: '克隆数',
              value: formatCompactMetric(detail.trafficSummary.clones14d),
              hint: '近 14 天累计'
            }
          ]
        : [],
    [detail]
  );

  const versionSnapshots = useMemo(() => buildVersionSnapshots(monthActivity, stack?.files ?? []), [monthActivity, stack]);

  const recommendations = useMemo<RecommendationItem[]>(() => {
    if (!detail || !stack) {
      return [];
    }

    const items: RecommendationItem[] = [];

    if (detail.commitCount30d >= 10) {
      items.push({
        level: 'focus',
        title: '持续高活跃项目',
        summary: `近 30 天提交 ${formatNumber(detail.commitCount30d)} 次，活跃 ${formatNumber(detail.activeDays30d)} 天，当前维护节奏稳定。`
      });
    }

    if (detail.mainLanguage.trim().length > 0) {
      items.push({
        level: 'up',
        title: '技术栈持续收敛',
        summary: `${detail.mainLanguage} 仍是主力语言，${stack.tags.slice(0, 2).map((item) => item.tag).join('、') || '核心标签已形成'}，项目识别度较高。`
      });
    }

    items.push({
      level: detail.trafficSummary.views14d > 0 ? 'focus' : 'risk',
      title: detail.trafficSummary.views14d > 0 ? '对外曝光正在积累' : '对外曝光仍待提升',
      summary:
        detail.trafficSummary.views14d > 0
          ? `近 14 天访问量 ${formatNumber(detail.trafficSummary.views14d)}，说明仓库已经具备一定展示价值。`
          : '近 14 天暂无明显访问数据，建议补充 README、演示地址和项目亮点说明。'
    });

    return items.slice(0, 3);
  }, [detail, stack]);

  if (loading) {
    return <LoadingBlock text="正在加载项目详情" />;
  }

  if (error || !detail || !stack) {
    return <EmptyState title="项目详情暂不可用" description={error || '请返回项目列表后重新选择项目。'} />;
  }

  return (
    <div className="repo-detail-page">
      <Link className="repo-detail-page__back" to="/repos">
        <ArrowLeftIcon />
        <span>返回项目列表</span>
      </Link>

      <section className="repo-detail-hero">
        <div className="repo-detail-hero__actions">
          <a className="repo-detail-hero__action" href={detail.htmlUrl} target="_blank" rel="noreferrer">
            <StarIcon />
            <span>Star</span>
          </a>
          <button type="button" className="repo-detail-hero__action repo-detail-hero__action--ghost">
            <EyeIcon />
            <span>取消关注</span>
          </button>
          <button type="button" className="repo-detail-hero__action repo-detail-hero__action--ghost">
            <SyncIcon />
            <span>手动同步</span>
          </button>
        </div>

        <div className="repo-detail-hero__body">
          <section className="repo-detail-hero__summary">
            <div className="repo-detail-hero__identity">
              <div className="repo-detail-hero__icon">
                <RepoIcon />
              </div>

              <div className="repo-detail-hero__copy">
                <div className="repo-detail-hero__title-row">
                  <h1>{detail.name}</h1>
                  <span className="repo-detail-hero__badge">Public</span>
                </div>
                <p className="repo-detail-hero__tagline">{detail.description || 'CodeView 项目数据看板'}</p>
              </div>
            </div>

            <div className="repo-detail-hero__tags">
              {summaryTags.map((item, index) => (
                <span key={item} className={`repo-detail-hero__tag repo-detail-hero__tag--${index % 4}`}>
                  {item}
                </span>
              ))}
            </div>

            <div className="repo-detail-hero__stats">
              <HeroMetric icon={<StarIcon />} value={formatCompactMetric(detail.starsCount)} />
              <HeroMetric icon={<BranchIcon />} value={formatCompactMetric(detail.forksCount)} />
              <HeroMetric icon={<EyeIcon />} value={formatCompactMetric(detail.trafficSummary.views14d)} />
            </div>
          </section>

          <section className="repo-detail-hero__meta">
            <div className="repo-detail-hero__field-list">
              {heroFields.map((item) => (
                <HeroField key={item.label} label={item.label} value={item.value} href={item.href} />
              ))}
            </div>

            <div className="repo-detail-hero__description">
              <span>描述</span>
              <p>{detail.description || '一个基于 GitHub 数据的 CodeView 看板，帮助开发者查看活跃度、技术栈和经营效果。'}</p>
            </div>
          </section>

          <section className="repo-detail-hero__score">
            <div className="repo-detail-hero__score-panel">
              <span className="repo-detail-hero__score-label">项目评分</span>
              <ScoreRing variant="detail" score={detail.score} suffix="/100" />
            </div>

            <div className="repo-detail-hero__score-bars">
              {scoreMetrics.map((item) => (
                <div key={item.label} className="repo-detail-hero__score-row">
                  <span>{item.label}</span>
                  <div className="repo-detail-hero__score-track">
                    <i style={{ width: `${item.value}%` }} />
                  </div>
                  <strong>{item.value}</strong>
                </div>
              ))}
            </div>
          </section>
        </div>

        <nav className="repo-detail-hero__nav" aria-label="项目详情分区">
          {SECTION_TABS.map((item, index) => (
            <button
              key={item}
              type="button"
              className={index === 0 ? 'repo-detail-hero__nav-item repo-detail-hero__nav-item--active' : 'repo-detail-hero__nav-item'}
            >
              {item}
            </button>
          ))}
        </nav>
      </section>

      <section className="repo-detail-grid repo-detail-grid--primary">
        <article className="repo-detail-panel repo-detail-panel--trend">
          <PanelHeading
            variant="detail"
            title="提交趋势"
            accessory={
              <div className="repo-detail-panel__heading-controls">
                <button type="button" className="repo-detail-panel__range-button">
                  近 30 天
                </button>
              </div>
            }
            corner={<ChevronRightIcon />}
          />

          <div className="repo-detail-panel__tab-group">
            {(['day', 'week', 'month'] as TrendGranularity[]).map((item) => (
              <button
                key={item}
                type="button"
                className={
                  item === granularity
                    ? 'repo-detail-panel__tab repo-detail-panel__tab--active'
                    : 'repo-detail-panel__tab'
                }
                onClick={() => setGranularity(item)}
              >
                {item === 'day' ? '日' : item === 'week' ? '周' : '月'}
              </button>
            ))}
          </div>

          <div className="repo-detail-panel__trend-layout">
            <div className="repo-detail-panel__chart-box repo-detail-panel__chart-box--trend">
              <ReactECharts
                option={buildRepositoryTrendOption(activeSeries)}
                style={{ height: 246 }}
                opts={{ renderer: 'svg' }}
              />
            </div>

            <div className="repo-detail-panel__trend-metrics">
              {trendMetrics.map((item) => (
                <TrendMetric key={item.label} label={item.label} value={item.value} hint={item.hint} />
              ))}
            </div>
          </div>
        </article>

        <article className="repo-detail-panel repo-detail-panel--heatmap">
          <PanelHeading
            variant="detail"
            title="提交热力图（近 1 年）"
            accessory={
              <div className="repo-detail-heatmap__legend">
                <span>少</span>
                <span className="repo-detail-heatmap__legend-scale" aria-hidden="true">
                  {[0, 1, 2, 3, 4].map((item) => (
                    <i key={item} className={`repo-detail-heatmap__legend-cell repo-detail-heatmap__legend-cell--${item}`} />
                  ))}
                </span>
                <span>多</span>
              </div>
            }
            corner={<ChevronRightIcon />}
          />

          {heatmap.length > 0 ? (
            <div className="repo-detail-heatmap">
              <div className="repo-detail-heatmap__body">
                <div className="repo-detail-heatmap__weekdays">
                  {['周一', '周二', '周三', '周四', '周五', '周六', '周日'].map((item) => (
                    <span key={item}>{item}</span>
                  ))}
                </div>

                <div className="repo-detail-heatmap__main">
                  <div className="repo-detail-heatmap__grid">
                    {heatmapMatrix.cells.map((cell) => (
                      <span
                        key={cell.key}
                        className={getHeatmapCellClass(cell.count, heatmapMatrix.maxValue)}
                        title={`${cell.date} · ${cell.count} 次提交`}
                        style={{
                          gridColumn: cell.column + 1,
                          gridRow: cell.row + 1
                        }}
                      />
                    ))}
                  </div>

                  <div className="repo-detail-heatmap__months">
                    {heatmapMatrix.months.map((item) => (
                      <span key={`${item.label}-${item.column}`} style={{ gridColumn: `${item.column + 1} / span 4` }}>
                        {item.label}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="repo-detail-panel__summary-line">
                <span>总提交次数：{formatNumber(sumHeatmapCount(heatmap))}</span>
                <span>最长连续提交天数：{formatNumber(getLongestHeatmapStreak(heatmap))} 天</span>
              </div>
            </div>
          ) : (
            <EmptyState title="暂无热力图数据" />
          )}
        </article>

        <article className="repo-detail-panel repo-detail-panel--stack">
          <PanelHeading
            variant="detail"
            title="技术栈识别结果"
            accessory={
              <div className="repo-detail-panel__mini-tabs">
                {STACK_TABS.map((item, index) => (
                  <span
                    key={item}
                    className={
                      index === 0
                        ? 'repo-detail-panel__mini-tab repo-detail-panel__mini-tab--active'
                        : 'repo-detail-panel__mini-tab'
                    }
                  >
                    {item}
                  </span>
                ))}
              </div>
            }
            corner={<ChevronRightIcon />}
          />

          {detail.languages.length > 0 ? (
            <>
              <div className="repo-detail-stack">
                <div className="repo-detail-stack__chart">
                  <ReactECharts
                    option={buildRepositoryLanguageDonutOption(detail.languages)}
                    style={{ height: 220 }}
                    opts={{ renderer: 'svg' }}
                  />
                </div>

                <div className="repo-detail-stack__legend">
                  {detail.languages.slice(0, 6).map((item, index) => (
                    <div key={item.language} className="repo-detail-stack__legend-item">
                      <span className={`repo-detail-stack__legend-dot repo-detail-stack__legend-dot--${index % 6}`} />
                      <strong>{item.language}</strong>
                      <em>{item.percentage.toFixed(1)}%</em>
                    </div>
                  ))}
                </div>
              </div>

              <div className="repo-detail-stack__tags">
                <span className="repo-detail-stack__tags-title">技术栈概览</span>
                <div className="repo-detail-stack__tag-list">
                  {stack.tags.slice(0, 8).map((item) => (
                    <span key={item.tag}>{item.tag}</span>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <EmptyState title="暂无技术栈数据" />
          )}
        </article>
      </section>

      <section className="repo-detail-grid repo-detail-grid--secondary">
        <article className="repo-detail-panel repo-detail-panel--traffic">
          <PanelHeading variant="detail" title="经营数据（近 14 天）" corner={<ChevronRightIcon />} />

          <div className="repo-detail-traffic__metrics">
            {trafficMetrics.map((item) => (
              <div key={item.label} className="repo-detail-traffic__metric">
                <span>{item.label}</span>
                <strong>{item.value}</strong>
                <small>{item.hint}</small>
              </div>
            ))}
          </div>

          {traffic.length > 0 ? (
            <div className="repo-detail-panel__chart-box repo-detail-panel__chart-box--traffic">
              <ReactECharts
                option={buildRepositoryTrafficOption(traffic)}
                style={{ height: 182 }}
                opts={{ renderer: 'svg' }}
              />
            </div>
          ) : (
            <EmptyState title="暂无流量趋势" description="部分仓库可能由于权限限制无法返回 traffic 数据。" />
          )}
        </article>

        <article className="repo-detail-panel repo-detail-panel--versions">
          <PanelHeading variant="detail" title="版本快照记录" corner={<ChevronRightIcon />} />

          <div className="repo-detail-list repo-detail-list--versions">
            {versionSnapshots.length > 0 ? (
              versionSnapshots.map((item) => (
                <div key={`${item.title}-${item.date}`} className="repo-detail-list__item">
                  <div className="repo-detail-list__main">
                    <div className="repo-detail-list__title-row">
                      <strong>{item.title}</strong>
                      {item.badge ? <span className="repo-detail-list__badge">{item.badge}</span> : null}
                    </div>
                    <p>{item.summary}</p>
                  </div>
                  <span className="repo-detail-list__date">{item.date}</span>
                </div>
              ))
            ) : (
              <EmptyState title="暂无版本快照" />
            )}
          </div>

          <a className="repo-detail-panel__footlink" href={detail.htmlUrl} target="_blank" rel="noreferrer">
            查看仓库详情
          </a>
        </article>

        <article className="repo-detail-panel repo-detail-panel--commits">
          <PanelHeading variant="detail" title="最近提交记录" corner={<ChevronRightIcon />} />

          <div className="repo-detail-commit-list">
            {recentCommits.length > 0 ? (
              recentCommits.map((item) => (
                <div key={item.sha} className="repo-detail-commit-list__item">
                  <div className="repo-detail-commit-list__avatar">{getCommitInitial(item)}</div>
                  <div className="repo-detail-commit-list__copy">
                    <strong>{trimText(item.message || item.sha, 24)}</strong>
                    <span>{item.authorLogin || item.authorName || 'unknown'}</span>
                  </div>
                  <em>{formatRelativeTime(item.commitTime)}</em>
                </div>
              ))
            ) : (
              <EmptyState title="暂无最近提交" />
            )}
          </div>

          <a className="repo-detail-panel__footlink" href={`${detail.htmlUrl}/commits`} target="_blank" rel="noreferrer">
            查看全部提交
          </a>
        </article>

        <article className="repo-detail-panel repo-detail-panel--insights">
          <PanelHeading
            variant="detail"
            title="洞察与建议（自动生成）"
            accessory={
              <div className="repo-detail-panel__mode-tabs">
                <span className="repo-detail-panel__mode-tab repo-detail-panel__mode-tab--active">自动</span>
                <span className="repo-detail-panel__mode-tab">规则</span>
              </div>
            }
            corner={<ChevronRightIcon />}
          />

          <div className="repo-detail-insight-list">
            {recommendations.map((item) => (
              <div key={item.title} className="repo-detail-insight-list__item">
                <span className={`repo-detail-insight-list__icon repo-detail-insight-list__icon--${item.level}`}>
                  <InsightIcon level={item.level} />
                </span>
                <div className="repo-detail-insight-list__copy">
                  <div className="repo-detail-insight-list__title-row">
                    <strong>{item.title}</strong>
                    <em>{item.level}</em>
                  </div>
                  <p>{item.summary}</p>
                </div>
              </div>
            ))}
          </div>

          <a className="repo-detail-panel__footlink" href={detail.htmlUrl} target="_blank" rel="noreferrer">
            查看全部洞察
          </a>
        </article>
      </section>
    </div>
  );
}

function HeroField(props: HeroFieldProps): JSX.Element {
  const { label, value, href } = props;

  return (
    <div className="repo-detail-hero__field">
      <span>{label}</span>
      {href ? (
        <a href={href} target="_blank" rel="noreferrer">
          {value}
        </a>
      ) : (
        <strong>{value}</strong>
      )}
    </div>
  );
}

function HeroMetric(props: { icon: JSX.Element; value: string }): JSX.Element {
  const { icon, value } = props;

  return (
    <div className="repo-detail-hero__metric">
      {icon}
      <strong>{value}</strong>
    </div>
  );
}

function TrendMetric(props: TrendMetricProps): JSX.Element {
  const { label, value, hint } = props;

  return (
    <div className="repo-detail-panel__trend-metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{hint}</small>
    </div>
  );
}

function RepoIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3.4 4.5 7.5v9L12 20.6l7.5-4.1v-9L12 3.4Z" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M4.5 7.5 12 11l7.5-3.5M12 11v9.6" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function ArrowLeftIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m14.5 6.5-5 5 5 5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronRightIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m9.5 6.5 5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function StarIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m12 4.8 2 4 4.4.6-3.2 3.1.8 4.4L12 14.8 8 16.9l.8-4.4-3.2-3.1 4.4-.6 2-4Z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}

function EyeIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M2.8 12s3.2-5 9.2-5 9.2 5 9.2 5-3.2 5-9.2 5-9.2-5-9.2-5Z" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="12" cy="12" r="2.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function BranchIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 5.5a2.1 2.1 0 1 1 0 4.2 2.1 2.1 0 0 1 0-4.2Zm8 8.4a2.1 2.1 0 1 1 0 4.2 2.1 2.1 0 0 1 0-4.2ZM8 14a2.1 2.1 0 1 1 0 4.2A2.1 2.1 0 0 1 8 14Z" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="M8 9.7v4.2m0 0c4.2 0 5-2.2 5-5.4V7.6m-5 6.3c4.2 0 5 2.1 5 4.5v.1m0-10.9a2.1 2.1 0 1 0 0-4.2 2.1 2.1 0 0 0 0 4.2Z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SyncIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7.2 7.7h4V3.8M16.8 16.3h-4v3.9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 6.5A6.8 6.8 0 0 1 19 11m-3 6.5A6.8 6.8 0 0 1 5 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function InsightIcon(props: { level: RecommendationLevel }): JSX.Element {
  const { level } = props;

  if (level === 'up') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 18V7m0 0-4 4m4-4 4 4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  if (level === 'risk') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 8.8v4.2M12 16h.01" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="12" cy="12" r="7.2" fill="none" stroke="currentColor" strokeWidth="1.4" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m8.8 12.4 2.2 2.2 4.4-4.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="7.2" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function buildScoreMetrics(detail: RepoDetail, stack: RepoStackDetail): ScoreMetricItem[] {
  const activityScore = clampScore((detail.activeDays30d / 30) * 100);
  const trafficScore = clampScore((detail.trafficSummary.views14d / 200) * 100);
  const stackScore = clampScore(stack.tags.length * 14 + detail.languages.length * 12);
  const maintenanceScore = clampScore((detail.commitCount30d / 45) * 100);
  const growthScore = clampScore(((detail.starsCount + detail.forksCount) / 150) * 100);

  return [
    { label: '活跃度', value: activityScore },
    { label: '经营效果', value: trafficScore },
    { label: '技术栈健康度', value: stackScore },
    { label: '维护质量', value: maintenanceScore },
    { label: '成长潜力', value: growthScore }
  ];
}

function buildRepositoryTrendOption(data: RepoActivityPoint[]): EChartsOption {
  const sliced = data.slice(-30);

  return {
    animation: false,
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#0d1114',
      borderColor: 'rgba(184,255,59,0.18)',
      textStyle: {
        color: '#f3ebdd'
      }
    },
    grid: {
      top: 12,
      left: 32,
      right: 14,
      bottom: 24
    },
    xAxis: {
      type: 'category',
      data: sliced.map((item) => normalizeAxisLabel(item.label)),
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
          color: '#b9ec2d',
          width: 2
        },
        itemStyle: {
          color: '#d3ff48',
          borderColor: '#0f1317',
          borderWidth: 1
        },
        areaStyle: {
          color: 'rgba(185, 236, 45, 0.12)'
        },
        data: sliced.map((item) => item.count)
      }
    ]
  };
}

function buildRepositoryTrafficOption(data: RepoTrafficPoint[]): EChartsOption {
  const sliced = data.slice(-14);

  return {
    animation: false,
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
      itemWidth: 8,
      itemHeight: 8,
      textStyle: {
        color: '#9aa48f',
        fontSize: 10
      }
    },
    grid: {
      top: 28,
      left: 24,
      right: 12,
      bottom: 20
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
        name: '访问量',
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 5,
        lineStyle: {
          width: 2,
          color: '#b9ec2d'
        },
        itemStyle: {
          color: '#b9ec2d'
        },
        data: sliced.map((item) => item.views)
      },
      {
        name: '独立访客',
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 5,
        lineStyle: {
          width: 2,
          color: '#56a7ff'
        },
        itemStyle: {
          color: '#56a7ff'
        },
        data: sliced.map((item) => item.visitors)
      },
      {
        name: '克隆数',
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 5,
        lineStyle: {
          width: 2,
          color: '#d6a63a'
        },
        itemStyle: {
          color: '#d6a63a'
        },
        data: sliced.map((item) => item.clones)
      }
    ]
  };
}

function buildRepositoryLanguageDonutOption(
  data: Array<{ language: string; percentage: number }>
): EChartsOption {
  const topLanguage = data[0];
  const colorPalette = ['#c5e832', '#8fda6b', '#668cff', '#7d85ff', '#f4c44e', '#5ab8ff', '#ff965f', '#c6c9d2'];

  return {
    animation: false,
    color: colorPalette,
    tooltip: {
      trigger: 'item',
      backgroundColor: '#0d1114',
      borderColor: 'rgba(184,255,59,0.18)',
      textStyle: {
        color: '#f3ebdd'
      }
    },
    title: {
      text: topLanguage
        ? `主要语言\n${topLanguage.language}\n${topLanguage.percentage.toFixed(1)}%`
        : '暂无数据',
      left: 'center',
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
        radius: ['54%', '74%'],
        center: ['50%', '51%'],
        startAngle: 98,
        label: {
          show: false
        },
        itemStyle: {
          borderColor: '#0f1317',
          borderWidth: 2
        },
        data: data.map((item) => ({
          name: item.language,
          value: item.percentage
        }))
      }
    ]
  };
}

function buildVersionSnapshots(
  monthActivity: RepoActivityPoint[],
  files: Array<{ filePath: string }>
): VersionRecordItem[] {
  const activeMonths = monthActivity.filter((item) => item.count > 0).slice(-4).reverse();

  if (activeMonths.length > 0) {
    return activeMonths.map((item, index) => ({
      title: `${item.label} 月度快照`,
      summary: `当月提交 ${formatNumber(item.count)} 次`,
      date: item.label,
      badge: index === 0 ? 'Latest' : undefined
    }));
  }

  return files.slice(0, 4).map((item, index) => {
    const segments = item.filePath.split('/');
    const fileName = segments[segments.length - 1] ?? item.filePath;

    return {
      title: fileName,
      summary: item.filePath,
      date: '结构快照',
      badge: index === 0 ? 'File' : undefined
    };
  });
}

function sumActivityCount(data: RepoActivityPoint[]): number {
  return data.reduce((sum, item) => sum + item.count, 0);
}

function getHeatmapCellClass(value: number, maxValue: number): string {
  if (value <= 0 || maxValue <= 0) {
    return 'repo-detail-heatmap__cell repo-detail-heatmap__cell--0';
  }

  const ratio = value / maxValue;

  if (ratio > 0.8) {
    return 'repo-detail-heatmap__cell repo-detail-heatmap__cell--4';
  }

  if (ratio > 0.55) {
    return 'repo-detail-heatmap__cell repo-detail-heatmap__cell--3';
  }

  if (ratio > 0.3) {
    return 'repo-detail-heatmap__cell repo-detail-heatmap__cell--2';
  }

  return 'repo-detail-heatmap__cell repo-detail-heatmap__cell--1';
}

function clampScore(value: number): number {
  return Math.max(6, Math.min(100, Math.round(value)));
}

function formatCompactMetric(value: number): string {
  if (value >= 1000) {
    return new Intl.NumberFormat('en', {
      notation: 'compact',
      maximumFractionDigits: 1
    })
      .format(value)
      .toLowerCase();
  }

  return formatNumber(value);
}

function formatDateLabel(value: string): string {
  return value.slice(0, 10);
}

function normalizeAxisLabel(value: string): string {
  if (value.length >= 10 && value.includes('-')) {
    return value.slice(5);
  }

  return value;
}

function trimText(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxLength - 1))}…`;
}

function getCommitInitial(item: RepoRecentCommit): string {
  const source = item.authorName.trim() || item.authorLogin?.trim() || item.sha;
  return source.slice(0, 1).toUpperCase();
}

function formatRelativeTime(value: string): string {
  const target = new Date(value).getTime();
  const now = Date.now();
  const diff = Math.max(0, now - target);
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < hour) {
    return `${Math.max(1, Math.floor(diff / minute))} 分钟前`;
  }

  if (diff < day) {
    return `${Math.floor(diff / hour)} 小时前`;
  }

  if (diff < day * 7) {
    return `${Math.floor(diff / day)} 天前`;
  }

  return formatDateLabel(value);
}

export default RepositoryDetailPage;
