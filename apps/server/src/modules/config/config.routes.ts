import { Router } from 'express';
import { z } from 'zod';
import { createRouteHandler, getUserIdFromRequest, sendFailure, sendSuccess } from '@/utils/http';
import { getConfig, saveConfig, validateCsrfToken } from '@/modules/config/config.service';

const configBodySchema = z.object({
  userId: z.string().min(1),
  githubUsername: z.string().min(1),
  githubToken: z.string().trim().optional(),
  emailAliases: z.array(z.string().email()).default([]),
  includePrivateRepos: z.boolean().default(false),
  syncIntervalMinutes: z.number().int().min(15).max(1440).default(720),
  defaultTimeRange: z.enum(['30d', '90d', '180d']).default('30d'),
  timezone: z.string().min(1)
});

export const configRouter = Router();

configRouter.get(
  '/config',
  createRouteHandler((request, response) => {
    const userId = getUserIdFromRequest(request);

    if (!userId) {
      sendFailure(response, 400, 'INVALID_USER_ID', '请求缺少 userId');
      return;
    }

    sendSuccess(response, getConfig(userId));
  })
);

configRouter.post(
  '/config',
  createRouteHandler((request, response) => {
    const payload = configBodySchema.parse(request.body);
    const csrfToken = request.header('x-csrf-token');

    if (!validateCsrfToken(payload.userId, csrfToken)) {
      sendFailure(response, 403, 'INVALID_CSRF_TOKEN', 'CSRF 令牌校验失败');
      return;
    }

    sendSuccess(response, saveConfig(payload));
  })
);
