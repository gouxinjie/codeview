import cors from 'cors';
import express from 'express';
import { env } from '@/config/env';
import '@/database/client';
import { configRouter } from '@/modules/config/config.routes';
import { dashboardRouter } from '@/modules/dashboard/dashboard.routes';
import { reposRouter } from '@/modules/repos/repos.routes';
import { stackRouter } from '@/modules/stack/stack.routes';
import { syncRouter } from '@/modules/sync/sync.routes';
import { sendFailure } from '@/utils/http';
import { logger } from '@/utils/logger';

/* 根据当前前端地址生成允许的本地联调来源，兼容 localhost 与 127.0.0.1。 */
function buildAllowedOrigins(webOrigin: string): Set<string> {
  const allowedOrigins = new Set<string>([webOrigin]);

  try {
    const currentUrl = new URL(webOrigin);
    const alternateHostname = currentUrl.hostname === 'localhost'
      ? '127.0.0.1'
      : currentUrl.hostname === '127.0.0.1'
        ? 'localhost'
        : '';

    if (alternateHostname) {
      allowedOrigins.add(`${currentUrl.protocol}//${alternateHostname}${currentUrl.port ? `:${currentUrl.port}` : ''}`);
    }
  } catch (error) {
    logger.error('解析 WEB_ORIGIN 失败', {
      message: error instanceof Error ? error.message : '未知错误'
    });
  }

  return allowedOrigins;
}

export function createApp(): express.Express {
  const app = express();
  const allowedOrigins = buildAllowedOrigins(env.webOrigin);

  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.has(origin)) {
          callback(null, true);
          return;
        }

        logger.info('拒绝未授权来源访问服务端', {
          origin
        });
        callback(null, false);
      },
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
  app.use('/api', stackRouter);

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
