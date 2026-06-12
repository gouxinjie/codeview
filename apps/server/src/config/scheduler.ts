import cron, { type ScheduledTask } from 'node-cron';
import { listSyncScheduleConfigs } from '../modules/config/config.service';
import { logger } from '../utils/logger';
import { syncGitHubData } from '../modules/sync/sync.service';

const scheduleTasks = new Map<string, ScheduledTask>();

function buildCronExpression(intervalMinutes: number): string {
  if (intervalMinutes < 60) {
    return `*/${intervalMinutes} * * * *`;
  }

  const hourInterval = Math.max(1, Math.floor(intervalMinutes / 60));
  return `0 */${hourInterval} * * *`;
}

/* 重新注册指定用户的定时同步计划。 */
export function refreshUserSchedule(userId: string, intervalMinutes: number, hasToken: boolean): void {
  const currentTask = scheduleTasks.get(userId);
  if (currentTask) {
    currentTask.stop();
    scheduleTasks.delete(userId);
  }

  if (!hasToken) {
    return;
  }

  const expression = buildCronExpression(intervalMinutes);
  const task = cron.schedule(expression, async () => {
    try {
      await syncGitHubData({ userId, mode: 'incremental' });
    } catch (error) {
      logger.error('定时同步失败', {
        userId,
        message: error instanceof Error ? error.message : '未知错误'
      });
    }
  });

  scheduleTasks.set(userId, task);
}

/* 服务启动时恢复所有已存在的定时任务。 */
export function initializeSchedules(): void {
  const configs = listSyncScheduleConfigs();

  for (const config of configs) {
    refreshUserSchedule(config.userId, config.syncIntervalMinutes, config.hasToken);
  }
}

