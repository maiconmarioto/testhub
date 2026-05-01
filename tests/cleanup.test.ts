import { describe, expect, it } from 'vitest';
import { cleanupOldRuns } from '../packages/db/src/cleanup.js';
import type { Store } from '../packages/db/src/store.js';

describe('cleanup', () => {
  it('delegates archival to the Postgres-backed store contract', async () => {
    const store = {
      rootDir: '.testhub-data',
      suitesDir: '.testhub-data/suites',
      runsDir: '.testhub-data/runs',
      archiveRunsBefore: async () => 1,
    } as Store;

    const result = await cleanupOldRuns(store, 1);
    expect(result.archivedRuns).toBe(1);
    expect(result.retainedArtifacts).toBe(true);
  });
});
