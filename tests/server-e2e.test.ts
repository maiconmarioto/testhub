import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../apps/api/src/server.js';
import { resetPostgresTestDatabase } from './postgres-test-helper.js';

const originalDataDir = process.env.TESTHUB_DATA_DIR;
const originalAuthMode = process.env.TESTHUB_AUTH_MODE;
const originalNodeEnv = process.env.NODE_ENV;
const originalHealthTimeout = process.env.TESTHUB_ENV_HEALTH_TIMEOUT_MS;
let app: ReturnType<typeof createApp>;
let token: string;

function auth() {
  return { authorization: `Bearer ${token}` };
}

beforeAll(async () => {
  process.env.TESTHUB_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'testhub-server-e2e-'));
  process.env.TESTHUB_AUTH_MODE = 'local';
  process.env.NODE_ENV = 'test';
  process.env.TESTHUB_ENV_HEALTH_TIMEOUT_MS = '100';
  await resetPostgresTestDatabase();
  app = createApp();
  await app.ready();

  const register = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: {
      email: 'e2e@example.com',
      password: 'correct-horse',
      organizationName: 'E2E Team',
    },
  });
  expect(register.statusCode).toBe(201);
  token = (register.json() as { token: string }).token;
});

afterAll(async () => {
  await app.close();
  if (originalDataDir === undefined) delete process.env.TESTHUB_DATA_DIR;
  else process.env.TESTHUB_DATA_DIR = originalDataDir;
  if (originalAuthMode === undefined) delete process.env.TESTHUB_AUTH_MODE;
  else process.env.TESTHUB_AUTH_MODE = originalAuthMode;
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;
  if (originalHealthTimeout === undefined) delete process.env.TESTHUB_ENV_HEALTH_TIMEOUT_MS;
  else process.env.TESTHUB_ENV_HEALTH_TIMEOUT_MS = originalHealthTimeout;
});

describe('server e2e', () => {
  it('exposes api metadata and openapi document without serving a dashboard', async () => {
    const root = await app.inject({ method: 'GET', url: '/' });
    expect(root.statusCode).toBe(200);
    expect(root.json()).toMatchObject({ service: 'testhub-api', status: 'ok', docs: '/docs' });
    expect(root.payload).not.toContain('<html');

    const openapi = await app.inject({ method: 'GET', url: '/openapi.json' });
    expect(openapi.statusCode).toBe(200);
    expect(openapi.json()).toMatchObject({ openapi: '3.0.3' });
  });

  it('creates project, env, suite and run', async () => {
    const target = await createTargetServer();
    const projectResponse = await app.inject({ method: 'POST', url: '/api/projects', headers: auth(), payload: { name: 'E2E' } });
    expect(projectResponse.statusCode).toBe(201);
    const project = projectResponse.json() as { id: string };

    const envResponse = await app.inject({ method: 'POST', url: '/api/environments', headers: auth(), payload: { projectId: project.id, name: 'local', baseUrl: target.baseUrl } });
    expect(envResponse.statusCode).toBe(201);
    const environment = envResponse.json() as { id: string };

    const suiteResponse = await app.inject({
      method: 'POST',
      url: '/api/suites',
      headers: auth(),
      payload: {
        projectId: project.id,
        name: 'health',
        type: 'api',
        specContent: 'version: 1\ntype: api\nname: health\ntests:\n  - name: ok\n    request:\n      method: GET\n      path: /health\n    expect:\n      status: 200\n',
      },
    });
    expect(suiteResponse.statusCode).toBe(201);
    const suite = suiteResponse.json() as { id: string };

    const runResponse = await app.inject({ method: 'POST', url: '/api/runs', headers: auth(), payload: { projectId: project.id, environmentId: environment.id, suiteId: suite.id } });
    expect(runResponse.statusCode).toBe(202);
    const run = runResponse.json() as { status: string; progress?: unknown };
    expect(run.status).toBe('queued');
    await target.close();
  });

  it('soft deletes runs from the selected project history', async () => {
    const target = await createTargetServer();
    const projectResponse = await app.inject({ method: 'POST', url: '/api/projects', headers: auth(), payload: { name: 'Run Delete' } });
    expect(projectResponse.statusCode).toBe(201);
    const project = projectResponse.json() as { id: string };

    const envResponse = await app.inject({ method: 'POST', url: '/api/environments', headers: auth(), payload: { projectId: project.id, name: 'local', baseUrl: target.baseUrl } });
    expect(envResponse.statusCode).toBe(201);
    const environment = envResponse.json() as { id: string };

    const suiteResponse = await app.inject({
      method: 'POST',
      url: '/api/suites',
      headers: auth(),
      payload: {
        projectId: project.id,
        name: 'delete-run',
        type: 'api',
        specContent: 'version: 1\ntype: api\nname: delete-run\ntests:\n  - name: ok\n    request:\n      method: GET\n      path: /health\n    expect:\n      status: 200\n',
      },
    });
    expect(suiteResponse.statusCode).toBe(201);
    const suite = suiteResponse.json() as { id: string };

    const runResponse = await app.inject({ method: 'POST', url: '/api/runs', headers: auth(), payload: { projectId: project.id, environmentId: environment.id, suiteId: suite.id } });
    expect(runResponse.statusCode).toBe(202);
    const run = runResponse.json() as { id: string };

    const deleteResponse = await app.inject({ method: 'DELETE', url: `/api/runs/${run.id}`, headers: auth() });
    expect(deleteResponse.statusCode).toBe(204);

    const getResponse = await app.inject({ method: 'GET', url: `/api/runs/${run.id}`, headers: auth() });
    expect(getResponse.statusCode).toBe(404);

    const listResponse = await app.inject({ method: 'GET', url: `/api/runs?projectId=${project.id}`, headers: auth() });
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json()).toEqual([]);
    await target.close();
  });

  it('blocks run when environment health check fails', async () => {
    const projectResponse = await app.inject({ method: 'POST', url: '/api/projects', headers: auth(), payload: { name: 'Health Block' } });
    const project = projectResponse.json() as { id: string };
    const envResponse = await app.inject({ method: 'POST', url: '/api/environments', headers: auth(), payload: { projectId: project.id, name: 'down', baseUrl: 'http://127.0.0.1:1' } });
    const environment = envResponse.json() as { id: string };
    const suiteResponse = await app.inject({
      method: 'POST',
      url: '/api/suites',
      headers: auth(),
      payload: {
        projectId: project.id,
        name: 'health-block',
        type: 'api',
        specContent: 'version: 1\ntype: api\nname: health\ntests:\n  - name: ok\n    request:\n      method: GET\n      path: /health\n',
      },
    });
    const suite = suiteResponse.json() as { id: string };
    const runResponse = await app.inject({ method: 'POST', url: '/api/runs', headers: auth(), payload: { projectId: project.id, environmentId: environment.id, suiteId: suite.id } });
    expect(runResponse.statusCode).toBe(202);
    expect(runResponse.json()).toMatchObject({ status: 'error' });
    expect(runResponse.json().error).toContain('Environment health check falhou');
    expect(runResponse.json().progress).toMatchObject({ phase: 'error', error: 1 });
  });

  it('updates and soft deletes environments', async () => {
    const projectResponse = await app.inject({ method: 'POST', url: '/api/projects', headers: auth(), payload: { name: 'Env CRUD' } });
    const project = projectResponse.json() as { id: string };

    const createdResponse = await app.inject({ method: 'POST', url: '/api/environments', headers: auth(), payload: { projectId: project.id, name: 'hml', baseUrl: 'https://example.com', variables: { TOKEN: 'abc' } } });
    expect(createdResponse.statusCode).toBe(201);
    const created = createdResponse.json() as { id: string };
    expect(created).toMatchObject({ name: 'hml', baseUrl: 'https://example.com', variables: { TOKEN: '[REDACTED]' } });

    const updatedResponse = await app.inject({ method: 'PUT', url: `/api/environments/${created.id}`, headers: auth(), payload: { name: 'prod', baseUrl: 'https://httpbin.org', variables: { TOKEN: 'def' } } });
    expect(updatedResponse.statusCode).toBe(200);
    expect(updatedResponse.json()).toMatchObject({ id: created.id, name: 'prod', baseUrl: 'https://httpbin.org', variables: { TOKEN: '[REDACTED]' } });

    const deleteResponse = await app.inject({ method: 'DELETE', url: `/api/environments/${created.id}`, headers: auth() });
    expect(deleteResponse.statusCode).toBe(204);

    const listResponse = await app.inject({ method: 'GET', url: `/api/environments?projectId=${project.id}`, headers: auth() });
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json()).toEqual([]);
  });

  it('validates specs without saving them', async () => {
    const validResponse = await app.inject({
      method: 'POST',
      url: '/api/spec/validate',
      headers: auth(),
      payload: { specContent: 'version: 1\ntype: api\nname: valid\ntests:\n  - name: ok\n    request:\n      method: GET\n      path: /health\n' },
    });
    expect(validResponse.statusCode).toBe(200);
    expect(validResponse.json()).toMatchObject({ valid: true, type: 'api', name: 'valid', tests: 1 });

    const invalidResponse = await app.inject({
      method: 'POST',
      url: '/api/spec/validate',
      headers: auth(),
      payload: { specContent: 'version: 1\ntype: web\nname: broken\ntests: []\n' },
    });
    expect(invalidResponse.statusCode).toBe(400);
    expect(invalidResponse.json()).toMatchObject({ valid: false });
  });

  it('scopes reusable flows to selected projects', async () => {
    const projectAResponse = await app.inject({ method: 'POST', url: '/api/projects', headers: auth(), payload: { name: 'Flow A' } });
    const projectBResponse = await app.inject({ method: 'POST', url: '/api/projects', headers: auth(), payload: { name: 'Flow B' } });
    const projectA = projectAResponse.json() as { id: string };
    const projectB = projectBResponse.json() as { id: string };

    const flowResponse = await app.inject({
      method: 'POST',
      url: '/api/flows',
      headers: auth(),
      payload: {
        namespace: 'auth',
        name: 'login',
        displayName: 'Login compartilhado',
        projectIds: [projectA.id],
        steps: [{ goto: '/login' }],
      },
    });
    expect(flowResponse.statusCode).toBe(201);
    expect(flowResponse.json()).toMatchObject({ displayName: 'Login compartilhado', projectIds: [projectA.id] });

    const scopedA = await app.inject({ method: 'GET', url: `/api/flows?projectId=${projectA.id}`, headers: auth() });
    expect(scopedA.statusCode).toBe(200);
    expect(scopedA.json()).toHaveLength(1);

    const scopedB = await app.inject({ method: 'GET', url: `/api/flows?projectId=${projectB.id}`, headers: auth() });
    expect(scopedB.statusCode).toBe(200);
    expect(scopedB.json()).toEqual([]);

    const specContent = 'version: 1\ntype: web\nname: flow-use\ntests:\n  - name: login\n    steps:\n      - use: auth.login\n';
    const allowedSuite = await app.inject({
      method: 'POST',
      url: '/api/suites',
      headers: auth(),
      payload: { projectId: projectA.id, name: 'allowed-flow', type: 'web', specContent },
    });
    expect(allowedSuite.statusCode).toBe(201);

    const blockedSuite = await app.inject({
      method: 'POST',
      url: '/api/suites',
      headers: auth(),
      payload: { projectId: projectB.id, name: 'blocked-flow', type: 'web', specContent },
    });
    expect(blockedSuite.statusCode).toBe(400);
    expect(blockedSuite.json().error).toContain('flow "auth.login" nao encontrado');
  });

  it('requires cleanup to be project scoped', async () => {
    const missingProjectResponse = await app.inject({
      method: 'POST',
      url: '/api/cleanup',
      headers: auth(),
      payload: { days: 1 },
    });
    expect(missingProjectResponse.statusCode).toBe(400);
    expect(missingProjectResponse.json()).toMatchObject({ error: 'projectId obrigatório para cleanup via API' });

    const projectResponse = await app.inject({ method: 'POST', url: '/api/projects', headers: auth(), payload: { name: 'Cleanup' } });
    expect(projectResponse.statusCode).toBe(201);
    const project = projectResponse.json() as { id: string };

    const scopedResponse = await app.inject({
      method: 'POST',
      url: '/api/cleanup',
      headers: auth(),
      payload: { projectId: project.id, days: 1 },
    });
    expect(scopedResponse.statusCode).toBe(200);
    expect(scopedResponse.json()).toMatchObject({ projectId: project.id, days: 1 });
  });

  it('updates and soft deletes projects', async () => {
    const createdResponse = await app.inject({ method: 'POST', url: '/api/projects', headers: auth(), payload: { name: 'CRUD draft', description: 'old' } });
    expect(createdResponse.statusCode).toBe(201);
    const created = createdResponse.json() as { id: string };

    const updatedResponse = await app.inject({ method: 'PUT', url: `/api/projects/${created.id}`, headers: auth(), payload: { name: 'CRUD final', description: 'new' } });
    expect(updatedResponse.statusCode).toBe(200);
    expect(updatedResponse.json()).toMatchObject({ id: created.id, name: 'CRUD final', description: 'new', status: 'active' });

    const getResponse = await app.inject({ method: 'GET', url: `/api/projects/${created.id}`, headers: auth() });
    expect(getResponse.statusCode).toBe(200);
    expect(getResponse.json()).toMatchObject({ id: created.id, name: 'CRUD final' });

    const deleteResponse = await app.inject({ method: 'DELETE', url: `/api/projects/${created.id}`, headers: auth() });
    expect(deleteResponse.statusCode).toBe(204);

    const deletedGetResponse = await app.inject({ method: 'GET', url: `/api/projects/${created.id}`, headers: auth() });
    expect(deletedGetResponse.statusCode).toBe(404);
  });
});

async function createTargetServer(): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server = http.createServer((_req, res) => {
    res.statusCode = 200;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ ok: true }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('invalid target server');
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
  };
}
