import crypto from 'node:crypto';

const PREFIX = 'enc:v1:';

export function encryptSecret(value: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${Buffer.concat([iv, tag, encrypted]).toString('base64')}`;
}

export function decryptSecret(value: string): string {
  if (!value.startsWith(PREFIX)) return value;
  const key = getKey();
  const payload = Buffer.from(value.slice(PREFIX.length), 'base64');
  const iv = payload.subarray(0, 12);
  const tag = payload.subarray(12, 28);
  const encrypted = payload.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

export function encryptVariables(variables?: Record<string, string>): Record<string, string> | undefined {
  if (!variables) return undefined;
  return Object.fromEntries(Object.entries(variables).map(([key, value]) => [key, encryptSecret(value)]));
}

export function decryptVariables(variables?: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(variables ?? {}).map(([key, value]) => [key, decryptSecret(value)]));
}

export function maskVariables(variables?: Record<string, string>): Record<string, string> | undefined {
  if (!variables) return undefined;
  return Object.fromEntries(Object.keys(variables).map((key) => [key, '[REDACTED]']));
}

function getKey(): Buffer {
  const raw = process.env.TESTHUB_SECRET_KEY ?? 'testhub-dev-secret-key-change-me';
  return crypto.createHash('sha256').update(raw).digest();
}
