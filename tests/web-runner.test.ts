import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runWebSpec } from '../packages/runner/src/web-runner.js';
import { ProgressTracker } from '../packages/runner/src/progress.js';
import type { WebSpec } from '../packages/shared/src/types.js';

let server: http.Server;
let baseUrl: string;

beforeAll(async () => {
  server = http.createServer((_req, res) => {
    res.setHeader('content-type', 'text/html');
    res.end(`<html><body>
      <h1>TestHub</h1>
      <input aria-label="Email" value="qa@example.com" />
      <input type="password" />
      <button type="submit">Login</button>
      <button data-testid="submit" disabled="disabled">Entrar</button>
      <span data-testid="order-id">ORD-123</span>
      <a data-testid="order-link" href="/orders/ORD-123">Pedido</a>
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
            { fill: { selector: 'input[type="password"]', value: 'secret' } },
            { click: 'button[type="submit"]' },
            { expectText: { text: 'TestHub' } },
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

  it('runs reusable flows and web extract variables', async () => {
    const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'testhub-web-flow-'));
    const spec: WebSpec = {
      version: 1,
      type: 'web',
      name: 'web',
      baseUrl,
      defaults: { trace: false, video: false },
      flows: {
        login: {
          params: { email: 'qa@example.com', password: 'secret' },
          steps: [
            { goto: '/' },
            { fill: { by: 'label', target: 'Email', value: '${email}' } },
            { fill: { selector: 'input[type="password"]', value: '${password}' } },
            { click: { by: 'role', role: 'button', name: 'Login' } },
          ],
        },
      },
      tests: [
        {
          name: 'checkout',
          steps: [
            { use: 'login', with: { password: 'override-secret' } },
            { extract: { as: 'ORDER_ID', from: { by: 'testId', target: 'order-id' }, property: 'text' } },
            { expectText: '${ORDER_ID}' },
            { extract: { as: 'ORDER_URL', from: { by: 'testId', target: 'order-link' }, property: 'attribute', attribute: 'href' } },
            { expectAttribute: { by: 'testId', target: 'order-link', attribute: 'href', value: '${ORDER_URL}' } },
            { extract: { as: 'CURRENT_URL', property: 'url' } },
            { expectUrlContains: '${CURRENT_URL}' },
          ],
        },
      ],
    };
    const results = await runWebSpec(spec, runDir);
    expect(results[0]?.status).toBe('passed');
    expect(results[0]?.steps.map((step) => step.name)).toEqual([
      'login / goto: /',
      'login / fill: {"by":"label","target":"Email","value":"qa@example.com"}',
      'login / fill: {"selector":"input[type=\\"password\\"]","value":"override-secret"}',
      'login / click: {"by":"role","role":"button","name":"Login"}',
      'extract: {"as":"ORDER_ID","from":{"by":"testId","target":"order-id"},"property":"text"}',
      'expectText: ORD-123',
      'extract: {"as":"ORDER_URL","from":{"by":"testId","target":"order-link"},"property":"attribute","attribute":"href"}',
      'expectAttribute: {"by":"testId","target":"order-link","attribute":"href","value":"/orders/ORD-123"}',
      expect.stringMatching(/^extract: \{"as":"CURRENT_URL"/),
      expect.stringMatching(/^expectUrlContains: http:\/\/127\.0\.0\.1:/),
    ]);
  });

  it('runs organization flow library refs', async () => {
    const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'testhub-web-flow-library-'));
    const spec: WebSpec = {
      version: 1,
      type: 'web',
      name: 'web',
      baseUrl,
      defaults: { trace: false, video: false },
      tests: [
        {
          name: 'shared login',
          steps: [
            { use: 'auth.login', with: { password: 'shared-secret' } },
            { expectText: 'TestHub' },
          ],
        },
      ],
    };
    const results = await runWebSpec(spec, runDir, {
      externalFlows: {
        'auth.login': {
          params: { email: 'qa@example.com', password: 'secret' },
          steps: [
            { goto: '/' },
            { fill: { by: 'label', target: 'Email', value: '${email}' } },
            { fill: { selector: 'input[type="password"]', value: '${password}' } },
          ],
        },
      },
    });
    expect(results[0]?.status).toBe('passed');
    expect(results[0]?.steps.map((step) => step.name)).toEqual([
      'auth.login / goto: /',
      'auth.login / fill: {"by":"label","target":"Email","value":"qa@example.com"}',
      'auth.login / fill: {"selector":"input[type=\\"password\\"]","value":"shared-secret"}',
      'expectText: TestHub',
    ]);
  });

  it('emits progress for web suites and failed steps', async () => {
    const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'testhub-web-progress-'));
    const events: string[] = [];
    const progress = new ProgressTracker(1, (event) => {
      events.push(`${event.phase}:${event.currentTest ?? ''}:${event.currentStep ?? ''}:${event.failed}`);
    });
    const spec: WebSpec = {
      version: 1,
      type: 'web',
      name: 'web',
      baseUrl,
      defaults: { trace: false, video: false, timeoutMs: 500 },
      tests: [
        {
          name: 'home fails',
          steps: [
            { goto: '/' },
            { expectText: 'Texto inexistente' },
          ],
        },
      ],
    };

    const results = await runWebSpec(spec, runDir, { progress });

    expect(results[0]?.status).toBe('failed');
    expect(events).toContain('test:home fails::0');
    expect(events.some((event) => event.includes('goto: /'))).toBe(true);
    expect(events.some((event) => event.includes('expectText: Texto inexistente'))).toBe(true);
    expect(events.some((event) => event.endsWith(':1'))).toBe(true);
  });
});
