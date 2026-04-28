import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
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

    const used = store.markPasswordResetUsed(reset.id);
    expect(used?.usedAt).toBeTruthy();
    expect(store.findPasswordResetByTokenHash('reset-hash')).toBeUndefined();

    const usedAgain = store.markPasswordResetUsed(reset.id);
    expect(usedAgain?.usedAt).toBe(used?.usedAt);
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
