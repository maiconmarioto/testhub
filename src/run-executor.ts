import fs from 'node:fs';
import path from 'node:path';
import type { Store } from './store.js';
import { runSpec } from './runner.js';
import { uploadRunArtifacts } from './artifact-store.js';

export async function executeRun(store: Store, runId: string): Promise<void> {
  const db = await store.read();
  const run = db.runs.find((item) => item.id === runId);
  if (!run) return;
  if (run.status === 'canceled') return;
  const environment = db.environments.find((item) => item.id === run.environmentId);
  const suite = db.suites.find((item) => item.id === run.suiteId);
  if (!environment || !suite) {
    await store.updateRun(runId, { status: 'error', error: 'Environment ou suite nao encontrado', finishedAt: new Date().toISOString() });
    return;
  }
  await store.updateRun(runId, { status: 'running', startedAt: new Date().toISOString() });
  const envFile = path.join(store.runsDir, `${runId}.env`);
  const variables = await store.getEnvironmentVariables(run.environmentId);
  fs.writeFileSync(envFile, Object.entries(variables).map(([key, value]) => `${key}=${value}`).join('\n'), 'utf8');
  try {
    const report = await withRunTimeout(runSpec({
      specPath: suite.specPath,
      baseUrl: environment.baseUrl,
      reportDir: path.join(store.runsDir, runId),
      envFile,
      junit: true,
    }));
    const latest = (await store.read()).runs.find((item) => item.id === runId);
    if (latest?.status === 'canceled') return;
    const failed = report.summary.failed + report.summary.error;
    const uploadedArtifacts = await uploadRunArtifacts(path.join(store.runsDir, runId, report.id));
    await store.updateRun(runId, {
      status: failed > 0 ? 'failed' : 'passed',
      finishedAt: new Date().toISOString(),
      reportPath: path.join(store.runsDir, runId, report.id, 'report.json'),
      reportHtmlPath: path.join(store.runsDir, runId, report.id, 'report.html'),
      summary: { ...report.summary, uploadedArtifacts },
    });
  } catch (error) {
    await store.updateRun(runId, {
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
      finishedAt: new Date().toISOString(),
    });
  }
}

async function withRunTimeout<T>(promise: Promise<T>): Promise<T> {
  const timeoutMs = Number(process.env.TESTHUB_RUN_TIMEOUT_MS ?? 0);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return promise;
  let timeout: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error(`Run excedeu timeout de ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
