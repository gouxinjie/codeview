import { z } from 'zod';
import { env } from '@/config/env';
import { db } from '@/database/client';
import { createCsrfToken, decryptValue, encryptValue, escapeHtml, unescapeHtml } from '@/utils/security';
import { DEFAULT_TIMEZONE, resolveTimezone } from '@/utils/time';

const configInputSchema = z.object({
  userId: z.string().min(1),
  githubUsername: z.string().min(1),
  githubToken: z.string().trim().optional(),
  emailAliases: z.array(z.string().email()).default([]),
  includePrivateRepos: z.boolean().default(false),
  syncIntervalMinutes: z.number().int().min(15).max(1440).default(720),
  defaultTimeRange: z.enum(['30d', '90d', '180d', '365d']).default('30d'),
  timezone: z.string().min(1).default(DEFAULT_TIMEZONE).transform((value) => resolveTimezone(value))
});

interface ConfigRow {
  github_username: string;
  github_token_encrypted: string | null;
  email_aliases_json: string;
  include_private_repos: number;
  sync_interval_minutes: number;
  default_time_range: string;
  timezone: string;
  csrf_token: string;
  last_synced_at: string | null;
}

export interface ConfigView {
  userId: string;
  githubUsername: string;
  hasToken: boolean;
  emailAliases: string[];
  includePrivateRepos: boolean;
  syncIntervalMinutes: number;
  defaultTimeRange: string;
  timezone: string;
  csrfToken: string;
  lastSyncedAt: string | null;
}

export type ConfigInput = z.infer<typeof configInputSchema>;

/* 确保单用户配置行存在，便于前端首次访问时直接拿到 CSRF 令牌。 */
export function ensureConfig(userId: string): void {
  const now = new Date().toISOString();

  db.prepare(
    `
      INSERT OR IGNORE INTO users (user_id, github_username, created_at, updated_at)
      VALUES (@userId, '', @now, @now)
    `
  ).run({ userId, now });

  db.prepare(
    `
      INSERT OR IGNORE INTO sync_configs (
        user_id,
        email_aliases_json,
        include_private_repos,
        sync_interval_minutes,
        default_time_range,
        timezone,
        csrf_token
      )
      VALUES (@userId, '[]', 0, 720, '30d', @timezone, @csrfToken)
    `
  ).run({
    userId,
    timezone: DEFAULT_TIMEZONE,
    csrfToken: createCsrfToken()
  });
}

function parseAliases(payload: string): string[] {
  const parsed = JSON.parse(payload) as unknown;

  return Array.isArray(parsed)
    ? parsed
        .filter((item): item is string => typeof item === 'string')
        .map((item) => unescapeHtml(item))
    : [];
}

/* 读取脱敏后的配置，供前端页面展示。 */
export function getConfig(userId: string): ConfigView {
  ensureConfig(userId);

  const row = db
    .prepare(
      `
        SELECT
          users.github_username,
          sync_configs.github_token_encrypted,
          sync_configs.email_aliases_json,
          sync_configs.include_private_repos,
          sync_configs.sync_interval_minutes,
          sync_configs.default_time_range,
          sync_configs.timezone,
          sync_configs.csrf_token,
          sync_configs.last_synced_at
        FROM users
        INNER JOIN sync_configs ON users.user_id = sync_configs.user_id
        WHERE users.user_id = ?
      `
    )
    .get(userId) as ConfigRow | undefined;

  if (!row) {
    throw new Error('配置不存在');
  }

  return {
    userId,
    githubUsername: row.github_username,
    hasToken: Boolean(row.github_token_encrypted),
    emailAliases: parseAliases(row.email_aliases_json),
    includePrivateRepos: row.include_private_repos === 1,
    syncIntervalMinutes: row.sync_interval_minutes,
    defaultTimeRange: row.default_time_range,
    timezone: resolveTimezone(row.timezone),
    csrfToken: row.csrf_token,
    lastSyncedAt: row.last_synced_at
  };
}

/* 保存配置并更新作者归一化映射，便于后续个人维度统计。 */
export function saveConfig(payload: ConfigInput): ConfigView {
  const config = configInputSchema.parse(payload);
  const existing = getConfig(config.userId);
  const now = new Date().toISOString();
  const normalizedEmailAliases = [...new Set(config.emailAliases.map((item) => escapeHtml(item.trim().toLowerCase())))];
  const resolvedTimezone = resolveTimezone(config.timezone);

  const encryptedToken =
    config.githubToken && config.githubToken.length > 0
      ? encryptValue(config.githubToken, env.encryptionSecret)
      : null;

  db.prepare(
    `
      UPDATE users
      SET github_username = @githubUsername, updated_at = @updatedAt
      WHERE user_id = @userId
    `
  ).run({
    userId: config.userId,
    githubUsername: escapeHtml(config.githubUsername.trim()),
    updatedAt: now
  });

  db.prepare(
    `
      UPDATE sync_configs
      SET
        github_token_encrypted = COALESCE(@githubTokenEncrypted, github_token_encrypted),
        email_aliases_json = @emailAliases,
        include_private_repos = @includePrivateRepos,
        sync_interval_minutes = @syncIntervalMinutes,
        default_time_range = @defaultTimeRange,
        timezone = @timezone
      WHERE user_id = @userId
    `
  ).run({
    userId: config.userId,
    githubTokenEncrypted: encryptedToken,
    emailAliases: JSON.stringify(normalizedEmailAliases),
    includePrivateRepos: config.includePrivateRepos ? 1 : 0,
    syncIntervalMinutes: config.syncIntervalMinutes,
    defaultTimeRange: config.defaultTimeRange,
    timezone: resolvedTimezone
  });

  db.prepare('DELETE FROM author_identities WHERE user_id = ?').run(config.userId);

  db.prepare(
    `
      INSERT INTO author_identities (
        user_id,
        canonical_author_id,
        github_login,
        author_email,
        author_name,
        is_primary
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `
  ).run(
    config.userId,
    `user:${config.userId}`,
    escapeHtml(config.githubUsername.trim().toLowerCase()),
    '',
    escapeHtml(config.githubUsername.trim()),
    1
  );

  const insertIdentityStatement = db.prepare(
    `
      INSERT INTO author_identities (
        user_id,
        canonical_author_id,
        github_login,
        author_email,
        author_name,
        is_primary
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `
  );

  for (const alias of normalizedEmailAliases) {
    insertIdentityStatement.run(
      config.userId,
      `user:${config.userId}`,
      '',
      alias,
      escapeHtml(config.githubUsername.trim()),
      0
    );
  }

  return {
    ...getConfig(config.userId),
    csrfToken: existing.csrfToken
  };
}

/* 校验 POST 请求携带的 CSRF 令牌。 */
export function validateCsrfToken(userId: string, csrfToken: string | undefined): boolean {
  if (!csrfToken) {
    return false;
  }

  const config = getConfig(userId);
  return config.csrfToken === csrfToken;
}

/* 仅供同步服务读取真实 Token，前端永远不返回明文。 */
export function getDecryptedToken(userId: string): string | null {
  ensureConfig(userId);

  const row = db
    .prepare('SELECT github_token_encrypted FROM sync_configs WHERE user_id = ?')
    .get(userId) as { github_token_encrypted: string | null } | undefined;

  if (!row?.github_token_encrypted) {
    return null;
  }

  return decryptValue(row.github_token_encrypted, env.encryptionSecret);
}

/* 同步完成后更新最后同步时间，供头部状态显示。 */
export function updateLastSyncedAt(userId: string, timestamp: string): void {
  ensureConfig(userId);

  db.prepare('UPDATE sync_configs SET last_synced_at = ? WHERE user_id = ?').run(timestamp, userId);
}

export interface SyncScheduleConfig {
  userId: string;
  syncIntervalMinutes: number;
  hasToken: boolean;
}

/* 服务启动时读取所有已配置用户，用于注册定时同步任务。 */
export function listSyncScheduleConfigs(): SyncScheduleConfig[] {
  return db
    .prepare(
      `
        SELECT
          user_id AS userId,
          sync_interval_minutes AS syncIntervalMinutes,
          github_token_encrypted IS NOT NULL AS hasToken
        FROM sync_configs
      `
    )
    .all() as SyncScheduleConfig[];
}
