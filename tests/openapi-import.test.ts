import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseSpecFile } from '../src/spec.js';
import { openApiToSuite } from '../src/openapi-import.js';

describe('openapi import', () => {
  it('converts paths into an api suite', () => {
    const yaml = openApiToSuite({
      openapi: '3.0.0',
      paths: {
        '/users/{id}': {
          get: {
            operationId: 'getUser',
            responses: { '200': { description: 'ok' } },
          },
        },
      },
    }, 'users-api');

    const specPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'testhub-openapi-')), 'suite.yaml');
    fs.writeFileSync(specPath, yaml, 'utf8');
    const spec = parseSpecFile(specPath);
    expect(spec.name).toBe('users-api');
    expect(spec.tests[0]?.name).toBe('getUser');
    expect(spec.tests[0]?.request.path).toBe('/users/1');
    expect(spec.tests[0]?.expect?.status).toBe(200);
  });
});
