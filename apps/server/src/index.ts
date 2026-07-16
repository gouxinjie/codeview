import { createApp } from '@/app';
import { env } from '@/config/env';
import { initializeSchedules } from '@/config/scheduler';
import { bootstrapOwnerConfigFromEnv, ensureConfig, getConfig } from '@/modules/config/config.service';
import { startSyncGitHubData } from '@/modules/sync/sync.service';
import { logger } from '@/utils/logger';

/* 默认站点接入了 GitHub Token 但尚未有成功同步记录时，启动后自动补一轮全量同步。 */
function bootstrapInitialSync(userId: string): void {
  const config = getConfig(userId, true);

  if (!config.hasToken || config.lastSyncedAt) {
    return;
  }

  try {
    startSyncGitHubData({
      userId,
      mode: 'full'
    });

    logger.info('检测到默认站点尚未完成首次同步，已自动启动全量同步', {
      userId
    });
  } catch (error) {
    logger.error('默认站点首次自动同步启动失败，服务将继续运行', {
      userId,
      message: error instanceof Error ? error.message : '未知错误'
    });
  }
}

async function bootstrap(): Promise<void> {
  const app = createApp();

  ensureConfig(env.defaultUserId);

  try {
    await bootstrapOwnerConfigFromEnv(env.defaultUserId);
  } catch (error) {
    logger.error('默认管理员 GitHub 配置自动导入失败，服务将继续启动', {
      userId: env.defaultUserId,
      message: error instanceof Error ? error.message : '未知错误'
    });
  }

  initializeSchedules();
  bootstrapInitialSync(env.defaultUserId);

  app.listen(env.serverPort, () => {
    logger.info('CodeView server started', {
      port: env.serverPort,
      userId: env.defaultUserId
    });
  });
}

void bootstrap().catch((error: unknown) => {
  logger.error('CodeView server bootstrap failed', {
    message: error instanceof Error ? error.message : '未知错误'
  });
  process.exitCode = 1;
});
