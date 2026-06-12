import { differenceInCalendarDays, startOfWeek } from 'date-fns';
import { formatInTimeZone, toZonedTime } from 'date-fns-tz';

export const DEFAULT_TIMEZONE = 'Asia/Shanghai';

/* 将时间转换为自然日键，保证所有统计口径一致。 */
export function getDayKey(date: Date | string, timezone: string): string {
  return formatInTimeZone(date, timezone, 'yyyy-MM-dd');
}

/* 将时间转换为自然月键。 */
export function getMonthKey(date: Date | string, timezone: string): string {
  return formatInTimeZone(date, timezone, 'yyyy-MM');
}

/* 将时间转换为自然周起始日期，周一作为一周开始。 */
export function getWeekKey(date: Date | string, timezone: string): string {
  const zonedDate = toZonedTime(date, timezone);
  const weekStart = startOfWeek(zonedDate, { weekStartsOn: 1 });

  return formatInTimeZone(weekStart, timezone, 'yyyy-MM-dd');
}

/* 计算距离今天的自然日差，用于活跃度和新鲜度评分。 */
export function getDaysFromNow(date: Date | string, timezone: string): number {
  const todayKey = getDayKey(new Date(), timezone);
  const targetKey = getDayKey(date, timezone);

  return differenceInCalendarDays(new Date(todayKey), new Date(targetKey));
}

