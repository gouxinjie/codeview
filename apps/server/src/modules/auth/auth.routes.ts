import { Router } from 'express';
import { z } from 'zod';
import {
  clearAdminLoginFailures,
  clearAdminSession,
  getAdminSessionView,
  getAdminLoginGuardStatus,
  registerAdminLoginFailure,
  startAdminSession,
  validateLoginCsrfToken,
  verifyAdminCredentials
} from '@/modules/auth/auth.service';
import { env } from '@/config/env';
import { createRouteHandler, sendFailure, sendSuccess } from '@/utils/http';

const adminLoginSchema = z.object({
  userId: z.string().min(1),
  username: z.string().min(1),
  password: z.string().min(1)
});

const adminLogoutSchema = z.object({
  userId: z.string().min(1)
});

export const authRouter = Router();

authRouter.get(
  '/auth/session',
  createRouteHandler((request, response) => {
    sendSuccess(response, getAdminSessionView(request, response));
  })
);

authRouter.post(
  '/auth/login',
  createRouteHandler((request, response) => {
    const payload = adminLoginSchema.parse(request.body);
    const loginGuardStatus = getAdminLoginGuardStatus(request);

    if (!validateLoginCsrfToken(request, request.header('x-csrf-token'))) {
      sendFailure(response, 403, 'INVALID_CSRF_TOKEN', 'CSRF 令牌校验失败');
      return;
    }

    if (!loginGuardStatus.allowed) {
      sendFailure(
        response,
        429,
        'ADMIN_LOGIN_RATE_LIMITED',
        `登录尝试过于频繁，请在 ${loginGuardStatus.retryAfterSeconds} 秒后再试`
      );
      return;
    }

    if (!verifyAdminCredentials(payload.username, payload.password)) {
      const nextGuardStatus = registerAdminLoginFailure(request);

      if (!nextGuardStatus.allowed) {
        sendFailure(
          response,
          429,
          'ADMIN_LOGIN_RATE_LIMITED',
          `登录失败次数过多，请在 ${nextGuardStatus.retryAfterSeconds} 秒后再试`
        );
        return;
      }

      sendFailure(response, 401, 'INVALID_ADMIN_PASSWORD', `管理员账号或密码错误，请使用 ${env.adminUsername} 登录`);
      return;
    }

    clearAdminLoginFailures(request);
    startAdminSession(response);
    const sessionView = getAdminSessionView(request, response);
    sendSuccess(response, {
      authenticated: true,
      adminConfigured: sessionView.adminConfigured,
      loginCsrfToken: sessionView.loginCsrfToken,
      adminUsername: sessionView.adminUsername
    });
  })
);

authRouter.post(
  '/auth/logout',
  createRouteHandler((request, response) => {
    adminLogoutSchema.parse(request.body);

    if (!validateLoginCsrfToken(request, request.header('x-csrf-token'))) {
      sendFailure(response, 403, 'INVALID_CSRF_TOKEN', 'CSRF 令牌校验失败');
      return;
    }

    clearAdminSession(response);
    const sessionView = getAdminSessionView(request, response);
    sendSuccess(response, {
      authenticated: false,
      adminConfigured: sessionView.adminConfigured,
      loginCsrfToken: sessionView.loginCsrfToken,
      adminUsername: sessionView.adminUsername
    });
  })
);
