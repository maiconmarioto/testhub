import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { RunOptions, RunReport, TestHubSpec } from '../../shared/src/types.js';
import { ensureDir } from '../../shared/src/fs-utils.js';
import { loadEnvFile, MissingVariableError, parseSpecContent, parseSpecFile, resolveVariables, SpecValidationError } from '../../spec/src/spec.js';
import { runApiSpec } from './api-runner.js';
import { runWebSpec } from './web-runner.js';
import { createRunReport } from './reporter.js';
import { ProgressTracker } from './progress.js';

export async function runSpec(options: RunOptions): Promise<RunReport> {
  const startedAt = new Date();
  const id = createRunId();
  const runDir = path.join(options.reportDir, id);
  ensureDir(runDir);

  const env = {
    ...process.env,
    ...loadEnvFile(options.envFile),
  };

  const externalFlows = options.externalFlows
    ? resolveVariables(options.externalFlows, env, { allowMissing: true })
    : undefined;
  const parsed = options.specContent !== undefined
    ? parseSpecContent(options.specContent, { externalFlows })
    : parseSpecFile(requiredSpecPath(options.specPath), { externalFlows });
  const withOverride = applyBaseUrlOverride(parsed, options.baseUrl);
  const spec = resolveVariables(withOverride, env, { allowMissing: true });
  const filteredSpec = filterSpec(spec, options.tags);
  const progress = new ProgressTracker(filteredSpec.tests.length, options.onProgress);
  await progress.phase('starting');

  const results =
    filteredSpec.type === 'api'
      ? await runApiSpec(filteredSpec, runDir, { progress })
      : await runWebSpec(filteredSpec, runDir, { headed: options.headed, externalFlows, progress });
  await progress.phase('artifacts');

  const finishedAt = new Date();
  const report = createRunReport({
    id,
    specPath: options.specPath ? path.resolve(options.specPath) : 'postgres:spec_content',
    spec: filteredSpec,
    baseUrl: filteredSpec.baseUrl,
    startedAt,
    finishedAt,
    results,
    runDir,
    writeHtml: !options.noHtml,
    writeJunit: options.junit,
  });
  await progress.phase('finished');
  return report;
}

export function validateSpec(specPath: string): TestHubSpec {
  return parseSpecFile(specPath);
}

function requiredSpecPath(specPath?: string): string {
  if (!specPath) throw new SpecValidationError('Spec path ausente');
  return specPath;
}

function applyBaseUrlOverride(spec: TestHubSpec, baseUrl?: string): TestHubSpec {
  if (!baseUrl) return spec;
  return { ...spec, baseUrl } as TestHubSpec;
}

function filterSpec(spec: TestHubSpec, tags?: string[]): TestHubSpec {
  const hasOnly = spec.tests.some((test) => test.only);
  const selected = spec.tests.filter((test) => {
    if (test.skip) return false;
    if (hasOnly && !test.only) return false;
    if (tags?.length) return tags.some((tag) => test.tags?.includes(tag));
    return true;
  });
  return { ...spec, tests: selected } as TestHubSpec;
}

function createRunId(): string {
  const now = new Date().toISOString().replace(/[:.]/g, '-');
  return `${now}-${randomUUID().slice(0, 8)}`;
}

export function getExitCodeForError(error: unknown): number {
  if (error instanceof SpecValidationError) return 2;
  if (error instanceof MissingVariableError) return 4;
  return 3;
}
