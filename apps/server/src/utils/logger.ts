/* 统一日志工具，仅输出必要信息，避免泄露敏感配置。 */
export const logger = {
  info(message: string, meta?: Record<string, string | number | boolean | null>): void {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[INFO] ${message}`, meta ?? {});
    }
  },
  error(message: string, meta?: Record<string, string | number | boolean | null>): void {
    console.error(`[ERROR] ${message}`, meta ?? {});
  }
};

