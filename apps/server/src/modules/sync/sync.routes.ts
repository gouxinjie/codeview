import { Router } from 'express';
import { z } from 'zod';
import { createRouteHandler, getUserIdFromRequest, sendFailure, sendSuccess } from '@/utils/http';
import { validateCsrfToken } from '@/modules/config/config.service';
import { getSyncStatus, syncGitHubData } from '@/modules/sync/sync.service';

const syncBodySchema = z.object({
  userId: z.string().min(1)
});

export const syncRouter = Router();

syncRouter.post(
  '/sync/full',
  createRouteHandler(async (request, response) => {
    const payload = syncBodySchema.parse(request.body);

    if (!validateCsrfToken(payload.userId, request.header('x-csrf-token'))) {
      sendFailure(response, 403, 'INVALID_CSRF_TOKEN', 'CSRF 令牌校验失败');
      return;
    }

    await syncGitHubData({ userId: payload.userId, mode: 'full' });
    sendSuccess(response, getSyncStatus(payload.userId));
  })
);

syncRouter.post(
  '/sync/incremental',
  createRouteHandler(async (request, response) => {
    const payload = syncBodySchema.parse(request.body);

    if (!validateCsrfToken(payload.userId, request.header('x-csrf-token'))) {
      sendFailure(response, 403, 'INVALID_CSRF_TOKEN', 'CSRF 令牌校验失败');
      return;
    }

    await syncGitHubData({ userId: payload.userId, mode: 'incremental' });
    sendSuccess(response, getSyncStatus(payload.userId));
  })
);

syncRouter.post(
  '/sync/repo/:id',
  createRouteHandler(async (request, response) => {
    const payload = syncBodySchema.parse(request.body);
    const repoId = Number(request.params.id);

    if (!validateCsrfToken(payload.userId, request.header('x-csrf-token'))) {
      sendFailure(response, 403, 'INVALID_CSRF_TOKEN', 'CSRF 令牌校验失败');
      return;
    }

    if (!Number.isInteger(repoId) || repoId <= 0) {
      sendFailure(response, 400, 'INVALID_REPO_ID', '仓库 ID 不合法');
      return;
    }

    await syncGitHubData({ userId: payload.userId, mode: 'single', repoId });
    sendSuccess(response, getSyncStatus(payload.userId));
  })
);

syncRouter.get(
  '/sync/status',
  createRouteHandler((request, response) => {
    const userId = getUserIdFromRequest(request);

    if (!userId) {
      sendFailure(response, 400, 'INVALID_USER_ID', '请求缺少 userId');
      return;
    }

    sendSuccess(response, getSyncStatus(userId));
  })
);
