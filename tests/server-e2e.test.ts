import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../apps/api/src/server.js';

const originalDataDir = process.env.TESTHUB_DATA_DIR;
const originalAuthMode = process.env.TESTHUB_AUTH_MODE;
const originalNodeEnv = process.env.NODE_ENV;
let app: ReturnType<typeof createApp>;
let token: string;

function auth() {
  return { authorization: `Bearer ${token}` };
}

beforeAll(async () => {
  process.env.TESTHUB_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'testhub-server-e2e-'));
  process.env.TESTHUB_AUTH_MODE = 'local';
  process.env.NODE_ENV = 'test';
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
    const projectResponse = await app.inject({ method: 'POST', url: '/api/projects', headers: auth(), payload: { name: 'E2E' } });
    expect(projectResponse.statusCode).toBe(201);
    const project = projectResponse.json() as { id: string };

    const envResponse = await app.inject({ method: 'POST', url: '/api/environments', headers: auth(), payload: { projectId: project.id, name: 'local', baseUrl: 'https://httpbin.org' } });
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
        specContent: 'version: 1\ntype: api\nname: health\ntests:\n  - name: ok\n    request:\n      method: GET\n      path: /status/200\n    expect:\n      status: 200\n',
      },
    });
    expect(suiteResponse.statusCode).toBe(201);
    const suite = suiteResponse.json() as { id: string };

    const runResponse = await app.inject({ method: 'POST', url: '/api/runs', headers: auth(), payload: { projectId: project.id, environmentId: environment.id, suiteId: suite.id } });
    expect(runResponse.statusCode).toBe(202);
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

  it('requires cleanup to be project scoped', async () => {
    const missingProjectResponse = await app.inject({
      method: 'POST',
      url: '/api/cleanup',
      headers: auth(),
      payload: { days: 1 },
    });
    expect(missingProjectResponse.statusCode).toBe(400);
    expect(missingProjectResponse.json()).toMatchObject({ error: 'projectId obrigatorio para cleanup via API' });

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
