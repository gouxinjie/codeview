import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Request, Response } from 'express';
import { env } from '@/config/env';

const ADMIN_SESSION_COOKIE_NAME = 'codeview_admin_session';
const LOGIN_CSRF_COOKIE_NAME = 'codeview_login_csrf';
const ADMIN_SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
const LOGIN_CSRF_MAX_AGE_SECONDS = 12 * 60 * 60;
const ADMIN_LOGIN_FAILURE_WINDOW_MS = 10 * 60 * 1000;
const ADMIN_LOGIN_MAX_FAILURES = 5;
const ADMIN_LOGIN_BLOCK_MS = 15 * 60 * 1000;

interface AdminLoginGuardState {
  failureCount: number;
  windowStartedAt: number;
  blockedUntil: number;
}

export interface AdminLoginGuardStatus {
  allowed: boolean;
  retryAfterSeconds: number;
}

const adminLoginGuardStates = new Map<string, AdminLoginGuardState>();

export interface AdminSessionView {
  authenticated: boolean;
  adminConfigured: boolean;
  loginCsrfToken: string;
  adminUsername: string;
}

interface CookieOptions {
  httpOnly: boolean;
  maxAgeSeconds: number;
}

function isSecureCookie(): boolean {
  return env.webOrigin.startsWith('https://');
}

function buildCookie(name: string, value: string, options: CookieOptions): string {
  const cookieParts = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    `Max-Age=${options.maxAgeSeconds}`,
    'SameSite=Lax'
  ];

  if (options.httpOnly) {
    cookieParts.push('HttpOnly');
  }

  if (isSecureCookie()) {
    cookieParts.push('Secure');
  }

  return cookieParts.join('; ');
}

function parseCookieHeader(request: Request): Map<string, string> {
  const cookieHeader = request.header('cookie');
  const cookies = new Map<string, string>();

  if (!cookieHeader) {
    return cookies;
  }

  cookieHeader.split(';').forEach((item) => {
    const separatorIndex = item.indexOf('=');

    if (separatorIndex <= 0) {
      return;
    }

    const key = item.slice(0, separatorIndex).trim();
    const value = item.slice(separatorIndex + 1).trim();

    if (key.length === 0) {
      return;
    }

    cookies.set(key, decodeURIComponent(value));
  });

  return cookies;
}

function getCookieValue(request: Request, name: string): string | null {
  return parseCookieHeader(request).get(name) ?? null;
}

/* 提取请求来源地址，用于做登录失败限流。 */
function resolveRequestClientIp(request: Request): string {
  const requestIp = request.ip?.trim();

  if (requestIp) {
    return requestIp;
  }

  const socketIp = request.socket.remoteAddress?.trim();

  if (socketIp) {
    return socketIp;
  }

  return request.ip || 'unknown';
}

function cleanupExpiredAdminLoginGuardStates(now: number): void {
  adminLoginGuardStates.forEach((state, key) => {
    const windowExpired = state.windowStartedAt + ADMIN_LOGIN_FAILURE_WINDOW_MS <= now;
    const blockExpired = state.blockedUntil <= now;

    if (windowExpired && blockExpired) {
      adminLoginGuardStates.delete(key);
    }
  });
}

function getAdminLoginGuardKey(request: Request): string {
  return resolveRequestClientIp(request);
}

/* 查询当前来源是否仍处于登录限制期。 */
export function getAdminLoginGuardStatus(request: Request): AdminLoginGuardStatus {
  const now = Date.now();
  const guardKey = getAdminLoginGuardKey(request);

  cleanupExpiredAdminLoginGuardStates(now);

  const currentState = adminLoginGuardStates.get(guardKey);

  if (!currentState) {
    return {
      allowed: true,
      retryAfterSeconds: 0
    };
  }

  if (currentState.blockedUntil > now) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((currentState.blockedUntil - now) / 1000))
    };
  }

  if (currentState.windowStartedAt + ADMIN_LOGIN_FAILURE_WINDOW_MS <= now) {
    adminLoginGuardStates.delete(guardKey);
  }

  return {
    allowed: true,
    retryAfterSeconds: 0
  };
}

/* 记录一次管理员登录失败，连续失败过多时进入短时锁定。 */
export function registerAdminLoginFailure(request: Request): AdminLoginGuardStatus {
  const now = Date.now();
  const guardKey = getAdminLoginGuardKey(request);
  const currentState = adminLoginGuardStates.get(guardKey);

  if (!currentState || currentState.windowStartedAt + ADMIN_LOGIN_FAILURE_WINDOW_MS <= now) {
    adminLoginGuardStates.set(guardKey, {
      failureCount: 1,
      windowStartedAt: now,
      blockedUntil: 0
    });

    return {
      allowed: true,
      retryAfterSeconds: 0
    };
  }

  const nextFailureCount = currentState.failureCount + 1;
  const blockedUntil =
    nextFailureCount >= ADMIN_LOGIN_MAX_FAILURES
      ? now + ADMIN_LOGIN_BLOCK_MS
      : 0;

  adminLoginGuardStates.set(guardKey, {
    failureCount: nextFailureCount,
    windowStartedAt: currentState.windowStartedAt,
    blockedUntil
  });

  if (blockedUntil > now) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((blockedUntil - now) / 1000))
    };
  }

  return {
    allowed: true,
    retryAfterSeconds: 0
  };
}

/* 登录成功后清理当前来源的失败记录，避免误伤合法管理员。 */
export function clearAdminLoginFailures(request: Request): void {
  adminLoginGuardStates.delete(getAdminLoginGuardKey(request));
}

function buildAdminSessionValue(expiresAt: number): string {
  const payload = `admin.${expiresAt}`;
  const signature = createHmac('sha256', env.encryptionSecret).update(payload).digest('hex');
  return `${payload}.${signature}`;
}

function verifySignature(payload: string, signature: string): boolean {
  const expectedSignature = createHmac('sha256', env.encryptionSecret).update(payload).digest('hex');
  const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
  const actualBuffer = Buffer.from(signature, 'utf8');

  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, actualBuffer);
}

/* 校验管理员会话 Cookie，避免公开访客直接调用写接口。 */
export function isAdminAuthenticated(request: Request): boolean {
  if (!env.adminConfigured) {
    return false;
  }

  const cookieValue = getCookieValue(request, ADMIN_SESSION_COOKIE_NAME);

  if (!cookieValue) {
    return false;
  }

  const [scope, expiresAtText, signature] = cookieValue.split('.');

  if (scope !== 'admin' || !expiresAtText || !signature) {
    return false;
  }

  const expiresAt = Number(expiresAtText);

  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    return false;
  }

  return verifySignature(`admin.${expiresAtText}`, signature);
}

/* 生成登录阶段使用的双提交 CSRF 令牌，避免管理员登录被跨站诱导。 */
export function issueLoginCsrfToken(request: Request, response: Response): string {
  const existingToken = getCookieValue(request, LOGIN_CSRF_COOKIE_NAME);

  if (existingToken && existingToken.length > 0) {
    return existingToken;
  }

  const token = randomBytes(24).toString('hex');
  response.append(
    'Set-Cookie',
    buildCookie(LOGIN_CSRF_COOKIE_NAME, token, {
      httpOnly: false,
      maxAgeSeconds: LOGIN_CSRF_MAX_AGE_SECONDS
    })
  );
  return token;
}

/* 校验登录与退出登录请求携带的 CSRF 令牌。 */
export function validateLoginCsrfToken(request: Request, csrfToken: string | undefined): boolean {
  if (!csrfToken) {
    return false;
  }

  const cookieToken = getCookieValue(request, LOGIN_CSRF_COOKIE_NAME);

  if (!cookieToken) {
    return false;
  }

  return cookieToken === csrfToken;
}

/* 设置管理员会话 Cookie，后续配置保存与手动同步都依赖该登录态。 */
export function startAdminSession(response: Response): void {
  const expiresAt = Date.now() + ADMIN_SESSION_MAX_AGE_SECONDS * 1000;
  response.append(
    'Set-Cookie',
    buildCookie(ADMIN_SESSION_COOKIE_NAME, buildAdminSessionValue(expiresAt), {
      httpOnly: true,
      maxAgeSeconds: ADMIN_SESSION_MAX_AGE_SECONDS
    })
  );
}

/* 主动清除管理员会话，恢复为公开访客模式。 */
export function clearAdminSession(response: Response): void {
  response.append(
    'Set-Cookie',
    buildCookie(ADMIN_SESSION_COOKIE_NAME, '', {
      httpOnly: true,
      maxAgeSeconds: 0
    })
  );
}

/* 对外返回管理员登录态，同时补发登录所需的 CSRF 令牌。 */
export function getAdminSessionView(request: Request, response: Response): AdminSessionView {
  return {
    authenticated: isAdminAuthenticated(request),
    adminConfigured: env.adminConfigured,
    loginCsrfToken: issueLoginCsrfToken(request, response),
    adminUsername: env.adminUsername
  };
}

/* 校验管理员密码，避免把明文密码暴露到其他模块。 */
export function verifyAdminCredentials(username: string, password: string): boolean {
  if (!env.adminConfigured) {
    return false;
  }

  return username === env.adminUsername && env.adminPassword === password;
}
