import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { cleanupOldRuns } from '../src/cleanup.js';
import { JsonStore } from '../src/store.js';

describe('cleanup', () => {
  it('removes old run records and artifact directories', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'testhub-cleanup-'));
    const store = new JsonStore(root);
    const project = store.createProject({ name: 'CRM' });
    const environment = store.createEnvironment({ projectId: project.id, name: 'hml', baseUrl: 'https://example.com' });
    const suite = store.createSuite({ projectId: project.id, name: 'health', type: 'api', specContent: 'version: 1\ntype: api\nname: health\ntests: []\n' });
    const run = store.createRun({ projectId: project.id, environmentId: environment.id, suiteId: suite.id });
    const runDir = path.join(store.runsDir, run.id);
    fs.mkdirSync(runDir, { recursive: true });
    fs.writeFileSync(path.join(runDir, 'report.json'), '{}', 'utf8');

    const db = store.read();
    db.runs[0] = { ...db.runs[0], createdAt: '2000-01-01T00:00:00.000Z' };
    store.write(db);

    const result = await cleanupOldRuns(store, 1);
    expect(result.deletedRuns).toBe(1);
    expect(fs.existsSync(runDir)).toBe(false);
    expect(store.read().runs).toHaveLength(0);
  });
});
