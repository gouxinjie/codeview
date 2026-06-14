import { useEffect, useMemo, useState, type ReactElement } from 'react';
import type { EChartsOption } from 'echarts';
import ReactECharts from 'echarts-for-react';
import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  BarChart3,
  CheckCircle2,
  Clock3,
  FolderOpen,
  GitBranch,
  GitCommitHorizontal,
  RefreshCw,
  Settings2,
  User
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { EmptyState } from '@/components/commons/EmptyState';
import { LoadingBlock } from '@/components/commons/LoadingBlock';
import { useAppStore } from '@/store/appStore';
import type {
  HeatmapCell,
  StatisticsActivityDistributionRow,
  StatisticsBreakdownItem,
  StatisticsData,
  StatisticsRepoRankingRow,
  StatisticsSummaryCard,
  StatisticsTimeHeatCell
} from '@/types/api';
import { fetchStatistics } from '@/utils/api';
import { formatDate, formatDateTime, formatNumber, translateSyncStatus } from '@/utils/date';
import './index.scss';

type TrendGranularity = 'day' | 'week' | 'month';
type StatisticsRangeMode = 7 | 30 | 90 | 'custom';
type HeaderIconName = 'user' | 'clock' | 'sync' | 'success' | 'github' | 'settings';

interface TopInfoCellProps {
  icon: HeaderIconName;
  label: string;
  value: string;
  subValue: string;
}

interface StatisticsSummaryCardProps {
  card: StatisticsSummaryCard;
  icon: ReactElement;
}

interface PanelHeadingProps {
  title: string;
  accessory?: ReactElement;
}

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

interface TrendPoint {
  label: string;
  count: number;
}

const HEADER_ICON_MAP: Record<HeaderIconName, LucideIcon> = {
  user: User,
  clock: Clock3,
  sync: RefreshCw,
  success: CheckCircle2,
  github: GitBranch,
  settings: Settings2
};

const SUMMARY_ICON_LIST: LucideIcon[] = [
  GitCommitHorizontal,
  FolderOpen,
  Activity,
  Clock3,
  BarChart3,
  GitBranch
];

/**
 * 页面说明：数据统计页面。
 * Props 类型：无。
 * 含义：展示多维度统计图表、仓库分布与提交活跃趋势。
 * 是否必填：无。
 * 默认值：无。
 */
function StatisticsPage(): ReactElement {
  const { config } = useAppStore();
  const [statistics, setStatistics] = useState<StatisticsData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [trendGranularity, setTrendGranularity] = useState<TrendGranularity>('day');
  const [rangeMode, setRangeMode] = useState<StatisticsRangeMode>(30);
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
  const [pendingCustomStartDate, setPendingCustomStartDate] = useState<string>('');
  const [pendingCustomEndDate, setPendingCustomEndDate] = useState<string>('');

  useEffect(() => {
    let active = true;

    const loadStatistics = async (): Promise<void> => {
      setLoading(true);

      try {
        const result =
          rangeMode === 'custom' && customStartDate && customEndDate
            ? await fetchStatistics({
                startDate: customStartDate,
                endDate: customEndDate
              })
            : await fetchStatistics({
                rangeDays: rangeMode === 'custom' ? 30 : rangeMode
              });

        if (!active) {
          return;
        }

        setStatistics(result);
        setError('');

        if (result.appliedRange.mode === 'custom') {
          setPendingCustomStartDate(result.appliedRange.startDate);
          setPendingCustomEndDate(result.appliedRange.endDate);
        }
      } catch (requestError) {
        if (!active) {
          return;
        }

        setError(requestError instanceof Error ? requestError.message : '数据统计加载失败');
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void loadStatistics();

    return () => {
      active = false;
    };
  }, [customEndDate, customStartDate, rangeMode]);

  useEffect(() => {
    if (!statistics || statistics.appliedRange.mode !== 'custom') {
      return;
    }

    setCustomStartDate(statistics.appliedRange.startDate);
    setCustomEndDate(statistics.appliedRange.endDate);
    setPendingCustomStartDate(statistics.appliedRange.startDate);
    setPendingCustomEndDate(statistics.appliedRange.endDate);
  }, [statistics]);

  const trendSeries = useMemo<TrendPoint[]>(
    () => buildTrendSeries(statistics?.trendDaily ?? [], trendGranularity),
    [statistics?.trendDaily, trendGranularity]
  );
  const yearlyHeatmapMatrix = useMemo<HeatmapMatrixModel>(
    () => buildYearHeatmapMatrix(statistics?.yearlyHeatmap ?? []),
    [statistics?.yearlyHeatmap]
  );
  const timeHeatmapMaxValue = useMemo<number>(
    () => Math.max(0, ...(statistics?.commitTimeHeatmap ?? []).map((item) => item.count)),
    [statistics?.commitTimeHeatmap]
  );

  const currentRangeText = useMemo<string>(() => {
    if (!statistics) {
      return '最近 30 天';
    }

    if (statistics.appliedRange.mode === 'custom') {
      return `${statistics.appliedRange.startDate} 至 ${statistics.appliedRange.endDate}`;
    }

    return `最近 ${statistics.appliedRange.days} 天`;
  }, [statistics]);

  const customRangeInvalid =
    pendingCustomStartDate !== '' &&
    pendingCustomEndDate !== '' &&
    pendingCustomStartDate > pendingCustomEndDate;

  const customRangeDirty =
    pendingCustomStartDate !== customStartDate || pendingCustomEndDate !== customEndDate;

  const applyCustomRange = (): void => {
    if (!pendingCustomStartDate || !pendingCustomEndDate || customRangeInvalid) {
      return;
    }

    setRangeMode('custom');
    setCustomStartDate(pendingCustomStartDate);
    setCustomEndDate(pendingCustomEndDate);
  };

  if (loading) {
    return <LoadingBlock text="正在加载数据统计" />;
  }

  if (error || !statistics) {
    return <EmptyState title="数据统计暂不可用" description={error || '请稍后重试。'} />;
  }

  return (
    <div className="statistics-page">
      <section className="statistics-page__topbar">
        <TopInfoCell
          icon="user"
          label="用户名"
          value={statistics.header.githubUsername || 'your-username'}
          subValue={config?.hasToken ? 'GitHub 已连接' : '等待接入 GitHub Token'}
        />
        <TopInfoCell
          icon="clock"
          label="当前时间"
          value={formatDateTime(statistics.header.currentTime)}
          subValue={`时区 ${config?.timezone || 'Asia/Shanghai'}`}
        />
        <TopInfoCell
          icon="success"
          label="同步状态"
          value={translateSyncStatus(statistics.header.syncStatus)}
          subValue={config?.hasToken ? '最新配置已生效' : '请先完成账号配置'}
        />
        <TopInfoCell
          icon="sync"
          label="最近同步时间"
          value={formatDateTime(statistics.header.lastSyncedAt)}
          subValue={config?.includePrivateRepos ? '公开仓库 + 私有仓库' : '仅公开仓库'}
        />
        <div className="statistics-page__topbar-actions">
          <button type="button" className="statistics-page__connect">
            <HeaderIcon name="github" />
            <span>GitHub 连接</span>
          </button>
          <button type="button" className="statistics-page__gear" aria-label="打开设置">
            <HeaderIcon name="settings" />
          </button>
        </div>
      </section>

      <section className="statistics-page__hero">
        <div className="statistics-page__hero-copy">
          <h1>数据统计</h1>
          <p>全局数据概览与多维度分析</p>
        </div>

        <div className="statistics-page__filters">
          {([7, 30, 90] as const).map((item) => (
            <button
              key={item}
              type="button"
              className={
                rangeMode === item
                  ? 'statistics-page__filter-button statistics-page__filter-button--active'
                  : 'statistics-page__filter-button'
              }
              onClick={() => setRangeMode(item)}
            >
              {item} 天
            </button>
          ))}
          <button
            type="button"
            className={
              rangeMode === 'custom'
                ? 'statistics-page__filter-button statistics-page__filter-button--active'
                : 'statistics-page__filter-button'
            }
            onClick={() => setRangeMode('custom')}
          >
            自定义
          </button>
        </div>
      </section>

      {rangeMode === 'custom' && (
        <section className="statistics-page__custom-range">
          <label className="statistics-page__custom-field">
            <span>开始日期</span>
            <input
              type="date"
              value={pendingCustomStartDate}
              onChange={(event) => setPendingCustomStartDate(event.target.value)}
            />
          </label>
          <label className="statistics-page__custom-field">
            <span>结束日期</span>
            <input
              type="date"
              value={pendingCustomEndDate}
              onChange={(event) => setPendingCustomEndDate(event.target.value)}
            />
          </label>
          <button
            type="button"
            className="statistics-page__custom-submit"
            onClick={applyCustomRange}
            disabled={!pendingCustomStartDate || !pendingCustomEndDate || customRangeInvalid || !customRangeDirty}
          >
            应用范围
          </button>
          <div className="statistics-page__custom-meta">
            <strong>{currentRangeText}</strong>
            {customRangeInvalid ? <em>开始日期不能晚于结束日期</em> : <span>支持按实际同步数据范围查看</span>}
          </div>
        </section>
      )}

      <section className="statistics-page__summary">
        {statistics.summaryCards.map((card, index) => (
          <StatisticsSummaryCardView key={card.id} card={card} icon={<SummaryIcon index={index} />} />
        ))}
      </section>

      <section className="statistics-page__grid statistics-page__grid--primary">
        <article className="statistics-panel statistics-panel--trend">
          <PanelHeading title="提交趋势" />
          <div className="statistics-panel__tabs">
            {(['day', 'week', 'month'] as const).map((item) => (
              <button
                key={item}
                type="button"
                className={
                  trendGranularity === item
                    ? 'statistics-panel__tab statistics-panel__tab--active'
                    : 'statistics-panel__tab'
                }
                onClick={() => setTrendGranularity(item)}
              >
                {item === 'day' ? '按天' : item === 'week' ? '按周' : '按月'}
              </button>
            ))}
          </div>
          <ReactECharts
            option={buildStatisticsTrendOption(trendSeries)}
            style={{ height: 248 }}
            opts={{ renderer: 'svg' }}
          />
        </article>

        <article className="statistics-panel statistics-panel--year-heatmap">
          <PanelHeading
            title="提交热力图（全年）"
            accessory={
              <HeatLegend
                minLabel="少"
                maxLabel="多"
                levels={[0, 1, 2, 3, 4]}
                classNamePrefix="statistics-year-heatmap__legend"
              />
            }
          />
          <YearHeatmap matrix={yearlyHeatmapMatrix} />
          <div className="statistics-panel__footnote">
            <span>总提交数：{formatNumber(sumHeatmapCount(statistics.yearlyHeatmap))}</span>
            <span>最长连续提交天数：{formatNumber(getLongestStreak(yearlyHeatmapMatrix.cells))} 天</span>
          </div>
        </article>

        <article className="statistics-panel statistics-panel--time-heatmap">
          <PanelHeading
            title="提交时间分布"
            accessory={
              <HeatLegend
                minLabel="少"
                maxLabel="多"
                levels={[0, 1, 2, 3, 4]}
                classNamePrefix="statistics-time-heatmap__legend"
              />
            }
          />
          <TimeHeatmap data={statistics.commitTimeHeatmap} maxValue={timeHeatmapMaxValue} />
          <div className="statistics-panel__footnote">
            <span>最活跃时间段：{getMostActiveTimeRange(statistics.commitTimeHeatmap)}</span>
          </div>
        </article>
      </section>

      <section className="statistics-page__grid statistics-page__grid--secondary">
        <article className="statistics-panel statistics-panel--donut">
          <PanelHeading title="仓库语言分布" />
          <DonutPanelContent data={statistics.languageDistribution} centerLabel="主要语言" />
          <div className="statistics-panel__donut-meta">
            <span>语言数：{formatNumber(statistics.languageDistribution.length)}</span>
            <span>主语言：{statistics.languageDistribution[0]?.name || '--'}</span>
          </div>
        </article>

        <article className="statistics-panel statistics-panel--donut">
          <PanelHeading title="提交作者分布（个人 vs 其他）" />
          <DonutPanelContent data={statistics.authorDistribution} centerLabel="个人提交" />
          <div className="statistics-panel__donut-meta">
            <span>总提交数：{formatNumber(sumBreakdown(statistics.authorDistribution))}</span>
            <span>个人占比：{getPrimaryBreakdownRatio(statistics.authorDistribution)}</span>
          </div>
        </article>

        <article className="statistics-panel statistics-panel--donut">
          <PanelHeading title="提交类型分布" />
          <DonutPanelContent data={statistics.commitTypeDistribution} centerLabel="提交类型" />
          <div className="statistics-panel__donut-meta">
            <span>总提交数：{formatNumber(sumBreakdown(statistics.commitTypeDistribution))}</span>
            <span>主要类型：{statistics.commitTypeDistribution[0]?.name || '--'}</span>
          </div>
        </article>

        <article className="statistics-panel statistics-panel--change">
          <PanelHeading title="提交结构变化（近 30 天）" />
          <div className="statistics-panel__change-summary">
            <strong className="statistics-panel__change-positive">
              + {formatNumber(sumPositiveChange(statistics.changeTrend))}
            </strong>
            <strong className="statistics-panel__change-negative">
              - {formatNumber(sumNegativeChange(statistics.changeTrend))}
            </strong>
          </div>
          <div className="statistics-panel__change-labels">
            <span>普通提交</span>
            <span>合并提交</span>
          </div>
          <ReactECharts
            option={buildChangeOption(statistics.changeTrend)}
            style={{ height: 180 }}
            opts={{ renderer: 'svg' }}
          />
        </article>
      </section>

      <section className="statistics-page__grid statistics-page__grid--tables">
        <article className="statistics-panel statistics-panel--table">
          <PanelHeading title="活跃度分布（按提交数）" />
          <StatisticsDistributionTable rows={statistics.activityDistribution} />
        </article>

        <article className="statistics-panel statistics-panel--table statistics-panel--ranking">
          <PanelHeading title="仓库排行榜（按提交数）" />
          <StatisticsRankingTable rows={statistics.repoRanking} />
          <Link to="/repos" className="statistics-panel__footlink">
            查看全部仓库 →
          </Link>
        </article>
      </section>
    </div>
  );
}

function TopInfoCell(props: TopInfoCellProps): ReactElement {
  const { icon, label, value, subValue } = props;

  return (
    <div className="statistics-page__topbar-cell">
      <div className="statistics-page__topbar-icon">
        <HeaderIcon name={icon} />
      </div>
      <div className="statistics-page__topbar-copy">
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{subValue}</small>
      </div>
    </div>
  );
}

function StatisticsSummaryCardView(props: StatisticsSummaryCardProps): ReactElement {
  const { card, icon } = props;

  return (
    <article className="statistics-summary-card">
      <div className="statistics-summary-card__icon">{icon}</div>
      <div className="statistics-summary-card__copy">
        <span>{card.label}</span>
        <strong>{formatStatisticsCardValue(card.id, card.value)}</strong>
        <div className="statistics-summary-card__meta">
          <small>{card.hint}</small>
          <em className={`statistics-summary-card__change statistics-summary-card__change--${card.changeDirection}`}>
            {card.changeText}
          </em>
        </div>
      </div>
    </article>
  );
}

function PanelHeading(props: PanelHeadingProps): ReactElement {
  const { title, accessory } = props;

  return (
    <header className="statistics-panel__header">
      <h2>{title}</h2>
      {accessory}
    </header>
  );
}

function DonutPanelContent(props: {
  data: StatisticsBreakdownItem[];
  centerLabel: string;
}): ReactElement {
  const { data, centerLabel } = props;

  return (
    <div className="statistics-panel__donut-layout">
      <div className="statistics-panel__donut-chart">
        <ReactECharts
          option={buildDonutOption(data, centerLabel)}
          style={{ height: 236 }}
          opts={{ renderer: 'svg' }}
        />
      </div>
      <div className="statistics-panel__donut-legend">
        {buildDonutLegendItems(data).map((item) => (
          <div key={item.name} className="statistics-panel__donut-legend-item">
            <span className="statistics-panel__donut-legend-label">
              <i
                className="statistics-panel__donut-legend-dot"
                style={{ backgroundColor: item.color }}
                aria-hidden="true"
              />
              <span title={item.name}>{item.name}</span>
            </span>
            <strong>{item.percentage.toFixed(1)}%</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function HeatLegend(props: {
  minLabel: string;
  maxLabel: string;
  levels: number[];
  classNamePrefix: string;
}): ReactElement {
  const { minLabel, maxLabel, levels, classNamePrefix } = props;

  return (
    <span className={classNamePrefix}>
      <span>{minLabel}</span>
      <span className={`${classNamePrefix}-scale`}>
        {levels.map((item) => (
          <i key={item} className={`${classNamePrefix}-cell ${classNamePrefix}-cell--${item}`} />
        ))}
      </span>
      <span>{maxLabel}</span>
    </span>
  );
}

function YearHeatmap(props: { matrix: HeatmapMatrixModel }): ReactElement {
  const { matrix } = props;

  return (
    <div className="statistics-year-heatmap">
      <div className="statistics-year-heatmap__months">
        {matrix.months.map((item) => (
          <span key={`${item.label}-${item.column}`} style={{ gridColumn: `${item.column + 1} / span 4` }}>
            {item.label}
          </span>
        ))}
      </div>
      <div className="statistics-year-heatmap__body">
        <div className="statistics-year-heatmap__weekdays">
          {['一', '二', '三', '四', '五', '六', '日'].map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
        <div className="statistics-year-heatmap__main">
          <div className="statistics-year-heatmap__grid">
            {matrix.cells.map((cell) => (
              <span
                key={cell.key}
                className={getYearHeatLevelClass(cell.count, matrix.maxValue)}
                title={`${cell.date} · ${cell.count} 次提交`}
                style={{
                  gridColumn: cell.column + 1,
                  gridRow: cell.row + 1
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function TimeHeatmap(props: { data: StatisticsTimeHeatCell[]; maxValue: number }): ReactElement {
  const { data, maxValue } = props;

  return (
    <div className="statistics-time-heatmap">
      <div className="statistics-time-heatmap__body">
        <div className="statistics-time-heatmap__weekdays">
          {['周一', '周二', '周三', '周四', '周五', '周六', '周日'].map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
        <div className="statistics-time-heatmap__main">
          <div className="statistics-time-heatmap__grid">
            {data.map((item) => (
              <span
                key={`${item.weekday}-${item.hour}`}
                className={getTimeHeatLevelClass(item.count, maxValue)}
                title={`${getWeekdayLabel(item.weekday)} ${String(item.hour).padStart(2, '0')}:00 · ${item.count} 次提交`}
                style={{
                  gridColumn: item.hour + 1,
                  gridRow: item.weekday + 1
                }}
              />
            ))}
          </div>
          <div className="statistics-time-heatmap__hours">
            {Array.from({ length: 12 }, (_, index) => index * 2).map((hour) => (
              <span key={hour} style={{ gridColumn: `${hour + 1} / span 2` }}>
                {String(hour).padStart(2, '0')}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatisticsDistributionTable(props: { rows: StatisticsActivityDistributionRow[] }): ReactElement {
  const { rows } = props;
  const totalRow = buildDistributionTotalRow(rows);

  return (
    <div className="statistics-table statistics-table--distribution">
      <table>
        <thead>
          <tr>
            <th>区间</th>
            <th>仓库数量</th>
            <th>占比</th>
            <th>提交数</th>
            <th>占比</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((item) => (
            <tr key={item.label}>
              <th>{item.label}</th>
              <td>{formatNumber(item.repoCount)}</td>
              <td>{item.repoShare.toFixed(1)}%</td>
              <td>{formatNumber(item.commitCount)}</td>
              <td>{item.commitShare.toFixed(1)}%</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th>{totalRow.label}</th>
            <td>{formatNumber(totalRow.repoCount)}</td>
            <td>{totalRow.repoShare.toFixed(0)}%</td>
            <td>{formatNumber(totalRow.commitCount)}</td>
            <td>{totalRow.commitShare.toFixed(0)}%</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function StatisticsRankingTable(props: { rows: StatisticsRepoRankingRow[] }): ReactElement {
  const { rows } = props;

  return (
    <div className="statistics-table statistics-table--ranking">
      <table>
        <thead>
          <tr>
            <th>排名</th>
            <th>仓库名称</th>
            <th>提交数</th>
            <th>活跃天数</th>
            <th>最后提交时间</th>
            <th>贡献占比</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((item, index) => (
            <tr key={item.repoId}>
              <th>{index + 1}</th>
              <td className="statistics-table__repo-cell">{item.name}</td>
              <td>{formatNumber(item.commitCount)}</td>
              <td>{formatNumber(item.activeDays)}</td>
              <td>{item.lastCommitAt ? formatDate(item.lastCommitAt) : '--'}</td>
              <td>
                <span className="statistics-table__progress">
                  <i style={{ width: `${Math.max(8, item.contributionShare)}%` }} />
                  <em>{item.contributionShare.toFixed(1)}%</em>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HeaderIcon(props: { name: HeaderIconName }): ReactElement {
  const { name } = props;
  const Icon = HEADER_ICON_MAP[name];

  return <Icon aria-hidden="true" strokeWidth={1.8} />;
}

function SummaryIcon(props: { index: number }): ReactElement {
  const { index } = props;
  const Icon = SUMMARY_ICON_LIST[index] ?? SUMMARY_ICON_LIST[0];

  return <Icon aria-hidden="true" strokeWidth={1.8} />;
}

function buildTrendSeries(
  data: Array<{ date: string; count: number }>,
  granularity: TrendGranularity
): TrendPoint[] {
  if (granularity === 'day') {
    return data.map((item) => ({
      label: item.date.slice(5),
      count: item.count
    }));
  }

  const groupedMap = new Map<string, number>();

  data.forEach((item) => {
    const currentDate = parseLocalDate(item.date);

    if (granularity === 'week') {
      const currentDay = currentDate.getDay();
      const weekOffset = currentDay === 0 ? -6 : 1 - currentDay;
      currentDate.setDate(currentDate.getDate() + weekOffset);
      const label = `${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`;
      groupedMap.set(label, (groupedMap.get(label) ?? 0) + item.count);
      return;
    }

    const label = item.date.slice(0, 7);
    groupedMap.set(label, (groupedMap.get(label) ?? 0) + item.count);
  });

  return [...groupedMap.entries()].map(([label, count]) => ({
    label,
    count
  }));
}

function buildStatisticsTrendOption(data: TrendPoint[]): EChartsOption {
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
      left: 40,
      right: 16,
      bottom: 28
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
        data: data.map((item) => item.count)
      }
    ]
  };
}

function buildDonutLegendItems(
  data: StatisticsBreakdownItem[]
): Array<{ name: string; value: number; percentage: number; color: string }> {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  const colors = ['#c5e832', '#668cff', '#8fda6b', '#7d85ff', '#f4c44e', '#5ab8ff'];

  return data.map((item, index) => ({
    name: item.name,
    value: item.value,
    percentage: total > 0 ? Number(((item.value / total) * 100).toFixed(1)) : 0,
    color: colors[index] ?? '#aab5a3'
  }));
}

function buildDonutOption(data: StatisticsBreakdownItem[], centerLabel: string): EChartsOption {
  const normalizedData = buildDonutLegendItems(data);
  const primary = normalizedData[0];

  return {
    color: normalizedData.map((item) => item.color),
    tooltip: {
      trigger: 'item',
      confine: true,
      backgroundColor: '#0d1114',
      borderColor: 'rgba(184,255,59,0.18)',
      textStyle: {
        color: '#f3ebdd'
      }
    },
    title: {
      text: primary ? `${centerLabel}\n${primary.name}\n${primary.percentage.toFixed(1)}%` : '暂无数据',
      left: '50%',
      top: '36.5%',
      textAlign: 'center',
      textStyle: {
        color: '#f3ebdd',
        fontSize: 12,
        fontWeight: 600,
        lineHeight: 18
      }
    },
    series: [
      {
        type: 'pie',
        radius: ['52%', '78%'],
        center: ['50%', '52%'],
        startAngle: 95,
        avoidLabelOverlap: true,
        label: {
          show: false
        },
        itemStyle: {
          borderColor: '#0f1317',
          borderWidth: 2
        },
        data: normalizedData
      }
    ]
  };
}

function buildChangeOption(data: Array<{ date: string; positive: number; negative: number }>): EChartsOption {
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
    legend: {
      bottom: 0,
      icon: 'circle',
      itemWidth: 8,
      itemHeight: 8,
      textStyle: {
        color: '#9aa48f',
        fontSize: 10
      }
    },
    grid: {
      top: 12,
      left: 30,
      right: 12,
      bottom: 34
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
        name: '普通提交',
        type: 'bar',
        stack: 'change',
        barWidth: 4,
        itemStyle: {
          color: '#b8ff3b'
        },
        data: sliced.map((item) => item.positive)
      },
      {
        name: '合并提交',
        type: 'bar',
        stack: 'change',
        barWidth: 4,
        itemStyle: {
          color: '#ff6a5a'
        },
        data: sliced.map((item) => -item.negative)
      }
    ]
  };
}

function buildYearHeatmapMatrix(data: HeatmapCell[]): HeatmapMatrixModel {
  const today = new Date();
  const normalizedEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const weekday = normalizedEnd.getDay();
  const mondayOffset = weekday === 0 ? 6 : weekday - 1;

  normalizedEnd.setDate(normalizedEnd.getDate() + (6 - mondayOffset));

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
      const date = formatDayKey(current);
      const count = dataMap.get(date) ?? 0;
      const monthKey = `${current.getFullYear()}-${current.getMonth()}`;

      if (current.getDate() <= 7 && !monthSet.has(monthKey)) {
        monthSet.add(monthKey);
        months.push({
          label: `${current.getMonth() + 1}月`,
          column
        });
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

function getYearHeatLevelClass(value: number, maxValue: number): string {
  if (value <= 0 || maxValue <= 0) {
    return 'statistics-year-heatmap__cell statistics-year-heatmap__cell--0';
  }

  const ratio = value / maxValue;

  if (ratio > 0.8) {
    return 'statistics-year-heatmap__cell statistics-year-heatmap__cell--4';
  }

  if (ratio > 0.55) {
    return 'statistics-year-heatmap__cell statistics-year-heatmap__cell--3';
  }

  if (ratio > 0.3) {
    return 'statistics-year-heatmap__cell statistics-year-heatmap__cell--2';
  }

  return 'statistics-year-heatmap__cell statistics-year-heatmap__cell--1';
}

function getTimeHeatLevelClass(value: number, maxValue: number): string {
  if (value <= 0 || maxValue <= 0) {
    return 'statistics-time-heatmap__cell statistics-time-heatmap__cell--0';
  }

  const ratio = value / maxValue;

  if (ratio > 0.8) {
    return 'statistics-time-heatmap__cell statistics-time-heatmap__cell--4';
  }

  if (ratio > 0.55) {
    return 'statistics-time-heatmap__cell statistics-time-heatmap__cell--3';
  }

  if (ratio > 0.3) {
    return 'statistics-time-heatmap__cell statistics-time-heatmap__cell--2';
  }

  return 'statistics-time-heatmap__cell statistics-time-heatmap__cell--1';
}

function formatStatisticsCardValue(id: string, value: number): string {
  if (id === 'code-volume') {
    return new Intl.NumberFormat('en', {
      notation: 'compact',
      maximumFractionDigits: 1
    })
      .format(value)
      .toLowerCase();
  }

  return formatNumber(value);
}

function sumHeatmapCount(data: HeatmapCell[]): number {
  return data.reduce((sum, item) => sum + item.count, 0);
}

function getLongestStreak(cells: HeatmapMatrixCell[]): number {
  const sorted = [...cells].sort((left, right) => left.date.localeCompare(right.date));
  let longest = 0;
  let current = 0;

  sorted.forEach((item) => {
    if (item.count > 0) {
      current += 1;
      longest = Math.max(longest, current);
      return;
    }

    current = 0;
  });

  return longest;
}

function getMostActiveTimeRange(data: StatisticsTimeHeatCell[]): string {
  const bestCell = [...data].sort((left, right) => right.count - left.count)[0];

  if (!bestCell || bestCell.count <= 0) {
    return '暂无高峰时段';
  }

  return `${String(bestCell.hour).padStart(2, '0')}:00-${String((bestCell.hour + 2) % 24).padStart(2, '0')}:00`;
}

function getWeekdayLabel(value: number): string {
  return ['周一', '周二', '周三', '周四', '周五', '周六', '周日'][value] ?? '周一';
}

function sumPositiveChange(data: Array<{ positive: number; negative: number }>): number {
  return data.reduce((sum, item) => sum + item.positive, 0);
}

function sumNegativeChange(data: Array<{ positive: number; negative: number }>): number {
  return data.reduce((sum, item) => sum + item.negative, 0);
}

function sumBreakdown(data: StatisticsBreakdownItem[]): number {
  return data.reduce((sum, item) => sum + item.value, 0);
}

function getPrimaryBreakdownRatio(data: StatisticsBreakdownItem[]): string {
  const total = sumBreakdown(data);
  const primary = data[0]?.value ?? 0;

  if (total <= 0) {
    return '0.0%';
  }

  return `${((primary / total) * 100).toFixed(1)}%`;
}

function buildDistributionTotalRow(rows: StatisticsActivityDistributionRow[]): StatisticsActivityDistributionRow {
  const repoCount = rows.reduce((sum, item) => sum + item.repoCount, 0);
  const commitCount = rows.reduce((sum, item) => sum + item.commitCount, 0);

  return {
    label: '总计',
    repoCount,
    repoShare: repoCount > 0 ? 100 : 0,
    commitCount,
    commitShare: commitCount > 0 ? 100 : 0
  };
}

function parseLocalDate(value: string): Date {
  return new Date(`${value}T00:00:00`);
}

function formatDayKey(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

export default StatisticsPage;
