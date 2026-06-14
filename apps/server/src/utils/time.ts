import { differenceInCalendarDays, startOfWeek } from 'date-fns';
import { formatInTimeZone, toZonedTime } from 'date-fns-tz';

export const DEFAULT_TIMEZONE = 'Asia/Shanghai';

export function isValidTimezone(timezone: string): boolean {
  try {
    Intl.DateTimeFormat('zh-CN', { timeZone: timezone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function resolveTimezone(timezone: string | null | undefined): string {
  const normalizedTimezone = timezone?.trim();

  if (!normalizedTimezone) {
    return DEFAULT_TIMEZONE;
  }

  return isValidTimezone(normalizedTimezone) ? normalizedTimezone : DEFAULT_TIMEZONE;
}

/* 将时间转换为自然日键，保证所有统计口径一致。 */
export function getDayKey(date: Date | string, timezone: string): string {
  return formatInTimeZone(date, resolveTimezone(timezone), 'yyyy-MM-dd');
}

/* 将时间转换为自然月键。 */
export function getMonthKey(date: Date | string, timezone: string): string {
  return formatInTimeZone(date, resolveTimezone(timezone), 'yyyy-MM');
}

/* 将时间转换为自然周起始日期，周一作为一周开始。 */
export function getWeekKey(date: Date | string, timezone: string): string {
  const safeTimezone = resolveTimezone(timezone);
  const zonedDate = toZonedTime(date, safeTimezone);
  const weekStart = startOfWeek(zonedDate, { weekStartsOn: 1 });

  return formatInTimeZone(weekStart, safeTimezone, 'yyyy-MM-dd');
}

/* 计算距离今天的自然日差，用于活跃度和新鲜度评分。 */
export function getDaysFromNow(date: Date | string, timezone: string): number {
  const todayKey = getDayKey(new Date(), timezone);
  const targetKey = getDayKey(date, timezone);

  return differenceInCalendarDays(new Date(todayKey), new Date(targetKey));
}
