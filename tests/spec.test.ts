import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseSpecFile, resolveVariables } from '../packages/spec/src/spec.js';

describe('spec parser', () => {
  it('parses valid api spec', () => {
    const file = tempFile(`
version: 1
type: api
name: sample
tests:
  - name: health
    request:
      method: GET
      path: /health
`);
    const spec = parseSpecFile(file);
    expect(spec.type).toBe('api');
    expect(spec.name).toBe('sample');
  });

  it('resolves env variables recursively', () => {
    const value = resolveVariables({ url: '${BASE_URL}', nested: ['${TOKEN}'] }, { BASE_URL: 'https://x', TOKEN: 'abc' });
    expect(value).toEqual({ url: 'https://x', nested: ['abc'] });
  });

  it('parses web selector/text object steps used by MCP docs', () => {
    const file = tempFile(`
version: 1
type: web
name: web
tests:
  - name: form
    steps:
      - goto: /login
      - fill:
          selector: input[type="email"]
          value: qa@example.com
      - click: button[type="submit"]
      - expectText:
          text: Invalid email or password
`);
    const spec = parseSpecFile(file);
    expect(spec.type).toBe('web');
    expect(spec.tests[0]?.steps).toHaveLength(4);
  });

  it('parses web flows and extract steps', () => {
    const file = tempFile(`
version: 1
type: web
name: web
flows:
  login:
    params:
      email: qa@example.com
    steps:
      - fill:
          by: label
          target: Email
          value: \${email}
      - extract:
          as: USER_NAME
          from:
            by: testId
            target: user-name
          property: text
tests:
  - name: form
    steps:
      - use: login
        with:
          email: other@example.com
      - expectText: Dashboard
`);
    const spec = parseSpecFile(file);
    expect(spec.type).toBe('web');
    expect(spec.flows?.login?.steps).toHaveLength(2);
  });

  it('resolves organization flow library refs passed by caller', () => {
    const file = tempFile(`
version: 1
type: web
name: web
tests:
  - name: form
    steps:
      - use: auth.login
      - expectText: Dashboard
`);
    const spec = parseSpecFile(file, {
      externalFlows: {
        'auth.login': {
          params: { email: 'qa@example.com' },
          steps: [{ goto: '/login' }],
        },
      },
    });
    expect(spec.type).toBe('web');
    expect(spec.tests[0]?.steps[0]).toEqual({ use: 'auth.login' });
  });

  it('detects cycles across local and external flows', () => {
    expect(() => parseSpecFile(tempFile(`
version: 1
type: web
name: web
flows:
  setup:
    steps:
      - use: auth.login
tests:
  - name: form
    steps:
      - use: setup
`), {
      externalFlows: {
        'auth.login': {
          steps: [{ use: 'setup' }],
        },
      },
    })).toThrow(/ciclo em flows/);
  });

  it('rejects missing and cyclic web flows', () => {
    expect(() => parseSpecFile(tempFile(`
version: 1
type: web
name: web
tests:
  - name: form
    steps:
      - use: login
`))).toThrow(/flow "login" nao encontrado/);

    expect(() => parseSpecFile(tempFile(`
version: 1
type: web
name: web
flows:
  a:
    steps:
      - use: b
  b:
    steps:
      - use: a
tests:
  - name: form
    steps:
      - use: a
`))).toThrow(/ciclo em flows/);
  });

  it('requires attribute name for attribute extract', () => {
    expect(() => parseSpecFile(tempFile(`
version: 1
type: web
name: web
tests:
  - name: form
    steps:
      - extract:
          as: LINK
          from:
            selector: a
          property: attribute
`))).toThrow(/property attribute requer attribute/);
  });
});

function tempFile(content: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'testhub-spec-'));
  const file = path.join(dir, 'spec.yaml');
  fs.writeFileSync(file, content, 'utf8');
  return file;
}
