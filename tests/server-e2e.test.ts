import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../apps/api/src/server.js';

const app = createApp();

beforeAll(async () => {
  await app.ready();
});

afterAll(async () => {
  await app.close();
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
    const projectResponse = await app.inject({ method: 'POST', url: '/api/projects', payload: { name: 'E2E' } });
    expect(projectResponse.statusCode).toBe(201);
    const project = projectResponse.json() as { id: string };

    const envResponse = await app.inject({ method: 'POST', url: '/api/environments', payload: { projectId: project.id, name: 'local', baseUrl: 'https://httpbin.org' } });
    expect(envResponse.statusCode).toBe(201);
    const environment = envResponse.json() as { id: string };

    const suiteResponse = await app.inject({
      method: 'POST',
      url: '/api/suites',
      payload: {
        projectId: project.id,
        name: 'health',
        type: 'api',
        specContent: 'version: 1\ntype: api\nname: health\ntests:\n  - name: ok\n    request:\n      method: GET\n      path: /status/200\n    expect:\n      status: 200\n',
      },
    });
    expect(suiteResponse.statusCode).toBe(201);
    const suite = suiteResponse.json() as { id: string };

    const runResponse = await app.inject({ method: 'POST', url: '/api/runs', payload: { projectId: project.id, environmentId: environment.id, suiteId: suite.id } });
    expect(runResponse.statusCode).toBe(202);
  });

  it('updates and soft deletes projects', async () => {
    const createdResponse = await app.inject({ method: 'POST', url: '/api/projects', payload: { name: 'CRUD draft', description: 'old' } });
    expect(createdResponse.statusCode).toBe(201);
    const created = createdResponse.json() as { id: string };

    const updatedResponse = await app.inject({ method: 'PUT', url: `/api/projects/${created.id}`, payload: { name: 'CRUD final', description: 'new' } });
    expect(updatedResponse.statusCode).toBe(200);
    expect(updatedResponse.json()).toMatchObject({ id: created.id, name: 'CRUD final', description: 'new', status: 'active' });

    const getResponse = await app.inject({ method: 'GET', url: `/api/projects/${created.id}` });
    expect(getResponse.statusCode).toBe(200);
    expect(getResponse.json()).toMatchObject({ id: created.id, name: 'CRUD final' });

    const deleteResponse = await app.inject({ method: 'DELETE', url: `/api/projects/${created.id}` });
    expect(deleteResponse.statusCode).toBe(204);

    const deletedGetResponse = await app.inject({ method: 'GET', url: `/api/projects/${created.id}` });
    expect(deletedGetResponse.statusCode).toBe(404);
  });
});
