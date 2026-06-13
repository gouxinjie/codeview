import crypto from 'node:crypto';

/* 对输入内容做 HTML 转义，避免后续渲染时产生 XSS 风险。 */
export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/* 将已转义的 HTML 文本还原，供服务端内部解析结构化文件内容使用。*/
export function unescapeHtml(value: string): string {
  return value
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&gt;', '>')
    .replaceAll('&lt;', '<')
    .replaceAll('&amp;', '&');
}

function buildKey(secret: string): Buffer {
  return crypto.createHash('sha256').update(secret).digest();
}

/* 生成后端校验使用的 CSRF 令牌。 */
export function createCsrfToken(): string {
  return crypto.randomBytes(24).toString('hex');
}

/* 使用对称加密保存 GitHub Token，避免明文持久化。 */
export function encryptValue(rawValue: string, secret: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', buildKey(secret), iv);
  const encrypted = Buffer.concat([cipher.update(rawValue, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}.${authTag.toString('hex')}.${encrypted.toString('hex')}`;
}

/* 读取配置时解密 GitHub Token，仅在服务端内部使用。 */
export function decryptValue(payload: string, secret: string): string {
  const [ivHex, authTagHex, encryptedHex] = payload.split('.');

  if (!ivHex || !authTagHex || !encryptedHex) {
    throw new Error('加密内容格式无效');
  }

  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    buildKey(secret),
    Buffer.from(ivHex, 'hex')
  );

  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedHex, 'hex')),
    decipher.final()
  ]);

  return decrypted.toString('utf8');
}
