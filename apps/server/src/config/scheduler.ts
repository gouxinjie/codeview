import { listSyncScheduleConfigs } from '@/modules/config/config.service';
import { syncGitHubData } from '@/modules/sync/sync.service';
import { logger } from '@/utils/logger';

interface ScheduledSyncTask {
  intervalMs: number;
  timer: ReturnType<typeof setTimeout> | null;
  stopped: boolean;
  running: boolean;
}

const scheduleTasks = new Map<string, ScheduledSyncTask>();

/* 按真实分钟间隔调度，避免 90/150 分钟这类配置被错误折算成整点。 */
function scheduleNextRun(userId: string, task: ScheduledSyncTask, delayMs: number): void {
  task.timer = setTimeout(() => {
    void runScheduledSync(userId, task);
  }, delayMs);
}

async function runScheduledSync(userId: string, task: ScheduledSyncTask): Promise<void> {
  if (task.stopped) {
    return;
  }

  if (task.running) {
    scheduleNextRun(userId, task, Math.min(60_000, task.intervalMs));
    return;
  }

  task.running = true;

  try {
    await syncGitHubData({ userId, mode: 'incremental' });
  } catch (error) {
    logger.error('定时同步失败', {
      userId,
      message: error instanceof Error ? error.message : '未知错误'
    });
  } finally {
    task.running = false;

    if (!task.stopped) {
      scheduleNextRun(userId, task, task.intervalMs);
    }
  }
}

function stopScheduledTask(task: ScheduledSyncTask): void {
  task.stopped = true;

  if (task.timer) {
    clearTimeout(task.timer);
    task.timer = null;
  }
}

/* 重新注册指定用户的定时同步计划。 */
export function refreshUserSchedule(userId: string, intervalMinutes: number, hasToken: boolean): void {
  const currentTask = scheduleTasks.get(userId);
  if (currentTask) {
    stopScheduledTask(currentTask);
    scheduleTasks.delete(userId);
  }

  if (!hasToken) {
    return;
  }

  const task: ScheduledSyncTask = {
    intervalMs: intervalMinutes * 60_000,
    timer: null,
    stopped: false,
    running: false
  };

  scheduleTasks.set(userId, task);
  scheduleNextRun(userId, task, task.intervalMs);
}

/* 服务启动时恢复所有已存在的定时任务。 */
export function initializeSchedules(): void {
  const configs = listSyncScheduleConfigs();

  for (const config of configs) {
    refreshUserSchedule(config.userId, config.syncIntervalMinutes, config.hasToken);
  }
}
