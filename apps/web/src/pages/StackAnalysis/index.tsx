import { useEffect, useMemo, useRef, useState } from 'react';
import type { EChartsOption } from 'echarts';
import ReactECharts from 'echarts-for-react';
import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  Boxes,
  CheckCircle2,
  Clock3,
  Code2,
  Flame,
  Network,
  User
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { EmptyState } from '@/components/commons/EmptyState';
import { LoadingBlock } from '@/components/commons/LoadingBlock';
import { PanelHeading } from '@/components/commons/PanelHeading';
import { useAppStore } from '@/store/appStore';
import type {
  StackAnalysisData,
  StackAnalysisLanguageItem,
  StackAnalysisSummaryCard,
  StackAnalysisTrendDirection,
  StackAnalysisTrendSeriesItem
} from '@/types/api';
import { fetchStackAnalysis } from '@/utils/api';
import { formatDateTime, formatNumber, translateSyncStatus } from '@/utils/date';
import { getResponsiveChartHeight, useResponsiveViewport, type ResponsiveViewport } from '@/utils/responsive';
import './index.scss';

type HeaderIconName = 'user' | 'clock' | 'success' | 'stack';
type StackSectionKey = 'overview' | 'language' | 'category' | 'trend' | 'matrix' | 'relation';

interface TopInfoCellProps {
  icon: HeaderIconName;
  label: string;
  value: string;
  subValue: string;
}

interface SummaryCardProps {
  card: StackAnalysisSummaryCard;
  index: number;
}

interface SectionTabItem {
  key: StackSectionKey;
  label: string;
}

interface DonutChartItem {
  name: string;
  value: number;
}

const HEADER_ICON_MAP: Record<HeaderIconName, LucideIcon> = {
  user: User,
  clock: Clock3,
  success: CheckCircle2,
  stack: Boxes
};

const SUMMARY_ICON_LIST: LucideIcon[] = [Code2, Boxes, Activity, Flame, Network];
const RELATION_CHIP_EXCLUDED_TECHS = new Set([
  'HTML',
  'CSS',
  'SCSS',
  'JavaScript',
  'Shell',
  'Batchfile',
  'PowerShell',
  'Jupyter Notebook'
]);
const SECTION_TABS: SectionTabItem[] = [
  { key: 'overview', label: '技术栈概览' },
  { key: 'language', label: '语言分析' },
  { key: 'category', label: '技术栈分类' },
  { key: 'trend', label: '技术栈趋势' },
  { key: 'matrix', label: '技术栈地图' },
  { key: 'relation', label: '技术栈关系' }
];

/**
 * 页面说明：技术栈分析页。
 * Props 类型：无。
 * 含义：展示技术栈概览、语言分布、分类分布、热度排行、趋势变化和项目矩阵。
 * 是否必填：无。
 * 默认值：无。
 */
function StackAnalysisPage(): JSX.Element {
  const { config } = useAppStore();
  const viewport = useResponsiveViewport();
  const [months, setMonths] = useState<6 | 12 | 24>(12);
  const [activeTab, setActiveTab] = useState<StackSectionKey>('overview');
  const [stackAnalysis, setStackAnalysis] = useState<StackAnalysisData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const overviewRef = useRef<HTMLElement | null>(null);
  const languageRef = useRef<HTMLElement | null>(null);
  const categoryRef = useRef<HTMLElement | null>(null);
  const trendRef = useRef<HTMLElement | null>(null);
  const matrixRef = useRef<HTMLElement | null>(null);
  const relationRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    let active = true;

    const loadStackAnalysis = async (): Promise<void> => {
      setLoading(true);

      try {
        const result = await fetchStackAnalysis({ months });

        if (!active) {
          return;
        }

        setStackAnalysis(result);
        setError('');
      } catch (requestError) {
        if (!active) {
          return;
        }

        setError(requestError instanceof Error ? requestError.message : '技术栈分析加载失败');
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void loadStackAnalysis();

    return () => {
      active = false;
    };
  }, [months]);

  const languageChartItems = useMemo<DonutChartItem[]>(
    () =>
      (stackAnalysis?.languageDistribution ?? []).map((item) => ({
        name: item.name,
        value: item.bytes
      })),
    [stackAnalysis?.languageDistribution]
  );

  const categoryChartItems = useMemo<DonutChartItem[]>(
    () =>
      (stackAnalysis?.categoryDistribution ?? []).map((item) => ({
        name: item.name,
        value: item.techCount
      })),
    [stackAnalysis?.categoryDistribution]
  );

  const languageChartOption = useMemo<EChartsOption>(
    () =>
      buildDonutOption(
        languageChartItems,
        '主语言',
        stackAnalysis?.languageDistribution[0]
          ? `${stackAnalysis.languageDistribution[0].name}\n${stackAnalysis.languageDistribution[0].percentage.toFixed(1)}%`
          : '暂无数据',
        viewport
      ),
    [languageChartItems, stackAnalysis?.languageDistribution, viewport]
  );

  const categoryChartOption = useMemo<EChartsOption>(
    () =>
      buildDonutOption(
        categoryChartItems,
        '主分类',
        stackAnalysis?.categoryDistribution[0]
          ? `${stackAnalysis.categoryDistribution[0].name}\n${stackAnalysis.categoryDistribution[0].techCount} 项`
          : '暂无数据',
        viewport
      ),
    [categoryChartItems, stackAnalysis?.categoryDistribution, viewport]
  );

  const trendOption = useMemo<EChartsOption>(
    () => buildTrendOption(stackAnalysis?.trendMonths ?? [], stackAnalysis?.trendSeries ?? [], viewport),
    [stackAnalysis?.trendMonths, stackAnalysis?.trendSeries, viewport]
  );

  const technologyChips = useMemo(
    () =>
      (stackAnalysis?.topTechStacks ?? [])
        .filter((item) => !RELATION_CHIP_EXCLUDED_TECHS.has(item.name))
        .slice(0, 12),
    [stackAnalysis?.topTechStacks]
  );

  const scrollToSection = (key: StackSectionKey): void => {
    setActiveTab(key);

    if (key === 'overview') {
      overviewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    if (key === 'language') {
      languageRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    if (key === 'category') {
      categoryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    if (key === 'trend') {
      trendRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    if (key === 'matrix') {
      matrixRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    relationRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  if (loading) {
    return <LoadingBlock text="正在加载技术栈分析" />;
  }

  if (error || !stackAnalysis) {
    return <EmptyState title="技术栈分析暂不可用" description={error || '请稍后重试。'} />;
  }

  return (
    <div className="stack-analysis-page">
      <section className="stack-analysis-page__topbar">
        <TopInfoCell
          icon="user"
          label="用户名"
          value={stackAnalysis.header.githubUsername || 'your-username'}
          subValue={config?.hasToken ? 'GitHub 已连接' : '等待接入 GitHub Token'}
        />
        <TopInfoCell
          icon="clock"
          label="当前时间"
          value={formatDateTime(stackAnalysis.header.currentTime)}
          subValue={`时区 ${config?.timezone || 'Asia/Shanghai'}`}
        />
        <TopInfoCell
          icon="success"
          label="同步状态"
          value={translateSyncStatus(stackAnalysis.header.syncStatus)}
          subValue={
            stackAnalysis.header.lastSyncedAt
              ? `最近同步 ${formatDateTime(stackAnalysis.header.lastSyncedAt)}`
              : '尚未同步'
          }
        />
        <TopInfoCell
          icon="stack"
          label="统计窗口"
          value={`最近 ${stackAnalysis.appliedWindow.months} 个月`}
          subValue={`${stackAnalysis.appliedWindow.startMonth} 至 ${stackAnalysis.appliedWindow.endMonth}`}
        />
      </section>

      <section className="stack-analysis-page__hero">
        <div className="stack-analysis-page__hero-copy">
          <h1>技术栈分析</h1>
          <p>从语言、框架、运行时、数据层和工程化工具多个维度观察你的 GitHub 项目组合。</p>
        </div>
        <div className="stack-analysis-page__hero-meta">
          <strong>技术热度由仓库覆盖、近 30 天活跃和近月趋势综合计算</strong>
          <span>当前共识别 {formatNumber(stackAnalysis.topTechStacks.length)} 个重点技术信号</span>
        </div>
      </section>

      <section className="stack-analysis-page__toolbar">
        <nav className="stack-analysis-page__tabs" aria-label="技术栈分析分区">
          {SECTION_TABS.map((item) => (
            <button
              key={item.key}
              type="button"
              className={
                activeTab === item.key
                  ? 'stack-analysis-page__tab stack-analysis-page__tab--active'
                  : 'stack-analysis-page__tab'
              }
              onClick={() => scrollToSection(item.key)}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <div className="stack-analysis-page__toolbar-actions">
          {([6, 12, 24] as const).map((item) => (
            <button
              key={item}
              type="button"
              className={
                months === item
                  ? 'stack-analysis-page__range-button stack-analysis-page__range-button--active'
                  : 'stack-analysis-page__range-button'
              }
              onClick={() => setMonths(item)}
            >
              最近 {item} 个月
            </button>
          ))}
        </div>
      </section>

      <section ref={overviewRef} className="stack-analysis-page__summary">
        {stackAnalysis.summaryCards.map((card, index) => (
          <SummaryCard key={card.id} card={card} index={index} />
        ))}
      </section>

      <section className="stack-analysis-page__grid stack-analysis-page__grid--top">
        <article ref={languageRef} className="stack-panel">
          <PanelHeading variant="statistics" eyebrow="LANGUAGE" title="语言占比" />
          <div className="stack-panel__chart-layout">
            <div className="stack-panel__chart-box">
              <ReactECharts
                option={languageChartOption}
                style={{ height: getResponsiveChartHeight(viewport, { desktop: 248, tablet: 224, mobile: 188 }) }}
                opts={{ renderer: 'svg' }}
              />
            </div>
            <div className="stack-panel__legend">
              {stackAnalysis.languageDistribution.map((item) => (
                <div key={item.name} className="stack-panel__legend-item">
                  <span className="stack-panel__legend-label">{item.name}</span>
                  <strong>{item.percentage.toFixed(1)}%</strong>
                  <small>{formatLanguageBytes(item)}</small>
                </div>
              ))}
            </div>
          </div>
        </article>

        <article ref={categoryRef} className="stack-panel">
          <PanelHeading variant="statistics" eyebrow="CATEGORY" title="技术栈分类分布" />
          <div className="stack-panel__chart-layout">
            <div className="stack-panel__chart-box">
              <ReactECharts
                option={categoryChartOption}
                style={{ height: getResponsiveChartHeight(viewport, { desktop: 248, tablet: 224, mobile: 188 }) }}
                opts={{ renderer: 'svg' }}
              />
            </div>
            <div className="stack-panel__legend">
              {stackAnalysis.categoryDistribution.map((item) => (
                <div key={item.name} className="stack-panel__legend-item">
                  <span className="stack-panel__legend-label">{item.name}</span>
                  <strong>{item.techCount} 项</strong>
                  <small>{item.percentage.toFixed(1)}% 占比</small>
                </div>
              ))}
            </div>
          </div>
        </article>

        <article className="stack-panel">
          <PanelHeading
            variant="statistics"
            eyebrow="HOTNESS"
            title="技术栈热度 TOP 10"
            accessory={<span className="stack-panel__header-chip">综合热度</span>}
          />
          <div className="stack-ranking">
            <div className="stack-ranking__head">
              <span>#</span>
              <span>技术栈</span>
              <span>覆盖仓库</span>
              <span>热度</span>
            </div>
            {stackAnalysis.topTechStacks.map((item, index) => (
              <div key={item.name} className="stack-ranking__item">
                <span className="stack-ranking__index">{index + 1}</span>
                <div className="stack-ranking__main">
                  <strong>{item.name}</strong>
                  <small>{item.category} · 近 30 天提交 {formatNumber(item.commitCount30d)}</small>
                </div>
                <span className="stack-ranking__repo-count">{item.repoCount}</span>
                <div className="stack-ranking__heat">
                  <span className="stack-ranking__bar">
                    <i style={{ width: `${item.heat}%` }} />
                  </span>
                  <strong>{item.heat}</strong>
                </div>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="stack-analysis-page__grid stack-analysis-page__grid--middle">
        <article ref={trendRef} className="stack-panel stack-panel--trend">
          <PanelHeading
            variant="statistics"
            eyebrow="TREND"
            title="技术栈趋势变化"
            accessory={<span className="stack-panel__header-chip">按月活跃占比</span>}
          />
          <ReactECharts
            option={trendOption}
            style={{ height: getResponsiveChartHeight(viewport, { desktop: 280, tablet: 240, mobile: 196 }) }}
            opts={{ renderer: 'svg' }}
          />
          <div className="stack-trend__summary">
            {stackAnalysis.topTechStacks.slice(0, 5).map((item) => (
              <div key={item.name} className="stack-trend__metric">
                <span>{item.name}</span>
                <strong>
                  {item.trend > 0 ? '+' : ''}
                  {item.trend.toFixed(1)}%
                </strong>
                <small>{item.activeRepoCount} 个活跃仓库</small>
              </div>
            ))}
          </div>
        </article>

        <article className="stack-panel">
          <PanelHeading
            variant="statistics"
            eyebrow="NEW STACKS"
            title="近窗口新增技术"
            accessory={<span className="stack-panel__header-chip">首次引入</span>}
          />
          <div className="stack-emerging">
            <div className="stack-emerging__head">
              <span>技术栈</span>
              <span>首次使用时间</span>
              <span>代表项目</span>
              <span>类别 / 仓库</span>
            </div>
            {stackAnalysis.emergingTechStacks.map((item) => (
              <div key={`${item.name}-${item.firstSeenAt}`} className="stack-emerging__item">
                <div className="stack-emerging__cell stack-emerging__cell--stack">
                  <strong>{item.name}</strong>
                </div>
                <div className="stack-emerging__cell">
                  <span>{formatDateTime(item.firstSeenAt)}</span>
                </div>
                <div className="stack-emerging__cell">
                  <span>{item.representativeRepo}</span>
                </div>
                <div className="stack-emerging__cell stack-emerging__cell--meta">
                  <em>{item.category}</em>
                  <small>{item.repoCount} 个仓库</small>
                </div>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section ref={matrixRef} className="stack-analysis-page__grid stack-analysis-page__grid--bottom">
        <article className="stack-panel stack-panel--matrix">
          <PanelHeading
            variant="statistics"
            eyebrow="PROJECT MATRIX"
            title="技术栈分布（按项目）"
            accessory={<span className="stack-panel__header-chip">仓库 x 核心技术</span>}
          />
          {stackAnalysis.matrixColumns.length > 0 && stackAnalysis.projectMatrix.length > 0 ? (
            <div className="stack-matrix">
              <div
                className="stack-matrix__header"
                style={{ gridTemplateColumns: buildMatrixTemplateColumns(stackAnalysis.matrixColumns.length) }}
              >
                <span className="stack-matrix__corner">项目</span>
                {stackAnalysis.matrixColumns.map((item) => (
                  <span key={item} className="stack-matrix__column">
                    {item}
                  </span>
                ))}
              </div>
              <div className="stack-matrix__body">
                {stackAnalysis.projectMatrix.map((item) => (
                  <div
                    key={item.repoId}
                    className="stack-matrix__row"
                    style={{ gridTemplateColumns: buildMatrixTemplateColumns(stackAnalysis.matrixColumns.length) }}
                  >
                    <div className="stack-matrix__repo">
                      <Link to={`/repos/${item.repoId}`}>{item.repoName}</Link>
                      <small>
                        {item.intensityLabel} · {formatNumber(item.commitCount30d)} commits
                      </small>
                    </div>
                    {item.values.map((value, index) => (
                      <span
                        key={`${item.repoId}-${stackAnalysis.matrixColumns[index]}`}
                        className={`stack-matrix__cell stack-matrix__cell--${value}`}
                        title={`${item.repoName} / ${stackAnalysis.matrixColumns[index]} / ${getMatrixValueLabel(value)}`}
                      />
                    ))}
                  </div>
                ))}
              </div>
              <div className="stack-matrix__legend">
                <span>未使用</span>
                {[1, 2, 3, 4].map((item) => (
                  <i key={item} className={`stack-matrix__legend-cell stack-matrix__legend-cell--${item}`} />
                ))}
                <span>高频使用</span>
              </div>
            </div>
          ) : (
            <EmptyState title="暂无项目矩阵" description="同步更多仓库后会显示技术栈矩阵。" />
          )}
        </article>
      </section>

      <section ref={relationRef} className="stack-analysis-page__relations">
        <article className="stack-panel">
          <PanelHeading
            variant="statistics"
            eyebrow="RELATIONSHIP"
            title="技术栈关联关系"
            accessory={<span className="stack-panel__header-chip">仓库共现</span>}
          />
          <div className="stack-relations">
            <div className="stack-relations__chips">
              {technologyChips.map((item) => (
                <span key={item.name} className="stack-relations__chip">
                  {item.name}
                </span>
              ))}
            </div>
            {stackAnalysis.relationships.length > 0 ? (
              <div className="stack-relations__pairs">
                {stackAnalysis.relationships.map((item) => (
                  <div key={`${item.source}-${item.target}`} className="stack-relations__pair">
                    <div className="stack-relations__pair-main">
                      <strong>{item.source}</strong>
                      <span />
                      <strong>{item.target}</strong>
                    </div>
                    <small>{item.weight} 个仓库同时使用</small>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState title="暂无关联关系" description="当前仓库样本不足，暂时无法形成稳定的共现关系。" />
            )}
          </div>
        </article>
      </section>
    </div>
  );
}

function TopInfoCell(props: TopInfoCellProps): JSX.Element {
  const { icon, label, value, subValue } = props;

  return (
    <div className="stack-analysis-page__topbar-cell">
      <div className="stack-analysis-page__topbar-icon">
        <HeaderIcon name={icon} />
      </div>
      <div className="stack-analysis-page__topbar-copy">
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{subValue}</small>
      </div>
    </div>
  );
}

function SummaryCard(props: SummaryCardProps): JSX.Element {
  const { card, index } = props;
  const Icon = SUMMARY_ICON_LIST[index] ?? SUMMARY_ICON_LIST[0];

  return (
    <article className="stack-summary-card">
      <div className="stack-summary-card__icon">
        <Icon aria-hidden="true" strokeWidth={1.8} />
      </div>
      <div className="stack-summary-card__copy">
        <span>{card.label}</span>
        <strong>{card.value}</strong>
        <div className="stack-summary-card__meta">
          <small>{card.hint}</small>
          <em className={buildTrendClassName(card.trendDirection)}>{card.trend}</em>
        </div>
      </div>
    </article>
  );
}

function HeaderIcon(props: { name: HeaderIconName }): JSX.Element {
  const { name } = props;
  const Icon = HEADER_ICON_MAP[name];

  return <Icon aria-hidden="true" strokeWidth={1.8} />;
}

function buildDonutOption(
  items: DonutChartItem[],
  centerTitle: string,
  centerValue: string,
  viewport: ResponsiveViewport
): EChartsOption {
  const colors = ['#c5e832', '#8fda6b', '#5ab8ff', '#7d85ff', '#f4c44e', '#ff8f5a', '#a4b2c3'];
  const isMobile = viewport === 'mobile';

  return {
    color: colors,
    tooltip: {
      trigger: 'item',
      backgroundColor: '#0d1114',
      borderColor: 'rgba(184,255,59,0.18)',
      textStyle: {
        color: '#f3ebdd'
      }
    },
    graphic: [
      {
        type: 'text',
        left: 'center',
        top: '46%',
        silent: true,
        style: {
          text: `${centerTitle}\n${centerValue}`,
          fill: '#f3ebdd',
          fontSize: isMobile ? 10 : 12,
          fontWeight: 600,
          lineHeight: isMobile ? 16 : 18,
          align: 'center',
          verticalAlign: 'middle'
        }
      }
    ],
    series: [
      {
        type: 'pie',
        radius: isMobile ? ['50%', '74%'] : ['56%', '78%'],
        center: ['50%', '52%'],
        startAngle: 90,
        label: {
          show: false
        },
        itemStyle: {
          borderColor: '#0f1317',
          borderWidth: 2
        },
        data: items
      }
    ]
  };
}

function buildTrendOption(
  monthKeys: string[],
  series: StackAnalysisTrendSeriesItem[],
  viewport: ResponsiveViewport
): EChartsOption {
  const colors = ['#c5e832', '#5ab8ff', '#7d85ff', '#f4c44e', '#ff8f5a'];
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
      textStyle: {
        color: '#cdd3c7',
        fontSize: isMobile ? 9 : 11
      }
    },
    grid: {
      top: isMobile ? 46 : 38,
      left: isMobile ? 24 : 34,
      right: isMobile ? 8 : 12,
      bottom: isMobile ? 22 : 24
    },
    xAxis: {
      type: 'category',
      data: monthKeys.map((item) => item.slice(5)),
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
      symbolSize: isMobile ? 4 : 6,
      lineStyle: {
        width: 2,
        color: colors[index] ?? '#d5dde8'
      },
      itemStyle: {
        color: colors[index] ?? '#d5dde8',
        borderColor: '#0f1317',
        borderWidth: 1
      },
      areaStyle:
        index === 0
          ? {
              color: 'rgba(197, 232, 50, 0.12)'
            }
          : undefined,
      data: item.values
    }))
  };
}

function buildTrendClassName(direction: StackAnalysisTrendDirection): string {
  if (direction === 'up') {
    return 'stack-summary-card__trend stack-summary-card__trend--up';
  }

  if (direction === 'down') {
    return 'stack-summary-card__trend stack-summary-card__trend--down';
  }

  return 'stack-summary-card__trend stack-summary-card__trend--flat';
}

function formatLanguageBytes(item: StackAnalysisLanguageItem): string {
  if (item.bytes >= 1000 * 1000) {
    return `${(item.bytes / (1000 * 1000)).toFixed(1)} MB`;
  }

  if (item.bytes >= 1000) {
    return `${(item.bytes / 1000).toFixed(1)} KB`;
  }

  return `${formatNumber(item.bytes)} B`;
}

function buildMatrixTemplateColumns(columnCount: number): string {
  return `minmax(190px, 1.1fr) repeat(${columnCount}, minmax(48px, 1fr))`;
}

function getMatrixValueLabel(value: number): string {
  if (value >= 4) {
    return '高频使用';
  }

  if (value === 3) {
    return '稳定使用';
  }

  if (value === 2) {
    return '低频使用';
  }

  if (value === 1) {
    return '偶发使用';
  }

  return '未使用';
}

export default StackAnalysisPage;
