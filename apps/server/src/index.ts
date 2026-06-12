import { createApp } from '@/app';
import { env } from '@/config/env';
import { initializeSchedules } from '@/config/scheduler';
import { ensureConfig } from '@/modules/config/config.service';
import { logger } from '@/utils/logger';

const app = createApp();

ensureConfig(env.defaultUserId);
initializeSchedules();

app.listen(env.serverPort, () => {
  logger.info('CodeView server started', {
    port: env.serverPort,
    userId: env.defaultUserId
  });
});
