import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createSessionToken, hashPassword, hashToken, verifyPassword } from '../packages/db/src/auth.js';
import { JsonStore } from '../packages/db/src/store.js';

describe('JsonStore auth and organization methods', () => {
  it('creates a user, organization, membership, session and reset token', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'testhub-auth-store-'));
    const store = new JsonStore(root);

    const user = store.createUser({ email: 'qa@example.com', name: 'QA', passwordHash: 'hash' });
    const organization = store.createOrganization({ name: 'QA Team' });
    const symbolOrganization = store.createOrganization({ name: '!!!' });
    const membership = store.createMembership({ userId: user.id, organizationId: organization.id, role: 'admin' });
    const session = store.createSession({ userId: user.id, organizationId: organization.id, tokenHash: 'token-hash', expiresAt: '2099-01-01T00:00:00.000Z' });
    const reset = store.createPasswordResetToken({ userId: user.id, tokenHash: 'reset-hash', expiresAt: '2099-01-01T00:00:00.000Z' });

    expect(store.findUserByEmail('QA@EXAMPLE.COM')).toMatchObject({ id: user.id, email: 'qa@example.com' });
    expect(symbolOrganization.slug).toBe('team');
    expect(store.listMembershipsForUser(user.id)).toEqual([expect.objectContaining({ id: membership.id, role: 'admin' })]);
    expect(store.findSessionByTokenHash('token-hash')).toMatchObject({ id: session.id, organizationId: organization.id });
    expect(store.findPasswordResetByTokenHash('reset-hash')).toMatchObject({ id: reset.id, usedAt: undefined });
    expect(store.deleteSessionsForUser(user.id)).toBe(1);
    expect(store.findSessionByTokenHash('token-hash')).toBeUndefined();

    const used = store.markPasswordResetUsed(reset.id);
    expect(used?.usedAt).toBeTruthy();
    expect(store.findPasswordResetByTokenHash('reset-hash')).toBeUndefined();

    const usedAgain = store.markPasswordResetUsed(reset.id);
    expect(usedAgain).toBeUndefined();
  });

  it('creates reusable personal access tokens and revokes them', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'testhub-auth-pat-'));
    const store = new JsonStore(root);
    const user = store.createUser({ email: 'pat-store@example.com', name: 'PAT', passwordHash: 'hash' });
    const organization = store.createOrganization({ name: 'PAT Store' });
    const token = store.createPersonalAccessToken({
      userId: user.id,
      name: 'mcp',
      tokenHash: hashToken('th_pat_secret'),
      token: 'th_pat_secret',
      organizationIds: [organization.id],
      defaultOrganizationId: organization.id,
    });

    expect(token.token).toBe('th_pat_secret');
    expect(token.tokenPreview).toContain('...');
    expect(store.read().personalAccessTokens[0].token).not.toBe('th_pat_secret');
    expect(store.listPersonalAccessTokensForUser(user.id)).toEqual([expect.objectContaining({ id: token.id, token: 'th_pat_secret' })]);
    expect(store.findPersonalAccessTokenByHash(hashToken('th_pat_secret'))).toMatchObject({ id: token.id, defaultOrganizationId: organization.id });
    expect(store.touchPersonalAccessToken(token.id)?.lastUsedAt).toBeTruthy();
    expect(store.revokePersonalAccessToken(user.id, token.id)).toBe(true);
    expect(store.findPersonalAccessTokenByHash(hashToken('th_pat_secret'))).toBeUndefined();
  });

  it('scopes AI connections to an organization', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'testhub-auth-ai-'));
    const store = new JsonStore(root);
    const orgA = store.createOrganization({ name: 'Team A' });
    const orgB = store.createOrganization({ name: 'Team B' });

    const connectionA = store.upsertAiConnection({
      organizationId: orgA.id,
      name: 'Org A AI',
      provider: 'openai',
      apiKey: 'sk-a',
      model: 'gpt-4o-mini',
      enabled: true,
    });
    store.upsertAiConnection({
      organizationId: orgB.id,
      name: 'Org B AI',
      provider: 'openai',
      apiKey: 'sk-b',
      model: 'gpt-4o-mini',
      enabled: true,
    });

    expect(store.listAiConnectionsForOrganization(orgA.id)).toEqual([expect.objectContaining({ id: connectionA.id, organizationId: orgA.id, apiKey: '[REDACTED]' })]);
    expect(store.getAiConnection(orgA.id, connectionA.id)).toMatchObject({ id: connectionA.id, organizationId: orgA.id, apiKey: 'sk-a' });
    expect(store.getAiConnection(orgB.id, connectionA.id)).toBeUndefined();
  });

  it('scopes projects to an organization', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'testhub-auth-projects-'));
    const store = new JsonStore(root);
    const orgA = store.createOrganization({ name: 'Team A' });
    const orgB = store.createOrganization({ name: 'Team B' });

    const projectA = store.createProject({ organizationId: orgA.id, name: 'CRM' });
    store.createProject({ organizationId: orgB.id, name: 'ERP' });

    expect(store.listProjectsForOrganization(orgA.id)).toEqual([expect.objectContaining({ id: projectA.id, organizationId: orgA.id })]);
    expect(store.listProjectsForOrganization(orgB.id)).toHaveLength(1);
  });

  it('backfills legacy projects into the local organization', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'testhub-auth-legacy-projects-'));
    fs.writeFileSync(path.join(root, 'db.json'), JSON.stringify({
      projects: [{
        id: 'legacy-project',
        name: 'Legacy CRM',
        status: 'active',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      }],
      environments: [],
      suites: [],
      runs: [],
      aiConnections: [],
    }), 'utf8');
    const store = new JsonStore(root);

    expect(store.read().projects).toEqual([expect.objectContaining({ id: 'legacy-project', organizationId: 'legacy-local' })]);
    expect(store.listProjectsForOrganization('legacy-local')).toEqual([expect.objectContaining({ id: 'legacy-project', organizationId: 'legacy-local' })]);
  });

  it('ignores expired sessions and reset tokens', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'testhub-auth-expired-'));
    const store = new JsonStore(root);
    const user = store.createUser({ email: 'expired@example.com', passwordHash: 'hash' });
    const organization = store.createOrganization({ name: 'Expired Team' });
    const session = store.createSession({ userId: user.id, organizationId: organization.id, tokenHash: 'expired-token', expiresAt: '2000-01-01T00:00:00.000Z' });
    const reset = store.createPasswordResetToken({ userId: user.id, tokenHash: 'expired-reset', expiresAt: '2000-01-01T00:00:00.000Z' });

    expect(store.findSessionByTokenHash(session.tokenHash)).toBeUndefined();
    expect(store.findPasswordResetByTokenHash(reset.tokenHash)).toBeUndefined();
    expect(store.markPasswordResetUsed(reset.id)).toBeUndefined();
    expect(store.read().passwordResetTokens[0].usedAt).toBeUndefined();
  });
});

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
