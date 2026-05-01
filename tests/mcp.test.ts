import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createApp } from '../apps/api/src/server.js';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { force: true, recursive: true });
});

describe('mcp server', () => {
  it('exposes environment tools and resolves runs by exact environmentName', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'testhub-mcp-'));
    tempDirs.push(dataDir);

    const previousDataDir = process.env.TESTHUB_DATA_DIR;
    const previousDatabaseUrl = process.env.DATABASE_URL;
    const previousAuthMode = process.env.TESTHUB_AUTH_MODE;
    const previousToken = process.env.TESTHUB_TOKEN;
    process.env.TESTHUB_DATA_DIR = dataDir;
    process.env.TESTHUB_AUTH_MODE = 'token';
    process.env.TESTHUB_TOKEN = 'mcp-test-token';

    const app = createApp();
    await app.listen({ port: 0, host: '127.0.0.1' });
    const address = app.server.address();
    if (!address || typeof address === 'string') throw new Error('Could not resolve test server port');
    const testhubUrl = `http://127.0.0.1:${address.port}`;

    const client = new Client({ name: 'testhub-mcp-test', version: '0.1.0' });
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: ['--import', 'tsx', 'apps/mcp/src/mcp.ts'],
      cwd: process.cwd(),
      env: {
        PATH: process.env.PATH ?? '',
        HOME: process.env.HOME ?? '',
        TESTHUB_URL: testhubUrl,
        TESTHUB_DATA_DIR: dataDir,
        TESTHUB_TOKEN: 'mcp-test-token',
      },
      stderr: 'pipe',
    });

    try {
      await client.connect(transport);

      const tools = await client.listTools();
      const toolNames = tools.tools.map((tool) => tool.name);
      expect(toolNames).toEqual(expect.arrayContaining([
        'testhub_list_environments',
        'testhub_create_environment',
        'testhub_update_environment',
        'testhub_archive_environment',
        'testhub_get_environment',
        'testhub_validate_spec',
        'testhub_get_spec_examples',
        'testhub_list_flows',
        'testhub_create_flow',
        'testhub_update_flow',
        'testhub_archive_flow',
        'list_environments',
        'create_environment',
        'get_environment',
      ]));

      const project = await callToolJson<{ project: { id: string } }>(client, 'testhub_create_project', { name: 'MCP Project' });
      const webEnv = await callToolJson<{ id: string }>(client, 'testhub_create_environment', {
        projectId: project.project.id,
        name: 'local-web',
        baseUrl: 'https://example.com',
      });
      const apiEnv = await callToolJson<{ id: string }>(client, 'testhub_create_environment', {
        projectId: project.project.id,
        name: 'local-api',
        baseUrl: 'https://httpbin.org',
      });
      const suite = await callToolJson<{ id: string }>(client, 'testhub_create_suite', {
        projectId: project.project.id,
        name: 'api-health',
        type: 'api',
        specContent: [
          'version: 1',
          'type: api',
          'name: api-health',
          'tests:',
          '  - name: status 200',
          '    request:',
          '      method: GET',
          '      path: /status/200',
          '    expect:',
          '      status: 200',
          '',
        ].join('\n'),
      });

      const listed = await callToolJson<Array<{ id: string; name: string }>>(client, 'list_environments', { projectId: project.project.id });
      expect(listed.map((env) => env.id)).toEqual([webEnv.id, apiEnv.id]);

      const updatedEnv = await callToolJson<{ id: string; name: string; baseUrl: string }>(client, 'testhub_update_environment', {
        environmentId: apiEnv.id,
        name: 'local-api-renamed',
        baseUrl: 'https://httpbin.org',
      });
      expect(updatedEnv).toMatchObject({ id: apiEnv.id, name: 'local-api-renamed' });

      const validation = await callToolJson<{ valid: true; type: string; tests: number }>(client, 'testhub_validate_spec', {
        specContent: [
          'version: 1',
          'type: api',
          'name: api-health',
          'tests:',
          '  - name: status 200',
          '    request:',
          '      method: GET',
          '      path: /status/200',
          '',
        ].join('\n'),
      });
      expect(validation).toMatchObject({ valid: true, type: 'api', tests: 1 });

      const createdFlow = await callToolJson<{ id: string; namespace: string; name: string }>(client, 'testhub_create_flow', {
        namespace: 'auth',
        name: 'login',
        description: 'Login MCP',
        params: { email: '${USER_EMAIL}', password: '${USER_PASSWORD}' },
        steps: [
          { goto: '/login' },
          { fill: { by: 'label', target: 'Email', value: '${email}' } },
        ],
      });
      expect(createdFlow).toMatchObject({ namespace: 'auth', name: 'login' });

      const listedFlows = await callToolJson<Array<{ id: string; namespace: string }>>(client, 'testhub_list_flows', { namespace: 'auth' });
      expect(listedFlows.map((flow) => flow.id)).toContain(createdFlow.id);

      const flowSpecValidation = await callToolJson<{ valid: true; type: string; tests: number }>(client, 'testhub_validate_spec', {
        specContent: [
          'version: 1',
          'type: web',
          'name: web-library',
          'tests:',
          '  - name: login',
          '    steps:',
          '      - use: auth.login',
          '      - expectText: Dashboard',
          '',
        ].join('\n'),
      });
      expect(flowSpecValidation).toMatchObject({ valid: true, type: 'web', tests: 1 });

      const examples = await callToolJson<{ examples: { 'web-flow': string } }>(client, 'testhub_get_spec_examples', { example: 'web-flow' });
      expect(examples.examples['web-flow']).toContain('flows:');
      expect(examples.examples['web-flow']).toContain('extract:');

      const libraryExample = await callToolJson<{ examples: { 'web-library-flow': string } }>(client, 'testhub_get_spec_examples', { example: 'web-library-flow' });
      expect(libraryExample.examples['web-library-flow']).toContain('use: auth.login');

      const run = await callToolJson<{ environmentId: string }>(client, 'testhub_run_suite', {
        projectId: project.project.id,
        suiteId: suite.id,
        environmentName: 'local-api-renamed',
      });
      expect(run.environmentId).toBe(apiEnv.id);
    } finally {
      await client.close();
      await app.close();
      if (previousDataDir === undefined) delete process.env.TESTHUB_DATA_DIR;
      else process.env.TESTHUB_DATA_DIR = previousDataDir;
      if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previousDatabaseUrl;
      if (previousAuthMode === undefined) delete process.env.TESTHUB_AUTH_MODE;
      else process.env.TESTHUB_AUTH_MODE = previousAuthMode;
      if (previousToken === undefined) delete process.env.TESTHUB_TOKEN;
      else process.env.TESTHUB_TOKEN = previousToken;
    }
  }, 30000);
});

async function callToolJson<T>(client: Client, name: string, args: Record<string, unknown>): Promise<T> {
  const response = await client.callTool({ name, arguments: args });
  const content = response.content?.[0];
  if (!content || content.type !== 'text') throw new Error(`Tool ${name} did not return text`);
  return JSON.parse(content.text) as T;
}
