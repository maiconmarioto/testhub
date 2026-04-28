import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
const keyLength = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const derived = await scrypt(password, salt, keyLength) as Buffer;
  return `scrypt:${salt}:${derived.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split(':');
  if (parts.length !== 3) return false;
  const [scheme, salt, expectedHex] = parts;
  if (scheme !== 'scrypt' || !/^[a-f0-9]{32}$/i.test(salt) || !/^[a-f0-9]{128}$/i.test(expectedHex)) return false;
  const actual = await scrypt(password, salt, keyLength) as Buffer;
  const expected = Buffer.from(expectedHex, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function createSessionToken(): string {
  return randomBytes(24).toString('hex');
}

export function createPersonalAccessToken(): string {
  return `th_pat_${randomBytes(32).toString('base64url')}`;
}

export function createResetToken(): string {
  return randomBytes(20).toString('hex');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function sessionExpiresAt(now = new Date()): string {
  return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
}

export function resetExpiresAt(now = new Date()): string {
  return new Date(now.getTime() + 15 * 60 * 1000).toISOString();
}
