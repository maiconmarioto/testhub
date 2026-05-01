import { describe, expect, it } from 'vitest';
import { createSessionToken, hashPassword, hashToken, verifyPassword } from '../packages/db/src/auth.js';

describe('auth helpers', () => {
  it('hashes and verifies passwords', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(hash).not.toContain('correct horse');
    await expect(verifyPassword('correct horse battery staple', hash)).resolves.toBe(true);
    await expect(verifyPassword('wrong', hash)).resolves.toBe(false);
    await expect(verifyPassword('correct horse battery staple', `${hash}:extra`)).resolves.toBe(false);
    await expect(verifyPassword('correct horse battery staple', 'scrypt:salt:not-hex')).resolves.toBe(false);
    const [scheme, salt, digest] = hash.split(':');
    await expect(verifyPassword('correct horse battery staple', `${scheme}:${salt}:${digest}a`)).resolves.toBe(false);
    await expect(verifyPassword('correct horse battery staple', `${scheme}:bad-salt:${digest}`)).resolves.toBe(false);
  });

  it('hashes opaque tokens before persistence', () => {
    const token = createSessionToken();
    expect(token).toHaveLength(48);
    expect(hashToken(token)).toMatch(/^[a-f0-9]{64}$/);
  });
});
