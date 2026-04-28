import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../apps/api/src/server.js';

const originalDataDir = process.env.TESTHUB_DATA_DIR;
const originalAuthMode = process.env.TESTHUB_AUTH_MODE;
const originalNodeEnv = process.env.NODE_ENV;
const apps: ReturnType<typeof createApp>[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  restoreEnv();
});

describe('server local auth', () => {
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
    expect(publicSignup.json()).toMatchObject({ error: 'Cadastro publico desabilitado' });

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
});

function restoreEnv(): void {
  if (originalDataDir === undefined) delete process.env.TESTHUB_DATA_DIR;
  else process.env.TESTHUB_DATA_DIR = originalDataDir;
  if (originalAuthMode === undefined) delete process.env.TESTHUB_AUTH_MODE;
  else process.env.TESTHUB_AUTH_MODE = originalAuthMode;
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;
}
