import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runWebSpec } from '../packages/runner/src/web-runner.js';
import type { WebSpec } from '../packages/shared/src/types.js';

let server: http.Server;
let baseUrl: string;

beforeAll(async () => {
  server = http.createServer((_req, res) => {
    res.setHeader('content-type', 'text/html');
    res.end(`<html><body>
      <h1>TestHub</h1>
      <input aria-label="Email" value="qa@example.com" />
      <button data-testid="submit" disabled="disabled">Entrar</button>
      <ul><li class="item">A</li><li class="item">B</li></ul>
    </body></html>`);
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('invalid address');
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
});

describe('web runner', () => {
  it('runs web assertions', async () => {
    const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'testhub-web-'));
    const spec: WebSpec = {
      version: 1,
      type: 'web',
      name: 'web',
      baseUrl,
      defaults: { trace: false, video: false },
      tests: [
        {
          name: 'home',
          steps: [
            { goto: '/' },
            { expectText: 'TestHub' },
            { expectValue: { by: 'label', target: 'Email', value: 'qa@example.com' } },
            { expectAttribute: { by: 'testId', target: 'submit', attribute: 'disabled', value: 'disabled' } },
            { expectCount: { by: 'css', target: '.item', count: 2 } },
          ],
        },
      ],
    };
    const results = await runWebSpec(spec, runDir);
    expect(results[0]?.status).toBe('passed');
  });
});
