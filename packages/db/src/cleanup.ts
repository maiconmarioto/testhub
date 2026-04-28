import type { Store } from './store.js';

export interface CleanupResult {
  cutoffIso: string;
  archivedRuns: number;
  retainedArtifacts: boolean;
  projectId?: string;
  days: number;
}

export async function cleanupOldRuns(store: Store, days: number, options: { projectId?: string; cleanupArtifacts?: boolean } = {}): Promise<CleanupResult> {
  if (!Number.isFinite(days) || days < 1) throw new Error('days deve ser maior que zero');
  const cutoffIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const archivedRuns = store.archiveRunsBefore ? await store.archiveRunsBefore(cutoffIso, options) : 0;
  return { cutoffIso, archivedRuns, retainedArtifacts: !options.cleanupArtifacts, projectId: options.projectId, days };
}
