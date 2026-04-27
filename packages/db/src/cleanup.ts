import fs from 'node:fs';
import path from 'node:path';
import type { Store } from './store.js';

export interface CleanupResult {
  cutoffIso: string;
  deletedRuns: number;
  deletedDirectories: number;
}

export async function cleanupOldRuns(store: Store, days: number): Promise<CleanupResult> {
  if (!Number.isFinite(days) || days < 1) throw new Error('days deve ser maior que zero');
  const cutoffIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const db = await store.read();
  const oldRuns = db.runs.filter((run) => run.createdAt < cutoffIso);
  let deletedDirectories = 0;

  for (const run of oldRuns) {
    for (const candidate of [
      path.join(store.runsDir, run.id),
      run.reportPath ? path.dirname(path.dirname(run.reportPath)) : undefined,
      run.reportHtmlPath ? path.dirname(path.dirname(run.reportHtmlPath)) : undefined,
    ]) {
      if (!candidate) continue;
      const resolved = path.resolve(candidate);
      if (!resolved.startsWith(path.resolve(store.runsDir))) continue;
      if (!fs.existsSync(resolved)) continue;
      fs.rmSync(resolved, { recursive: true, force: true });
      deletedDirectories += 1;
    }
  }

  const deletedRuns = store.deleteRunsBefore ? await store.deleteRunsBefore(cutoffIso) : 0;
  return { cutoffIso, deletedRuns, deletedDirectories };
}
