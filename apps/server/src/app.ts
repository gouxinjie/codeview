import cors from 'cors';
import express from 'express';
import { env } from '@/config/env';
import '@/database/client';
import { configRouter } from '@/modules/config/config.routes';
import { dashboardRouter } from '@/modules/dashboard/dashboard.routes';
import { reposRouter } from '@/modules/repos/repos.routes';
import { syncRouter } from '@/modules/sync/sync.routes';
import { sendFailure } from '@/utils/http';
import { logger } from '@/utils/logger';

export function createApp(): express.Express {
  const app = express();

  app.use(
    cors({
      origin: env.webOrigin,
      credentials: true
    })
  );
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_request, response) => {
    response.json({
      success: true,
      code: 200,
      message: '操作成功',
      data: {
        status: 'ok'
      }
    });
  });

  app.use('/api', configRouter);
  app.use('/api', syncRouter);
  app.use('/api', dashboardRouter);
  app.use('/api', reposRouter);

  app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
    logger.error('接口异常', {
      message: error instanceof Error ? error.message : '未知错误'
    });

    sendFailure(
      response,
      500,
      'INTERNAL_SERVER_ERROR',
      error instanceof Error ? error.message : '服务端发生未知错误'
    );
  });

  return app;
}
