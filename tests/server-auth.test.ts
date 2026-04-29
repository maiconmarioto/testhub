import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../apps/api/src/server.js';

const originalDataDir = process.env.TESTHUB_DATA_DIR;
const originalAuthMode = process.env.TESTHUB_AUTH_MODE;
const originalNodeEnv = process.env.NODE_ENV;
const originalAllowPublicSignup = process.env.TESTHUB_ALLOW_PUBLIC_SIGNUP;
const originalWebUrl = process.env.TESTHUB_WEB_URL;
const originalCorsOrigins = process.env.TESTHUB_CORS_ORIGINS;
const apps: ReturnType<typeof createApp>[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  restoreEnv();
});

describe('server local auth', () => {
  it('allows credentialed browser auth CORS preflight', async () => {
    process.env.TESTHUB_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'testhub-server-cors-'));
    process.env.TESTHUB_AUTH_MODE = 'local';
    process.env.TESTHUB_CORS_ORIGINS = 'http://allowed.example';
    const app = createApp();
    apps.push(app);
    await app.ready();

    const preflight = await app.inject({
      method: 'OPTIONS',
      url: '/api/auth/login',
      headers: {
        origin: 'http://localhost:3334',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type',
      },
    });

    expect(preflight.statusCode).toBe(204);
    expect(preflight.headers['access-control-allow-origin']).toBe('http://localhost:3334');
    expect(preflight.headers['access-control-allow-credentials']).toBe('true');

    const configured = await app.inject({
      method: 'OPTIONS',
      url: '/api/auth/login',
      headers: {
        origin: 'http://allowed.example',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type',
      },
    });
    expect(configured.headers['access-control-allow-origin']).toBe('http://allowed.example');

    const blocked = await app.inject({
      method: 'OPTIONS',
      url: '/api/auth/login',
      headers: {
        origin: 'https://evil.example',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type',
      },
    });
    expect(blocked.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('registers, logs in, reads current user and logs out', async () => {
    process.env.TESTHUB_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'testhub-server-auth-'));
    process.env.TESTHUB_AUTH_MODE = 'local';
    process.env.NODE_ENV = 'test';
    const app = createApp();
    apps.push(app);
    await app.ready();

    const setupRequired = await app.inject({ method: 'GET', url: '/api/projects' });
    expect(setupRequired.statusCode).toBe(401);
    expect(setupRequired.json()).toMatchObject({ error: 'SetupRequired', setupRequired: true });

    const register = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        email: 'Owner@Example.com',
        name: 'Owner',
        password: 'correct-horse',
        organizationName: 'QA Team',
      },
    });
    expect(register.statusCode).toBe(201);
    expect(register.cookies.find((item) => item.name === 'testhub_session')).toMatchObject({ httpOnly: true });
    const registered = register.json() as {
      user: { id: string; email: string; passwordHash?: string };
      organization: { id: string; name: string };
      membership: { role: string };
      token: string;
    };
    expect(registered.user).toMatchObject({ email: 'owner@example.com' });
    expect(registered.user.passwordHash).toBeUndefined();
    expect(registered.organization).toMatchObject({ name: 'QA Team' });
    expect(registered.membership).toMatchObject({ role: 'admin' });
    expect(registered.token).toEqual(expect.any(String));

    process.env.TESTHUB_ALLOW_PUBLIC_SIGNUP = 'true';
    const duplicate = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        email: 'owner@example.com',
        password: 'correct-horse',
        organizationName: 'Duplicate Team',
      },
    });
    expect(duplicate.statusCode).toBe(409);
    process.env.TESTHUB_ALLOW_PUBLIC_SIGNUP = 'false';

    const duplicateWithoutSignup = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        email: 'owner@example.com',
        password: 'correct-horse',
        organizationName: 'Duplicate Team',
      },
    });
    expect(duplicateWithoutSignup.statusCode).toBe(403);

    const publicSignup = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        email: 'teammate@example.com',
        password: 'correct-horse',
        organizationName: 'Second Team',
      },
    });
    expect(publicSignup.statusCode).toBe(403);
    expect(publicSignup.json()).toMatchObject({ error: 'Cadastro público desabilitado' });

    const meWithBearer = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { authorization: `Bearer ${registered.token}` },
    });
    expect(meWithBearer.statusCode).toBe(200);
    expect(meWithBearer.json()).toMatchObject({
      user: { id: registered.user.id, email: 'owner@example.com' },
      organization: { id: registered.organization.id },
      membership: { role: 'admin' },
      organizations: [expect.objectContaining({ id: registered.organization.id })],
    });

    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'OWNER@example.com', password: 'correct-horse' },
    });
    expect(login.statusCode).toBe(200);
    const loggedIn = login.json() as { token: string; user: { passwordHash?: string }; membership: { organizationId: string } };
    expect(loggedIn.user.passwordHash).toBeUndefined();
    expect(loggedIn.membership.organizationId).toBe(registered.organization.id);

    const meWithCookie = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      cookies: { testhub_session: loggedIn.token },
    });
    expect(meWithCookie.statusCode).toBe(200);
    expect(meWithCookie.json()).toMatchObject({ user: { email: 'owner@example.com' } });

    const logout = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { authorization: `Bearer ${loggedIn.token}` },
    });
    expect(logout.statusCode).toBe(204);
    expect(logout.cookies.find((item) => item.name === 'testhub_session')?.value).toBe('');

    const staleLogout = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      cookies: { testhub_session: 'stale-token' },
    });
    expect(staleLogout.statusCode).toBe(204);
    expect(staleLogout.cookies.find((item) => item.name === 'testhub_session')?.value).toBe('');

    const afterLogout = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { authorization: `Bearer ${loggedIn.token}` },
    });
    expect(afterLogout.statusCode).toBe(401);
  });

  it('does not reveal unknown email on password reset request', async () => {
    process.env.TESTHUB_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'testhub-server-reset-'));
    process.env.TESTHUB_AUTH_MODE = 'local';
    process.env.NODE_ENV = 'test';
    const app = createApp();
    apps.push(app);
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/password-reset/request',
      payload: { email: 'missing@example.com' },
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({});
  });

  it('lets an admin create an editor member with a temporary password', async () => {
    process.env.TESTHUB_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'testhub-server-members-'));
    process.env.TESTHUB_AUTH_MODE = 'local';
    process.env.NODE_ENV = 'test';
    const app = createApp();
    apps.push(app);
    await app.ready();

    const register = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        email: 'admin@example.com',
        password: 'correct-horse',
        organizationName: 'Member Team',
      },
    });
    expect(register.statusCode).toBe(201);
    const admin = register.json() as { token: string; organization: { id: string } };

    const createMember = await app.inject({
      method: 'POST',
      url: '/api/organizations/current/members',
      headers: { authorization: `Bearer ${admin.token}` },
      payload: {
        email: 'Editor@Example.com',
        name: 'Editor',
        role: 'editor',
        temporaryPassword: 'temporary-password',
      },
    });
    expect(createMember.statusCode).toBe(201);
    const member = createMember.json() as {
      user: { id: string; email: string; passwordHash?: string };
      membership: { organizationId: string; role: string };
      temporaryPassword?: string;
    };
    expect(member.user).toMatchObject({ email: 'editor@example.com' });
    expect(member.user.passwordHash).toBeUndefined();
    expect(member.membership).toMatchObject({ organizationId: admin.organization.id, role: 'editor' });
    expect(member.temporaryPassword).toBeUndefined();

    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'editor@example.com', password: 'temporary-password' },
    });
    expect(login.statusCode).toBe(200);
    expect(login.json()).toMatchObject({
      user: { id: member.user.id, email: 'editor@example.com' },
      membership: { organizationId: admin.organization.id, role: 'editor' },
    });
    expect((login.json() as { user: { passwordHash?: string } }).user.passwordHash).toBeUndefined();

    const duplicateMember = await app.inject({
      method: 'POST',
      url: '/api/organizations/current/members',
      headers: { authorization: `Bearer ${admin.token}` },
      payload: {
        email: 'EDITOR@example.com',
        role: 'admin',
        temporaryPassword: 'different-password',
      },
    });
    expect(duplicateMember.statusCode).toBe(409);
    expect(duplicateMember.json()).toEqual({ error: 'Usuário já existe; troca de organização ainda não suportada' });

    const originalPasswordLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'editor@example.com', password: 'temporary-password' },
    });
    expect(originalPasswordLogin.statusCode).toBe(200);
    expect(originalPasswordLogin.json()).toMatchObject({
      membership: { organizationId: admin.organization.id, role: 'editor' },
    });

    const changedPasswordLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'editor@example.com', password: 'different-password' },
    });
    expect(changedPasswordLogin.statusCode).toBe(401);
  });

  it('forbids a viewer from creating organization members', async () => {
    process.env.TESTHUB_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'testhub-server-members-viewer-'));
    process.env.TESTHUB_AUTH_MODE = 'local';
    process.env.NODE_ENV = 'test';
    const app = createApp();
    apps.push(app);
    await app.ready();

    const register = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        email: 'viewer-admin@example.com',
        password: 'correct-horse',
        organizationName: 'Viewer Team',
      },
    });
    expect(register.statusCode).toBe(201);
    const admin = register.json() as { token: string };

    const createViewer = await app.inject({
      method: 'POST',
      url: '/api/organizations/current/members',
      headers: { authorization: `Bearer ${admin.token}` },
      payload: {
        email: 'viewer@example.com',
        role: 'viewer',
        temporaryPassword: 'viewer-password',
      },
    });
    expect(createViewer.statusCode).toBe(201);

    const loginViewer = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'viewer@example.com', password: 'viewer-password' },
    });
    expect(loginViewer.statusCode).toBe(200);
    const viewer = loginViewer.json() as { token: string };

    const blocked = await app.inject({
      method: 'POST',
      url: '/api/organizations/current/members',
      headers: { authorization: `Bearer ${viewer.token}` },
      payload: {
        email: 'blocked@example.com',
        role: 'editor',
        temporaryPassword: 'blocked-password',
      },
    });
    expect(blocked.statusCode).toBe(403);
  });

  it('lists only members in the current organization', async () => {
    process.env.TESTHUB_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'testhub-server-members-list-'));
    process.env.TESTHUB_AUTH_MODE = 'local';
    process.env.NODE_ENV = 'test';
    process.env.TESTHUB_ALLOW_PUBLIC_SIGNUP = 'true';
    const app = createApp();
    apps.push(app);
    await app.ready();

    const registerA = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        email: 'org-a-admin@example.com',
        password: 'correct-horse',
        organizationName: 'Org A',
      },
    });
    expect(registerA.statusCode).toBe(201);
    const orgA = registerA.json() as { token: string };

    const registerB = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        email: 'org-b-admin@example.com',
        password: 'correct-horse',
        organizationName: 'Org B',
      },
    });
    expect(registerB.statusCode).toBe(201);

    const createMember = await app.inject({
      method: 'POST',
      url: '/api/organizations/current/members',
      headers: { authorization: `Bearer ${orgA.token}` },
      payload: {
        email: 'org-a-editor@example.com',
        role: 'editor',
      },
    });
    expect(createMember.statusCode).toBe(201);
    const created = createMember.json() as { temporaryPassword?: string; user: { passwordHash?: string } };
    expect(created.temporaryPassword).toEqual(expect.any(String));
    expect(created.temporaryPassword?.length).toBeGreaterThanOrEqual(8);
    expect(created.user.passwordHash).toBeUndefined();

    const members = await app.inject({
      method: 'GET',
      url: '/api/organizations/current/members',
      headers: { authorization: `Bearer ${orgA.token}` },
    });
    expect(members.statusCode).toBe(200);
    const emails = (members.json() as Array<{ user: { email: string; passwordHash?: string } }>).map((member) => member.user.email).sort();
    expect(emails).toEqual(['org-a-admin@example.com', 'org-a-editor@example.com']);
    expect(emails).not.toContain('org-b-admin@example.com');
    expect((members.json() as Array<{ user: { passwordHash?: string } }>).every((member) => member.user.passwordHash === undefined)).toBe(true);
  });

  it('supports organization selection at signup and organization switching', async () => {
    process.env.TESTHUB_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'testhub-server-org-select-'));
    process.env.TESTHUB_AUTH_MODE = 'local';
    process.env.NODE_ENV = 'test';
    process.env.TESTHUB_ALLOW_PUBLIC_SIGNUP = 'true';
    const app = createApp();
    apps.push(app);
    await app.ready();

    const ownerRegister = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        email: 'owner-select@example.com',
        password: 'correct-horse',
        organizationName: 'Prime Org',
      },
    });
    expect(ownerRegister.statusCode).toBe(201);
    const owner = ownerRegister.json() as { token: string; organization: { id: string } };

    const secondOrgResponse = await app.inject({
      method: 'POST',
      url: '/api/organizations',
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { name: 'Second Org' },
    });
    expect(secondOrgResponse.statusCode).toBe(201);
    const secondOrg = secondOrgResponse.json() as { id: string; name: string };

    const publicOrganizations = await app.inject({ method: 'GET', url: '/api/auth/organizations' });
    expect(publicOrganizations.statusCode).toBe(200);
    expect(publicOrganizations.json()).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: owner.organization.id, name: 'Prime Org' }),
      expect.objectContaining({ id: secondOrg.id, name: 'Second Org' }),
    ]));

    const teammateRegister = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        email: 'teammate-select@example.com',
        name: 'Teammate',
        password: 'correct-horse',
        organizationIds: [owner.organization.id, secondOrg.id],
      },
    });
    expect(teammateRegister.statusCode).toBe(201);
    expect(teammateRegister.json()).toMatchObject({
      membership: { organizationId: owner.organization.id, role: 'viewer' },
      organizations: [
        expect.objectContaining({ id: owner.organization.id }),
        expect.objectContaining({ id: secondOrg.id }),
      ],
    });

    const teammate = teammateRegister.json() as { token: string };
    const switchResponse = await app.inject({
      method: 'POST',
      url: '/api/auth/switch-organization',
      headers: { authorization: `Bearer ${teammate.token}` },
      payload: { organizationId: secondOrg.id },
    });
    expect(switchResponse.statusCode).toBe(200);
    const switched = switchResponse.json() as { token: string; organization: { id: string }; membership: { role: string } };
    expect(switched.organization.id).toBe(secondOrg.id);
    expect(switched.membership.role).toBe('viewer');
    expect(switched.token).toEqual(expect.any(String));

    const me = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { authorization: `Bearer ${switched.token}` },
    });
    expect(me.statusCode).toBe(200);
    expect(me.json()).toMatchObject({ organization: { id: secondOrg.id } });
  });

  it('lets admins manage user organization memberships', async () => {
    process.env.TESTHUB_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'testhub-server-user-management-'));
    process.env.TESTHUB_AUTH_MODE = 'local';
    process.env.NODE_ENV = 'test';
    const app = createApp();
    apps.push(app);
    await app.ready();

    const register = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        email: 'admin-users@example.com',
        password: 'correct-horse',
        organizationName: 'Admin Org',
      },
    });
    expect(register.statusCode).toBe(201);
    const admin = register.json() as { token: string; organization: { id: string } };

    const createdOrg = await app.inject({
      method: 'POST',
      url: '/api/organizations',
      headers: { authorization: `Bearer ${admin.token}` },
      payload: { name: 'Managed Org' },
    });
    expect(createdOrg.statusCode).toBe(201);
    const managedOrg = createdOrg.json() as { id: string };

    const createMember = await app.inject({
      method: 'POST',
      url: '/api/organizations/current/members',
      headers: { authorization: `Bearer ${admin.token}` },
      payload: {
        email: 'managed@example.com',
        name: 'Managed',
        role: 'viewer',
        temporaryPassword: 'temporary-password',
      },
    });
    expect(createMember.statusCode).toBe(201);
    const member = createMember.json() as { user: { id: string } };

    const usersBefore = await app.inject({
      method: 'GET',
      url: '/api/users',
      headers: { authorization: `Bearer ${admin.token}` },
    });
    expect(usersBefore.statusCode).toBe(200);
    expect(usersBefore.json()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        user: expect.objectContaining({ email: 'managed@example.com' }),
        organizations: [expect.objectContaining({ id: admin.organization.id })],
      }),
    ]));

    const updateMemberships = await app.inject({
      method: 'PATCH',
      url: `/api/users/${member.user.id}/memberships`,
      headers: { authorization: `Bearer ${admin.token}` },
      payload: {
        memberships: [
          { organizationId: managedOrg.id, role: 'editor' },
        ],
      },
    });
    expect(updateMemberships.statusCode).toBe(200);
    expect(updateMemberships.json()).toMatchObject({
      user: { id: member.user.id, email: 'managed@example.com' },
      memberships: [expect.objectContaining({ organizationId: managedOrg.id, role: 'editor' })],
      organizations: [expect.objectContaining({ id: managedOrg.id })],
    });

    const loginMember = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'managed@example.com', password: 'temporary-password' },
    });
    expect(loginMember.statusCode).toBe(200);
    expect(loginMember.json()).toMatchObject({ membership: { organizationId: managedOrg.id, role: 'editor' } });
  });

  it('lets the current user update profile and password with current password', async () => {
    process.env.TESTHUB_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'testhub-server-profile-'));
    process.env.TESTHUB_AUTH_MODE = 'local';
    process.env.NODE_ENV = 'test';
    const app = createApp();
    apps.push(app);
    await app.ready();

    const register = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        email: 'profile@example.com',
        name: 'Profile',
        password: 'correct-horse',
        organizationName: 'Profile Org',
      },
    });
    expect(register.statusCode).toBe(201);
    const session = register.json() as { token: string };

    const wrongPassword = await app.inject({
      method: 'PUT',
      url: '/api/users/me',
      headers: { authorization: `Bearer ${session.token}` },
      payload: {
        name: 'Profile Updated',
        currentPassword: 'wrong-password',
        newPassword: 'new-password-1',
      },
    });
    expect(wrongPassword.statusCode).toBe(401);

    const update = await app.inject({
      method: 'PUT',
      url: '/api/users/me',
      headers: { authorization: `Bearer ${session.token}` },
      payload: {
        email: 'profile-updated@example.com',
        name: 'Profile Updated',
        currentPassword: 'correct-horse',
        newPassword: 'new-password-1',
      },
    });
    expect(update.statusCode).toBe(200);
    expect(update.json()).toMatchObject({ user: { email: 'profile-updated@example.com', name: 'Profile Updated' } });
    expect((update.json() as { user: { passwordHash?: string } }).user.passwordHash).toBeUndefined();

    const oldLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'profile@example.com', password: 'correct-horse' },
    });
    expect(oldLogin.statusCode).toBe(401);

    const newLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'profile-updated@example.com', password: 'new-password-1' },
    });
    expect(newLogin.statusCode).toBe(200);
  });

  it('creates reusable personal access tokens for MCP scoped by organization', async () => {
    process.env.TESTHUB_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'testhub-server-pat-'));
    process.env.TESTHUB_AUTH_MODE = 'local';
    process.env.NODE_ENV = 'test';
    const app = createApp();
    apps.push(app);
    await app.ready();

    const register = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        email: 'pat@example.com',
        password: 'correct-horse',
        organizationName: 'PAT Org A',
      },
    });
    expect(register.statusCode).toBe(201);
    const owner = register.json() as { token: string; organization: { id: string } };

    const orgBResponse = await app.inject({
      method: 'POST',
      url: '/api/organizations',
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { name: 'PAT Org B' },
    });
    expect(orgBResponse.statusCode).toBe(201);
    const orgB = orgBResponse.json() as { id: string };

    const updateMemberships = await app.inject({
      method: 'PATCH',
      url: `/api/users/${(register.json() as { user: { id: string } }).user.id}/memberships`,
      headers: { authorization: `Bearer ${owner.token}` },
      payload: {
        memberships: [
          { organizationId: owner.organization.id, role: 'admin' },
          { organizationId: orgB.id, role: 'admin' },
        ],
      },
    });
    expect(updateMemberships.statusCode).toBe(200);

    const createAllToken = await app.inject({
      method: 'POST',
      url: '/api/users/me/tokens',
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { name: 'mcp-all', defaultOrganizationId: owner.organization.id },
    });
    expect(createAllToken.statusCode).toBe(201);
    const allToken = createAllToken.json() as { id: string; token: string; tokenHash?: string; tokenMasked: string; organizationIds?: string[] };
    expect(allToken.token).toMatch(/^th_pat_/);
    expect(allToken.tokenHash).toBeUndefined();
    expect(allToken.tokenMasked).toEqual(expect.stringContaining('...'));
    expect(allToken.organizationIds).toBeUndefined();

    const listed = await app.inject({
      method: 'GET',
      url: '/api/users/me/tokens',
      headers: { authorization: `Bearer ${owner.token}` },
    });
    expect(listed.statusCode).toBe(200);
    expect(listed.json()).toEqual([expect.objectContaining({ id: allToken.id, token: allToken.token })]);

    const projectB = await app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: {
        authorization: `Bearer ${allToken.token}`,
        'x-testhub-organization-id': orgB.id,
      },
      payload: { name: 'Project via PAT' },
    });
    expect(projectB.statusCode).toBe(201);
    expect(projectB.json()).toMatchObject({ organizationId: orgB.id });

    const scopedTokenResponse = await app.inject({
      method: 'POST',
      url: '/api/users/me/tokens',
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { name: 'mcp-org-a', organizationIds: [owner.organization.id], defaultOrganizationId: owner.organization.id },
    });
    expect(scopedTokenResponse.statusCode).toBe(201);
    const scopedToken = scopedTokenResponse.json() as { id: string; token: string; organizationIds: string[] };
    expect(scopedToken.organizationIds).toEqual([owner.organization.id]);

    const scopedProject = await app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: {
        authorization: `Bearer ${scopedToken.token}`,
        'x-testhub-organization-id': orgB.id,
      },
      payload: { name: 'Should land in Org A' },
    });
    expect(scopedProject.statusCode).toBe(201);
    expect(scopedProject.json()).toMatchObject({ organizationId: owner.organization.id });

    const revoke = await app.inject({
      method: 'DELETE',
      url: `/api/users/me/tokens/${scopedToken.id}`,
      headers: { authorization: `Bearer ${owner.token}` },
    });
    expect(revoke.statusCode).toBe(204);

    const afterRevoke = await app.inject({
      method: 'GET',
      url: '/api/projects',
      headers: { authorization: `Bearer ${scopedToken.token}` },
    });
    expect(afterRevoke.statusCode).toBe(401);
  });

  it('manages reusable flow library by organization and validates suites using it', async () => {
    process.env.TESTHUB_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'testhub-server-flows-'));
    process.env.TESTHUB_AUTH_MODE = 'local';
    process.env.NODE_ENV = 'test';
    process.env.TESTHUB_ALLOW_PUBLIC_SIGNUP = 'true';
    const app = createApp();
    apps.push(app);
    await app.ready();

    const registerA = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        email: 'flows-a@example.com',
        password: 'correct-horse',
        organizationName: 'Flows Org A',
      },
    });
    expect(registerA.statusCode).toBe(201);
    const orgA = registerA.json() as { token: string; organization: { id: string } };

    const registerB = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        email: 'flows-b@example.com',
        password: 'correct-horse',
        organizationName: 'Flows Org B',
      },
    });
    expect(registerB.statusCode).toBe(201);
    const orgB = registerB.json() as { token: string };

    const authA = { authorization: `Bearer ${orgA.token}` };
    const authB = { authorization: `Bearer ${orgB.token}` };

    const createdFlow = await app.inject({
      method: 'POST',
      url: '/api/flows',
      headers: authA,
      payload: {
        namespace: 'auth',
        name: 'login',
        description: 'Login compartilhado',
        params: { email: '${USER_EMAIL}', password: '${USER_PASSWORD}' },
        steps: [
          { goto: '/login' },
          { fill: { by: 'label', target: 'Email', value: '${email}' } },
        ],
      },
    });
    expect(createdFlow.statusCode).toBe(201);
    const flow = createdFlow.json() as { id: string; organizationId: string; namespace: string; name: string };
    expect(flow).toMatchObject({ organizationId: orgA.organization.id, namespace: 'auth', name: 'login' });

    const selfCycle = await app.inject({
      method: 'POST',
      url: '/api/flows',
      headers: authA,
      payload: {
        namespace: 'auth',
        name: 'self',
        steps: [{ use: 'auth.self' }],
      },
    });
    expect(selfCycle.statusCode).toBe(400);
    expect(selfCycle.json()).toMatchObject({ error: expect.stringContaining('ciclo em flows') });

    const specContent = [
      'version: 1',
      'type: web',
      'name: web-shared-flow',
      'tests:',
      '  - name: uses shared login',
      '    steps:',
      '      - use: auth.login',
      '        with:',
      '          email: qa@example.com',
      '      - expectText: Dashboard',
      '',
    ].join('\n');

    const validA = await app.inject({
      method: 'POST',
      url: '/api/spec/validate',
      headers: authA,
      payload: { specContent },
    });
    expect(validA.statusCode).toBe(200);
    expect(validA.json()).toMatchObject({ valid: true, type: 'web', tests: 1 });

    const invalidB = await app.inject({
      method: 'POST',
      url: '/api/spec/validate',
      headers: authB,
      payload: { specContent },
    });
    expect(invalidB.statusCode).toBe(400);
    expect(invalidB.json()).toMatchObject({ valid: false });

    const listB = await app.inject({ method: 'GET', url: '/api/flows', headers: authB });
    expect(listB.statusCode).toBe(200);
    expect(listB.json()).toEqual([]);

    const project = await app.inject({ method: 'POST', url: '/api/projects', headers: authA, payload: { name: 'Flow Project' } });
    expect(project.statusCode).toBe(201);
    const suite = await app.inject({
      method: 'POST',
      url: '/api/suites',
      headers: authA,
      payload: {
        projectId: (project.json() as { id: string }).id,
        name: 'uses flow',
        type: 'web',
        specContent,
      },
    });
    expect(suite.statusCode).toBe(201);

    const archive = await app.inject({ method: 'DELETE', url: `/api/flows/${flow.id}`, headers: authA });
    expect(archive.statusCode).toBe(204);

    const invalidAfterArchive = await app.inject({
      method: 'POST',
      url: '/api/spec/validate',
      headers: authA,
      payload: { specContent },
    });
    expect(invalidAfterArchive.statusCode).toBe(400);
    expect(invalidAfterArchive.json()).toMatchObject({ valid: false });
  });

  it('does not treat auth route prefixes as public', async () => {
    process.env.TESTHUB_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'testhub-server-prefix-'));
    process.env.TESTHUB_AUTH_MODE = 'local';
    process.env.NODE_ENV = 'test';
    const app = createApp();
    apps.push(app);
    await app.ready();

    const getResponse = await app.inject({ method: 'GET', url: '/api/auth/login-extra' });
    expect(getResponse.statusCode).toBe(401);

    const postResponse = await app.inject({ method: 'POST', url: '/api/auth/login-extra' });
    expect(postResponse.statusCode).toBe(401);
  });

  it('does not reuse password reset tokens', async () => {
    process.env.TESTHUB_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'testhub-server-reset-reuse-'));
    process.env.TESTHUB_AUTH_MODE = 'local';
    process.env.NODE_ENV = 'test';
    const app = createApp();
    apps.push(app);
    await app.ready();

    const register = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        email: 'reset@example.com',
        password: 'initial-password',
        organizationName: 'Reset Team',
      },
    });
    expect(register.statusCode).toBe(201);

    const request = await app.inject({
      method: 'POST',
      url: '/api/auth/password-reset/request',
      payload: { email: 'reset@example.com' },
    });
    expect(request.statusCode).toBe(202);
    const resetToken = (request.json() as { resetToken?: string }).resetToken;
    expect(resetToken).toEqual(expect.any(String));

    const confirm = await app.inject({
      method: 'POST',
      url: '/api/auth/password-reset/confirm',
      payload: { resetToken, password: 'new-password-1' },
    });
    expect(confirm.statusCode).toBe(204);

    const oldSession = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { authorization: `Bearer ${(register.json() as { token: string }).token}` },
    });
    expect(oldSession.statusCode).toBe(401);

    const reused = await app.inject({
      method: 'POST',
      url: '/api/auth/password-reset/confirm',
      payload: { resetToken, password: 'new-password-2' },
    });
    expect(reused.statusCode).toBe(400);

    const firstPasswordLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'reset@example.com', password: 'new-password-1' },
    });
    expect(firstPasswordLogin.statusCode).toBe(200);

    const secondPasswordLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'reset@example.com', password: 'new-password-2' },
    });
    expect(secondPasswordLogin.statusCode).toBe(401);
  });

  it('isolates projects and child resources by organization', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'testhub-server-org-scope-'));
    process.env.TESTHUB_DATA_DIR = dataDir;
    process.env.TESTHUB_AUTH_MODE = 'local';
    process.env.NODE_ENV = 'test';
    process.env.TESTHUB_ALLOW_PUBLIC_SIGNUP = 'true';
    const app = createApp();
    apps.push(app);
    await app.ready();

    const registerA = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        email: 'orga@example.com',
        password: 'correct-horse',
        organizationName: 'Org A',
      },
    });
    expect(registerA.statusCode).toBe(201);
    const userA = registerA.json() as { token: string };

    const registerB = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        email: 'orgb@example.com',
        password: 'correct-horse',
        organizationName: 'Org B',
      },
    });
    expect(registerB.statusCode).toBe(201);
    const userB = registerB.json() as { token: string };

    const authA = { authorization: `Bearer ${userA.token}` };
    const authB = { authorization: `Bearer ${userB.token}` };

    const projectResponse = await app.inject({ method: 'POST', url: '/api/projects', headers: authA, payload: { name: 'Org A Project' } });
    expect(projectResponse.statusCode).toBe(201);
    const project = projectResponse.json() as { id: string };

    const environmentResponse = await app.inject({
      method: 'POST',
      url: '/api/environments',
      headers: authA,
      payload: { projectId: project.id, name: 'local', baseUrl: 'https://example.com' },
    });
    expect(environmentResponse.statusCode).toBe(201);
    const environment = environmentResponse.json() as { id: string };

    const suiteResponse = await app.inject({
      method: 'POST',
      url: '/api/suites',
      headers: authA,
      payload: {
        projectId: project.id,
        name: 'health',
        type: 'api',
        specContent: 'version: 1\ntype: api\nname: health\ntests:\n  - name: ok\n    request:\n      method: GET\n      path: /health\n',
      },
    });
    expect(suiteResponse.statusCode).toBe(201);
    const suite = suiteResponse.json() as { id: string };

    const runResponse = await app.inject({
      method: 'POST',
      url: '/api/runs',
      headers: authA,
      payload: { projectId: project.id, environmentId: environment.id, suiteId: suite.id },
    });
    expect(runResponse.statusCode).toBe(202);
    const run = runResponse.json() as { id: string };

    const reportDir = path.join(dataDir, 'runs', run.id);
    const reportPath = path.join(reportDir, 'report.json');
    const screenshotPath = path.join(reportDir, 'screenshots', 'home.png');
    fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
    fs.writeFileSync(reportPath, JSON.stringify({ ok: true }), 'utf8');
    fs.writeFileSync(screenshotPath, 'fake-png', 'utf8');
    const dbPath = path.join(dataDir, 'db.json');
    const db = JSON.parse(fs.readFileSync(dbPath, 'utf8')) as { runs: Array<{ id: string; reportPath?: string }> };
    db.runs = db.runs.map((item) => item.id === run.id ? { ...item, reportPath } : item);
    fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), 'utf8');

    const aReport = await app.inject({ method: 'GET', url: `/artifacts?path=${encodeURIComponent(reportPath)}`, headers: authA });
    expect(aReport.statusCode).toBe(200);
    expect(aReport.json()).toEqual({ ok: true });

    const aChildArtifact = await app.inject({ method: 'GET', url: `/artifacts?path=${encodeURIComponent(screenshotPath)}`, headers: authA });
    expect(aChildArtifact.statusCode).toBe(200);
    expect(aChildArtifact.payload).toBe('fake-png');

    const aDb = await app.inject({ method: 'GET', url: `/artifacts?path=${encodeURIComponent(dbPath)}`, headers: authA });
    expect(aDb.statusCode).toBe(403);

    const bReport = await app.inject({ method: 'GET', url: `/artifacts?path=${encodeURIComponent(reportPath)}`, headers: authB });
    expect(bReport.statusCode).toBe(403);

    const bProjects = await app.inject({ method: 'GET', url: '/api/projects', headers: authB });
    expect(bProjects.statusCode).toBe(200);
    expect(bProjects.json()).toEqual([]);

    const bGetProject = await app.inject({ method: 'GET', url: `/api/projects/${project.id}`, headers: authB });
    expect(bGetProject.statusCode).toBe(404);

    const bListEnvironments = await app.inject({ method: 'GET', url: `/api/environments?projectId=${project.id}`, headers: authB });
    expect(bListEnvironments.statusCode).toBe(404);
    const bCreateEnvironment = await app.inject({
      method: 'POST',
      url: '/api/environments',
      headers: authB,
      payload: { projectId: project.id, name: 'blocked', baseUrl: 'https://example.com' },
    });
    expect(bCreateEnvironment.statusCode).toBe(404);
    const bGetEnvironment = await app.inject({ method: 'GET', url: `/api/environments/${environment.id}`, headers: authB });
    expect(bGetEnvironment.statusCode).toBe(404);

    const bListSuites = await app.inject({ method: 'GET', url: `/api/suites?projectId=${project.id}`, headers: authB });
    expect(bListSuites.statusCode).toBe(404);
    const bCreateSuite = await app.inject({
      method: 'POST',
      url: '/api/suites',
      headers: authB,
      payload: {
        projectId: project.id,
        name: 'blocked',
        type: 'api',
        specContent: 'version: 1\ntype: api\nname: blocked\ntests: []\n',
      },
    });
    expect(bCreateSuite.statusCode).toBe(404);
    const bGetSuite = await app.inject({ method: 'GET', url: `/api/suites/${suite.id}`, headers: authB });
    expect(bGetSuite.statusCode).toBe(404);

    const bListRuns = await app.inject({ method: 'GET', url: `/api/runs?projectId=${project.id}`, headers: authB });
    expect(bListRuns.statusCode).toBe(404);
    const bCreateRun = await app.inject({
      method: 'POST',
      url: '/api/runs',
      headers: authB,
      payload: { projectId: project.id, environmentId: environment.id, suiteId: suite.id },
    });
    expect(bCreateRun.statusCode).toBe(404);
    const bGetRun = await app.inject({ method: 'GET', url: `/api/runs/${run.id}`, headers: authB });
    expect(bGetRun.statusCode).toBe(404);
    const bDeleteRun = await app.inject({ method: 'DELETE', url: `/api/runs/${run.id}`, headers: authB });
    expect(bDeleteRun.statusCode).toBe(404);

    const aiA = await app.inject({
      method: 'POST',
      url: '/api/ai/connections',
      headers: authA,
      payload: { name: 'Org A AI', provider: 'openai', apiKey: 'sk-a', model: 'gpt-4o-mini', enabled: true },
    });
    expect(aiA.statusCode).toBe(201);
    const aiAConnection = aiA.json() as { id: string; organizationId: string; apiKey?: string };
    expect(aiAConnection.apiKey).toBe('[REDACTED]');

    const aiBList = await app.inject({ method: 'GET', url: '/api/ai/connections', headers: authB });
    expect(aiBList.statusCode).toBe(200);
    expect(aiBList.json()).toEqual([]);

    const aiBUpdateA = await app.inject({
      method: 'POST',
      url: '/api/ai/connections',
      headers: authB,
      payload: { id: aiAConnection.id, name: 'Stolen', provider: 'openai', model: 'gpt-4o-mini', enabled: true },
    });
    expect(aiBUpdateA.statusCode).toBe(404);

    const projectBResponse = await app.inject({ method: 'POST', url: '/api/projects', headers: authB, payload: { name: 'Org B Project' } });
    expect(projectBResponse.statusCode).toBe(201);

    const auditA = await app.inject({ method: 'GET', url: '/api/audit?limit=100', headers: authA });
    expect(auditA.statusCode).toBe(200);
    const entriesA = auditA.json() as Array<{ organizationId?: string; actor: string; action: string }>;
    expect(entriesA.length).toBeGreaterThan(0);
    expect(entriesA.every((entry) => entry.organizationId === aiAConnection.organizationId)).toBe(true);
    expect(entriesA.some((entry) => entry.actor === 'orgb@example.com')).toBe(false);

    const auditB = await app.inject({ method: 'GET', url: '/api/audit?limit=100', headers: authB });
    expect(auditB.statusCode).toBe(200);
    const entriesB = auditB.json() as Array<{ organizationId?: string; actor: string }>;
    expect(entriesB.length).toBeGreaterThan(0);
    expect(entriesB.every((entry) => entry.organizationId && entry.organizationId !== aiAConnection.organizationId)).toBe(true);
    expect(entriesB.some((entry) => entry.actor === 'orga@example.com')).toBe(false);
  });
});

function restoreEnv(): void {
  if (originalDataDir === undefined) delete process.env.TESTHUB_DATA_DIR;
  else process.env.TESTHUB_DATA_DIR = originalDataDir;
  if (originalAuthMode === undefined) delete process.env.TESTHUB_AUTH_MODE;
  else process.env.TESTHUB_AUTH_MODE = originalAuthMode;
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;
  if (originalAllowPublicSignup === undefined) delete process.env.TESTHUB_ALLOW_PUBLIC_SIGNUP;
  else process.env.TESTHUB_ALLOW_PUBLIC_SIGNUP = originalAllowPublicSignup;
  if (originalWebUrl === undefined) delete process.env.TESTHUB_WEB_URL;
  else process.env.TESTHUB_WEB_URL = originalWebUrl;
  if (originalCorsOrigins === undefined) delete process.env.TESTHUB_CORS_ORIGINS;
  else process.env.TESTHUB_CORS_ORIGINS = originalCorsOrigins;
}
