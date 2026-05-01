import fs from 'node:fs';
import path from 'node:path';
import type { Store } from '../../../packages/db/src/store.js';
import { runSpec } from '../../../packages/runner/src/runner.js';
import { uploadRunArtifacts } from '../../../packages/artifacts/src/artifact-store.js';
import type { RunProgress } from '../../../packages/shared/src/types.js';

export async function executeRun(store: Store, runId: string): Promise<void> {
  const db = await store.read();
  const run = db.runs.find((item) => item.id === runId);
  if (!run) return;
  if (run.status === 'canceled' || run.status === 'deleted') return;
  const environment = db.environments.find((item) => item.id === run.environmentId);
  const suite = await store.getSuiteContent(run.suiteId);
  const project = db.projects.find((item) => item.id === run.projectId);
  if (!environment || !suite || environment.status === 'inactive' || suite.status === 'inactive') {
    await store.updateRun(runId, { status: 'error', error: 'Environment ou suite nao encontrado', finishedAt: new Date().toISOString() });
    return;
  }
  await store.updateRun(runId, { status: 'running', startedAt: new Date().toISOString(), heartbeatAt: new Date().toISOString() });
  const envFile = path.join(store.runsDir, `${runId}.env`);
  fs.mkdirSync(store.runsDir, { recursive: true });
  const variables = await store.getEnvironmentVariables(run.environmentId);
  const flowLibrary = project ? (await store.listFlowsForOrganization(project.organizationId))
    .filter((flow) => !flow.projectIds?.length || flow.projectIds.includes(project.id)) : [];
  const externalFlows = Object.fromEntries(flowLibrary.map((flow) => [`${flow.namespace}.${flow.name}`, { params: flow.params, steps: flow.steps }]));
  fs.writeFileSync(envFile, Object.entries(variables).map(([key, value]) => `${key}=${value}`).join('\n'), 'utf8');
  const persistProgress = createProgressPersister(store, runId);
  try {
    const report = await withRunTimeout(runSpec({
      specPath: suite.specPath,
      specContent: suite.specContent,
      baseUrl: environment.baseUrl,
      reportDir: path.join(store.runsDir, runId),
      envFile,
      externalFlows,
      junit: true,
      onProgress: persistProgress,
    }));
    const latest = (await store.read()).runs.find((item) => item.id === runId);
    if (latest?.status === 'canceled' || latest?.status === 'deleted') return;
    const status = report.summary.error > 0 ? 'error' : report.summary.failed > 0 ? 'failed' : 'passed';
    await persistProgress({
      phase: 'artifacts',
      totalTests: report.summary.total,
      completedTests: report.summary.total,
      passed: report.summary.passed,
      failed: report.summary.failed,
      error: report.summary.error,
      updatedAt: new Date().toISOString(),
    }, true);
    const uploadedArtifacts = await uploadRunArtifacts(path.join(store.runsDir, runId, report.id));
    const finishedAt = new Date().toISOString();
    await store.updateRun(runId, {
      status,
      finishedAt,
      reportPath: path.join(store.runsDir, runId, report.id, 'report.json'),
      reportHtmlPath: path.join(store.runsDir, runId, report.id, 'report.html'),
      summary: { ...report.summary, uploadedArtifacts },
      progress: {
        phase: status === 'passed' ? 'finished' : status,
        totalTests: report.summary.total,
        completedTests: report.summary.total,
        passed: report.summary.passed,
        failed: report.summary.failed,
        error: report.summary.error,
        updatedAt: finishedAt,
      },
      heartbeatAt: finishedAt,
    });
  } catch (error) {
    const latest = (await store.read()).runs.find((item) => item.id === runId);
    if (latest?.status === 'canceled' || latest?.status === 'deleted') return;
    const finishedAt = new Date().toISOString();
    await store.updateRun(runId, {
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
      finishedAt,
      progress: {
        phase: 'error',
        totalTests: 0,
        completedTests: 0,
        passed: 0,
        failed: 0,
        error: 1,
        updatedAt: finishedAt,
      },
      heartbeatAt: finishedAt,
    });
  }
}

function createProgressPersister(store: Store, runId: string) {
  let lastWrite = 0;
  let pending: Promise<unknown> = Promise.resolve();
  return async (progress: RunProgress, force = false) => {
    const now = Date.now();
    if (!force && now - lastWrite < 1000) return;
    lastWrite = now;
    pending = pending.catch(() => undefined).then(() => store.updateRun(runId, {
      progress,
      heartbeatAt: new Date().toISOString(),
    }));
    await pending;
  };
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
