import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseSpecFile, resolveVariables } from '../src/spec.js';

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
});

function tempFile(content: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'testhub-spec-'));
  const file = path.join(dir, 'spec.yaml');
  fs.writeFileSync(file, content, 'utf8');
  return file;
}
