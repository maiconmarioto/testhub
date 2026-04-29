import fs from 'node:fs';
import path from 'node:path';
import { Ajv } from 'ajv';
import type { ApiRequestStep, ApiSpec, Artifact, StepResult, TestResult } from '../../shared/src/types.js';
import { ensureDir, sanitizeFilename, writeJson } from '../../shared/src/fs-utils.js';
import { redactDeep } from '../../shared/src/redact.js';
import { MissingVariableError, resolveVariablesWithContext } from '../../spec/src/spec.js';
import type { ProgressTracker } from './progress.js';

export async function runApiSpec(spec: ApiSpec, runDir: string, options: { progress?: ProgressTracker } = {}): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const ajv = new Ajv({ allErrors: true, strict: false });
  const runtime: Record<string, string | number | boolean | undefined> = {
    ...(spec.variables ?? {}),
  };

  for (const test of spec.tests) {
    await options.progress?.startTest(test.name);
    const started = Date.now();
    const artifacts: Artifact[] = [];
    const steps: StepResult[] = [];
    let failedStepIndex: number | undefined;
    const testDir = path.join(runDir, sanitizeFilename(test.name));
    ensureDir(testDir);
    const retries = test.retries ?? spec.defaults?.retries ?? 0;

    try {
      await runWithRetries(retries, async () => {
        for (const [index, beforeStep] of (spec.beforeEach ?? []).entries()) {
          await executeApiProgressStep({ step: beforeStep, spec, testDir, artifacts, ajv, runtime, label: `beforeEach-${index + 1}`, steps, progress: options.progress });
        }
        await executeApiProgressStep({
          step: { ...test.request, expect: test.expect, extract: test.extract ?? test.request.extract },
          spec,
          testDir,
          artifacts,
          ajv,
          runtime,
          label: 'request',
          steps,
          progress: options.progress,
        });
        for (const [index, afterStep] of (spec.afterEach ?? []).entries()) {
          await executeApiProgressStep({ step: afterStep, spec, testDir, artifacts, ajv, runtime, label: `afterEach-${index + 1}`, steps, progress: options.progress });
        }
      });
      results.push({
        name: test.name,
        status: 'passed',
        durationMs: Date.now() - started,
        steps,
        artifacts,
        metadata: { tags: test.tags ?? [] },
      });
      await options.progress?.finishTest('passed');
    } catch (error) {
      const status = isApiRuntimeError(error) ? 'error' : 'failed';
      failedStepIndex = steps.find((step) => step.status !== 'passed')?.index;
      results.push({
        name: test.name,
        status,
        durationMs: Date.now() - started,
        failedStepIndex,
        error: error instanceof Error ? error.message : String(error),
        steps,
        artifacts,
        metadata: { tags: test.tags ?? [] },
      });
      await options.progress?.finishTest(status);
    }
  }

  return results;
}

async function executeApiProgressStep(input: {
  step: ApiRequestStep;
  spec: ApiSpec;
  testDir: string;
  artifacts: Artifact[];
  ajv: InstanceType<typeof Ajv>;
  runtime: Record<string, string | number | boolean | undefined>;
  label: string;
  steps: StepResult[];
  progress?: ProgressTracker;
}): Promise<void> {
  const index = input.steps.length;
  const started = Date.now();
  await input.progress?.startStep(input.label);
  try {
    await executeApiStep(input);
    input.steps.push({ index, name: input.label, status: 'passed', durationMs: Date.now() - started });
    await input.progress?.finishStep('passed', input.label);
  } catch (error) {
    const status = isApiRuntimeError(error) ? 'error' : 'failed';
    const message = error instanceof Error ? error.message : String(error);
    input.steps.push({ index, name: input.label, status, durationMs: Date.now() - started, error: message });
    await input.progress?.finishStep(status, input.label);
    throw error;
  }
}

async function executeApiStep(input: {
  step: ApiRequestStep;
  spec: ApiSpec;
  testDir: string;
  artifacts: Artifact[];
  ajv: InstanceType<typeof Ajv>;
  runtime: Record<string, string | number | boolean | undefined>;
  label: string;
}): Promise<void> {
  const { spec, testDir, artifacts, ajv, runtime, label } = input;
  const step = resolveVariablesWithContext(input.step, runtime);
  const baseUrl = spec.baseUrl;
  if (!baseUrl) throw new Error('baseUrl ausente. Use baseUrl no spec ou --base-url.');

  const url = new URL(step.path, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
  for (const [key, value] of Object.entries(step.query ?? {})) {
    url.searchParams.set(key, String(value));
  }

  const timeoutMs = step.expect?.maxMs ?? spec.defaults?.timeoutMs ?? 10_000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const requestBody = step.body === undefined ? undefined : JSON.stringify(step.body);
  const requestStarted = Date.now();

  try {
    const response = await fetch(url, {
      method: step.method.toUpperCase(),
      headers: {
        ...(requestBody ? { 'content-type': 'application/json' } : {}),
        ...(step.headers ?? {}),
      },
      body: requestBody,
      signal: controller.signal,
    }).catch((error: unknown) => {
      throw new ApiRuntimeError(error instanceof Error ? error.message : String(error));
    });
    clearTimeout(timeout);

    const durationMs = Date.now() - requestStarted;
    const rawText = await response.text();
    const contentType = response.headers.get('content-type') ?? '';
    const body = parseResponseBody(rawText, contentType);
    const headers = Object.fromEntries(response.headers.entries());
    const requestDump = redactDeep({
      method: step.method.toUpperCase(),
      url: url.toString(),
      headers: step.headers ?? {},
      body: step.body,
    });
    const responseDump = redactDeep({
      status: response.status,
      headers,
      body,
      durationMs,
    });

    const requestPath = path.join(testDir, `${label}-request.json`);
    const responsePath = path.join(testDir, `${label}-response.json`);
    writeJson(requestPath, requestDump);
    writeJson(responsePath, responseDump);
    artifacts.push({ type: 'request', path: requestPath, label: `${label} request` });
    artifacts.push({ type: 'response', path: responsePath, label: `${label} response` });

    assertApiExpectations({
      expected: step.expect,
      status: response.status,
      headers,
      body,
      durationMs,
      ajv,
    });

    for (const [key, expression] of Object.entries(step.extract ?? {})) {
      const extracted = getPathFromExpression({ body, headers, status: response.status }, expression);
      if (typeof extracted === 'object') {
        runtime[key] = JSON.stringify(extracted);
      } else if (extracted !== undefined && extracted !== null) {
        runtime[key] = String(extracted);
      } else {
        throw new Error(`extract ${key} nao encontrou valor em ${expression}`);
      }
    }
  } finally {
    clearTimeout(timeout);
  }
}

class ApiRuntimeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApiRuntimeError';
  }
}

function isApiRuntimeError(error: unknown): boolean {
  return error instanceof ApiRuntimeError || error instanceof MissingVariableError;
}

function parseResponseBody(rawText: string, contentType: string): unknown {
  if (!rawText) return null;
  if (contentType.includes('application/json')) {
    try {
      return JSON.parse(rawText);
    } catch {
      return rawText;
    }
  }
  try {
    return JSON.parse(rawText);
  } catch {
    return rawText;
  }
}

function assertApiExpectations(input: {
  expected: ApiSpec['tests'][number]['expect'];
  status: number;
  headers: Record<string, string>;
  body: unknown;
  durationMs: number;
  ajv: InstanceType<typeof Ajv>;
}): void {
  const { expected, status, headers, body, durationMs, ajv } = input;
  if (!expected) return;

  if (expected.status !== undefined && status !== expected.status) {
    throw new Error(`Status esperado ${expected.status}, recebido ${status}`);
  }

  if (expected.maxMs !== undefined && durationMs > expected.maxMs) {
    throw new Error(`Tempo esperado <= ${expected.maxMs}ms, recebido ${durationMs}ms`);
  }

  for (const [key, expectedValue] of Object.entries(expected.headers ?? {})) {
    const actual = headers[key.toLowerCase()] ?? headers[key];
    if (actual !== expectedValue) {
      throw new Error(`Header ${key} esperado "${expectedValue}", recebido "${actual ?? '<ausente>'}"`);
    }
  }

  for (const [key, expectedValue] of Object.entries(expected.body ?? {})) {
    const actual = getPath(body, key);
    if (actual !== expectedValue) {
      throw new Error(`Body ${key} esperado ${JSON.stringify(expectedValue)}, recebido ${JSON.stringify(actual)}`);
    }
  }

  if (expected.bodyContains !== undefined && !containsValue(body, expected.bodyContains)) {
    throw new Error(`Body nao contem ${JSON.stringify(expected.bodyContains)}`);
  }

  for (const expression of expected.bodyPathExists ?? []) {
    if (getPath(body, expression) === undefined) {
      throw new Error(`Body path ausente: ${expression}`);
    }
  }

  for (const [expression, pattern] of Object.entries(expected.bodyPathMatches ?? {})) {
    const actual = getPath(body, expression);
    if (actual === undefined || !new RegExp(pattern).test(String(actual))) {
      throw new Error(`Body ${expression} nao corresponde a /${pattern}/. Recebido ${JSON.stringify(actual)}`);
    }
  }

  if (expected.jsonSchema) {
    const validate = ajv.compile(expected.jsonSchema);
    const valid = validate(body);
    if (!valid) {
      throw new Error(`JSON schema invalido: ${ajv.errorsText(validate.errors, { separator: '; ' })}`);
    }
  }
}

function getPath(value: unknown, dottedPath: string): unknown {
  return dottedPath.split('.').reduce<unknown>((current, key) => {
    if (current && typeof current === 'object' && key in current) {
      return (current as Record<string, unknown>)[key];
    }
    return undefined;
  }, value);
}

function getPathFromExpression(source: { body: unknown; headers: Record<string, string>; status: number }, expression: string): unknown {
  if (expression === 'status') return source.status;
  if (expression.startsWith('body.')) return getPath(source.body, expression.slice('body.'.length));
  if (expression === 'body') return source.body;
  if (expression.startsWith('headers.')) return source.headers[expression.slice('headers.'.length).toLowerCase()];
  return getPath(source.body, expression);
}

function containsValue(body: unknown, expected: unknown): boolean {
  if (typeof expected === 'object' && expected !== null && typeof body === 'object' && body !== null) {
    return Object.entries(expected as Record<string, unknown>).every(([key, value]) => {
      const actual = (body as Record<string, unknown>)[key];
      return containsValue(actual, value);
    });
  }
  if (Array.isArray(body)) return body.some((item) => containsValue(item, expected));
  return body === expected;
}

async function runWithRetries(retries: number, operation: () => Promise<void>): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      await operation();
      return;
    } catch (error) {
      lastError = error;
      if (attempt === retries) break;
    }
  }
  throw lastError;
}

export function writeApiArtifact(filePath: string, data: unknown): Artifact {
  fs.writeFileSync(filePath, JSON.stringify(redactDeep(data), null, 2), 'utf8');
  return { type: 'json', path: filePath };
}
