import path from 'node:path';
import { z } from 'zod';

const envSchema = z.object({
  SERVER_PORT: z.coerce.number().int().positive().default(3101),
  WEB_ORIGIN: z.string().default('http://localhost:3100'),
  DATABASE_PATH: z.string().default('./data/asset-console.db'),
  DEFAULT_USER_ID: z.string().min(1).default('local-user'),
  ENCRYPTION_SECRET: z.string().min(16).default('asset-console-dev-secret')
});

const parsedEnv = envSchema.parse(process.env);

export const env = {
  serverPort: parsedEnv.SERVER_PORT,
  webOrigin: parsedEnv.WEB_ORIGIN,
  databasePath: path.resolve(process.cwd(), parsedEnv.DATABASE_PATH),
  defaultUserId: parsedEnv.DEFAULT_USER_ID,
  encryptionSecret: parsedEnv.ENCRYPTION_SECRET
};
