import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runApiSpec } from '../packages/runner/src/api-runner.js';
import type { ApiSpec } from '../packages/shared/src/types.js';

let server: http.Server;
let baseUrl: string;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    if (req.url === '/login') {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ token: 'abc123' }));
      return;
    }
    if (req.url === '/me') {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ id: 'u1', email: 'qa@example.com' }));
      return;
    }
    res.statusCode = 404;
    res.end('not found');
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('invalid address');
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
});

describe('api runner', () => {
  it('runs chained requests with extract', async () => {
    const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'testhub-api-'));
    const spec: ApiSpec = {
      version: 1,
      type: 'api',
      name: 'api',
      baseUrl,
      tests: [
        {
          name: 'auth chain',
          request: { method: 'GET', path: '/login' },
          expect: { status: 200, bodyPathExists: ['token'] },
          extract: { TOKEN: 'body.token' },
        },
        {
          name: 'me',
          request: {
            method: 'GET',
            path: '/me',
            headers: { Authorization: 'Bearer ${TOKEN}' },
          },
          expect: { status: 200, body: { email: 'qa@example.com' } },
        },
      ],
    };
    const results = await runApiSpec(spec, runDir);
    expect(results.map((result) => result.status)).toEqual(['passed', 'passed']);
  });

  it('classifies assertions as failed and runtime problems as error', async () => {
    const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'testhub-api-status-'));
    const assertionSpec: ApiSpec = {
      version: 1,
      type: 'api',
      name: 'api',
      baseUrl,
      tests: [
        {
          name: 'wrong status',
          request: { method: 'GET', path: '/me' },
          expect: { status: 201 },
        },
      ],
    };
    const missingVarSpec: ApiSpec = {
      version: 1,
      type: 'api',
      name: 'api',
      baseUrl,
      tests: [
        {
          name: 'missing variable',
          request: { method: 'GET', path: '/me', headers: { Authorization: 'Bearer ${MISSING_TOKEN}' } },
          expect: { status: 200 },
        },
      ],
    };

    const assertionResults = await runApiSpec(assertionSpec, runDir);
    const missingVarResults = await runApiSpec(missingVarSpec, runDir);

    expect(assertionResults[0]?.status).toBe('failed');
    expect(missingVarResults[0]?.status).toBe('error');
  });
});
