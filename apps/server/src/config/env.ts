import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

/* 启动时补充读取项目级 .env，避免仅依赖外部注入环境变量导致本地配置失效。 */
function loadDotEnvFiles(): void {
  const envFilePaths = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '../../.env')
  ];

  envFilePaths.forEach((filePath) => {
    if (!fs.existsSync(filePath)) {
      return;
    }

    const fileContent = fs.readFileSync(filePath, 'utf8');

    fileContent.split(/\r?\n/).forEach((line) => {
      const trimmedLine = line.trim();

      if (trimmedLine.length === 0 || trimmedLine.startsWith('#')) {
        return;
      }

      const separatorIndex = trimmedLine.indexOf('=');

      if (separatorIndex <= 0) {
        return;
      }

      const key = trimmedLine.slice(0, separatorIndex).trim();
      const rawValue = trimmedLine.slice(separatorIndex + 1).trim();
      const normalizedValue = rawValue.replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');

      if (key.length > 0 && process.env[key] === undefined) {
        process.env[key] = normalizedValue;
      }
    });
  });
}

loadDotEnvFiles();

const envSchema = z.object({
  SERVER_PORT: z.coerce.number().int().positive().default(3101),
  WEB_ORIGIN: z.string().default('http://localhost:3100'),
  DATABASE_PATH: z.string().default('./data/asset-console.db'),
  DEFAULT_USER_ID: z.string().min(1).default('local-user'),
  ENCRYPTION_SECRET: z.string().min(16).default('asset-console-dev-secret'),
  ADMIN_USERNAME: z.string().min(1).default('xinjie'),
  ADMIN_PASSWORD: z.string().optional(),
  GITHUB_TOKEN: z.string().optional(),
  GITHUB_INCLUDE_PRIVATE_REPOS: z.string().optional()
});

const parsedEnv = envSchema.parse(process.env);
const normalizedAdminUsername = parsedEnv.ADMIN_USERNAME.trim();
const normalizedAdminPassword = parsedEnv.ADMIN_PASSWORD?.trim() ?? '';
const normalizedGitHubToken = parsedEnv.GITHUB_TOKEN?.trim() ?? '';

export const env = {
  serverPort: parsedEnv.SERVER_PORT,
  webOrigin: parsedEnv.WEB_ORIGIN,
  databasePath: path.resolve(process.cwd(), parsedEnv.DATABASE_PATH),
  defaultUserId: parsedEnv.DEFAULT_USER_ID,
  encryptionSecret: parsedEnv.ENCRYPTION_SECRET,
  adminUsername: normalizedAdminUsername,
  adminConfigured: normalizedAdminPassword.length > 0,
  adminPassword: normalizedAdminPassword,
  githubToken: normalizedGitHubToken || null,
  githubIncludePrivateRepos: (parsedEnv.GITHUB_INCLUDE_PRIVATE_REPOS?.trim() ?? '').toLowerCase() === 'true'
};
