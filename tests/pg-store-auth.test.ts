import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PgStore } from '../packages/db/src/pg-store.js';

const { Pool } = pg;
const pgTestDatabaseUrl = process.env.TESTHUB_PG_TEST_DATABASE_URL;

if (!pgTestDatabaseUrl) {
  describe.skip('PgStore auth integration', () => {
    it('skips because TESTHUB_PG_TEST_DATABASE_URL is not set', () => {
      expect(pgTestDatabaseUrl).toBeUndefined();
    });
  });
} else {
  describe('PgStore auth integration', () => {
    let pool: pg.Pool;
    let store: PgStore;
    let originalDatabaseUrl: string | undefined;

    beforeAll(async () => {
      originalDatabaseUrl = process.env.DATABASE_URL;
      process.env.DATABASE_URL = pgTestDatabaseUrl;
      await import('../packages/db/src/migrate.js');

      pool = new Pool({ connectionString: pgTestDatabaseUrl });
      await cleanupTables(pool);

      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'testhub-pg-auth-'));
      store = new PgStore(pgTestDatabaseUrl, root);
    });

    afterAll(async () => {
      if (pool) await cleanupTables(pool);
      await store?.close();
      await pool?.end();
      if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = originalDatabaseUrl;
    });

    it('matches auth, organization, session, reset, and project behavior', async () => {
      const user = await store.createUser({ email: 'QA@Example.COM', name: 'QA', passwordHash: 'hash' });
      await expect(store.createUser({ email: 'qa@example.com', passwordHash: 'other' })).rejects.toThrow('Email ja cadastrado');

      const organization = await store.createOrganization({ name: 'QA Team' });
      const duplicateOrganization = await store.createOrganization({ name: 'QA Team' });
      const symbolOrganization = await store.createOrganization({ name: '!!!' });
      const membership = await store.createMembership({ userId: user.id, organizationId: organization.id, role: 'admin' });
      const duplicateMembership = await store.createMembership({ userId: user.id, organizationId: organization.id, role: 'viewer' });
      const session = await store.createSession({ userId: user.id, organizationId: organization.id, tokenHash: 'token-hash', expiresAt: '2099-01-01T00:00:00.000Z' });
      const reset = await store.createPasswordResetToken({ userId: user.id, tokenHash: 'reset-hash', expiresAt: '2099-01-01T00:00:00.000Z' });
      const project = await store.createProject({ organizationId: organization.id, name: 'CRM' });
      await store.createProject({ organizationId: duplicateOrganization.id, name: 'ERP' });

      expect(await store.findUserByEmail('qa@example.com')).toMatchObject({ id: user.id, email: 'qa@example.com' });
      expect(await store.findUserById(user.id)).toMatchObject({ id: user.id });
      expect(duplicateOrganization.slug).toBe('qa-team-2');
      expect(symbolOrganization.slug).toBe('team');
      expect(await store.listOrganizationsForUser(user.id)).toEqual([expect.objectContaining({ id: organization.id })]);
      expect(duplicateMembership).toEqual(membership);
      expect(await store.listMembershipsForUser(user.id)).toEqual([expect.objectContaining({ id: membership.id, role: 'admin' })]);
      expect(await store.listMembershipsForOrganization(organization.id)).toEqual([expect.objectContaining({ id: membership.id })]);
      expect(await store.findSessionByTokenHash('token-hash')).toMatchObject({ id: session.id, organizationId: organization.id });
      expect(await store.deleteSessionsForUser(user.id)).toBe(1);
      expect(await store.findSessionByTokenHash('token-hash')).toBeUndefined();
      const newSession = await store.createSession({ userId: user.id, organizationId: organization.id, tokenHash: 'token-hash-2', expiresAt: '2099-01-01T00:00:00.000Z' });
      expect(await store.findSessionByTokenHash(newSession.tokenHash)).toMatchObject({ id: newSession.id });
      await expect(store.createSession({ userId: user.id, organizationId: organization.id, tokenHash: 'token-hash-2', expiresAt: '2099-01-01T00:00:00.000Z' })).rejects.toThrow('Sessao ja cadastrada');
      expect(await store.findPasswordResetByTokenHash('reset-hash')).toMatchObject({ id: reset.id, usedAt: undefined });
      await expect(store.createPasswordResetToken({ userId: user.id, tokenHash: 'reset-hash', expiresAt: '2099-01-01T00:00:00.000Z' })).rejects.toThrow('Token de reset ja cadastrado');

      const used = await store.markPasswordResetUsed(reset.id);
      expect(used?.usedAt).toBeTruthy();
      expect(await store.findPasswordResetByTokenHash('reset-hash')).toBeUndefined();
      expect(await store.markPasswordResetUsed(reset.id)).toBeUndefined();
      expect(await store.listProjectsForOrganization(organization.id)).toEqual([expect.objectContaining({ id: project.id, organizationId: organization.id })]);

      const aiA = await store.upsertAiConnection({ organizationId: organization.id, name: 'Org A AI', provider: 'openai', apiKey: 'sk-a', model: 'gpt-4o-mini', enabled: true });
      await store.upsertAiConnection({ organizationId: duplicateOrganization.id, name: 'Org B AI', provider: 'openai', apiKey: 'sk-b', model: 'gpt-4o-mini', enabled: true });
      expect(await store.listAiConnectionsForOrganization(organization.id)).toEqual([expect.objectContaining({ id: aiA.id, organizationId: organization.id, apiKey: '[REDACTED]' })]);
      expect(await store.getAiConnection(organization.id, aiA.id)).toMatchObject({ id: aiA.id, organizationId: organization.id, apiKey: 'sk-a' });
      expect(await store.getAiConnection(duplicateOrganization.id, aiA.id)).toBeUndefined();
    });

    it('ignores expired sessions and reset tokens', async () => {
      const user = await store.createUser({ email: 'expired@example.com', passwordHash: 'hash' });
      const organization = await store.createOrganization({ name: 'Expired Team' });
      const session = await store.createSession({ userId: user.id, organizationId: organization.id, tokenHash: 'expired-token', expiresAt: '2000-01-01T00:00:00.000Z' });
      const reset = await store.createPasswordResetToken({ userId: user.id, tokenHash: 'expired-reset', expiresAt: '2000-01-01T00:00:00.000Z' });

      expect(await store.findSessionByTokenHash(session.tokenHash)).toBeUndefined();
      expect(await store.findPasswordResetByTokenHash(reset.tokenHash)).toBeUndefined();
      expect(await store.markPasswordResetUsed(reset.id)).toBeUndefined();
      expect((await store.read()).passwordResetTokens.find((item) => item.id === reset.id)?.usedAt).toBeUndefined();
    });
  });
}

async function cleanupTables(pool: pg.Pool): Promise<void> {
  await pool.query('delete from password_reset_tokens');
  await pool.query('delete from auth_sessions');
  await pool.query('delete from organization_memberships');
  await pool.query('delete from users');
  await pool.query('delete from organizations');
  await pool.query('delete from projects');
}
