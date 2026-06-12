import type { HeatmapCell } from '@/types/api';
import type { HeatmapMatrixCell, HeatmapMatrixModel, HeatmapMatrixMonth } from '@/types/heatmap';

/**
 * 函数说明：将日期对象转换为本地时区下的日期键，避免 UTC 偏移造成热力图错位。
 * 参数说明：`value` 为待格式化的日期对象。
 * 返回说明：返回 `YYYY-MM-DD` 形式的日期字符串。
 * author: gouxinjie
 */
function formatHeatmapDayKey(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 函数说明：构建热力图矩阵数据模型，统一生成月份标签、网格坐标和最大值。
 * 参数说明：`data` 为原始热力图数据，`maxMonths` 为保留的月份标签数量。
 * 返回说明：返回可直接用于页面渲染的热力图矩阵模型。
 * author: gouxinjie
 */
export function buildHeatmapMatrix(data: HeatmapCell[], maxMonths: number = 12): HeatmapMatrixModel {
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
  const months: HeatmapMatrixMonth[] = [];
  const monthSet = new Set<string>();

  for (let column = 0; column < 53; column += 1) {
    for (let row = 0; row < 7; row += 1) {
      const current = new Date(start);
      current.setDate(start.getDate() + column * 7 + row);
      const date = formatHeatmapDayKey(current);
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
    months: months.slice(-maxMonths),
    cells,
    maxValue
  };
}

/**
 * 函数说明：提取热力图月份文案列表。
 * 参数说明：`months` 为热力图月份元数据，`maxMonths` 为最多保留的标签数量。
 * 返回说明：返回按渲染顺序排列的月份名称数组。
 * author: gouxinjie
 */
export function buildHeatmapMonthLabels(months: HeatmapMatrixMonth[], maxMonths: number = 12): string[] {
  return months.map((item) => item.label).slice(-maxMonths);
}

/**
 * 函数说明：统计热力图总提交次数。
 * 参数说明：`data` 为原始热力图数据。
 * 返回说明：返回所有日期的提交总数。
 * author: gouxinjie
 */
export function sumHeatmapCount(data: HeatmapCell[]): number {
  return data.reduce((sum, item) => sum + item.count, 0);
}

/**
 * 函数说明：计算热力图中的最长连续活跃天数。
 * 参数说明：`data` 为原始热力图数据。
 * 返回说明：返回最长连续提交天数。
 * author: gouxinjie
 */
export function getLongestHeatmapStreak(data: HeatmapCell[]): number {
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
