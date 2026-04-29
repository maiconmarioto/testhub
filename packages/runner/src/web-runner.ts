import fs from 'node:fs';
import path from 'node:path';
import { chromium, expect, type Browser, type BrowserContext, type Locator, type Page } from '@playwright/test';
import type { Artifact, SelectorInput, StepResult, TestResult, WebFlow, WebSpec, WebStep } from '../../shared/src/types.js';
import { ensureDir, sanitizeFilename } from '../../shared/src/fs-utils.js';
import { resolveVariablesWithContext } from '../../spec/src/spec.js';
import type { ProgressTracker } from './progress.js';

type RuntimeContext = Record<string, string | number | boolean | undefined>;

export async function runWebSpec(
  spec: WebSpec,
  runDir: string,
  options: { headed?: boolean; externalFlows?: Record<string, WebFlow>; progress?: ProgressTracker } = {},
): Promise<TestResult[]> {
  const results: TestResult[] = [];
  let browser: Browser | undefined;

  try {
    browser = await chromium.launch({ headless: !options.headed });

    for (const test of spec.tests) {
      await options.progress?.startTest(test.name);
      const started = Date.now();
      const testDir = path.join(runDir, sanitizeFilename(test.name));
      ensureDir(testDir);
      const artifacts: Artifact[] = [];
      const steps: StepResult[] = [];
      const consoleLogs: string[] = [];
      let context: BrowserContext | undefined;
      let page: Page | undefined;
      let status: TestResult['status'] = 'passed';
      let errorMessage: string | undefined;
      let failedStepIndex: number | undefined;

      try {
        const retries = test.retries ?? spec.defaults?.retries ?? 0;
        await runWithRetries(retries, async () => {
          status = 'passed';
          errorMessage = undefined;
          failedStepIndex = undefined;
          steps.length = 0;
          const videoMode = spec.defaults?.video ?? 'on';
          context = await browser!.newContext({
            recordVideo: shouldRecord(videoMode) ? { dir: testDir } : undefined,
          });
          context.setDefaultTimeout(test.timeoutMs ?? spec.defaults?.timeoutMs ?? 10_000);
          page = await context.newPage();
          page.on('console', (message) => {
            consoleLogs.push(`[${message.type()}] ${message.text()}`);
          });

          if (shouldRecord(spec.defaults?.trace ?? 'retain-on-failure')) {
            await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
          }

          const runtime: RuntimeContext = { ...(spec.variables ?? {}) };
          let stepIndex = 0;
          const executeSteps = async (inputSteps: WebStep[], prefix?: string, frame: RuntimeContext = runtime, depth = 0): Promise<void> => {
            if (depth > 20) throw new Error('Profundidade maxima de flows excedida');
            for (const rawStep of inputSteps) {
              if (failedStepIndex !== undefined) return;
              const step = resolveVariablesWithContext(rawStep, frame);
              if ('use' in step) {
                const flow = spec.flows?.[step.use] ?? options.externalFlows?.[step.use];
                if (!flow) throw new Error(`Flow nao encontrado: ${step.use}`);
                const flowFrame: RuntimeContext = {
                  ...runtime,
                  ...resolveVariablesWithContext(flow.params ?? {}, frame),
                  ...resolveVariablesWithContext(step.with ?? {}, frame),
                };
                await executeSteps(flow.steps, prefix ? `${prefix} / ${step.use}` : step.use, flowFrame, depth + 1);
                continue;
              }
              const currentIndex = stepIndex++;
              const stepName = describeStep(step, prefix);
              const stepStarted = Date.now();
              try {
                await options.progress?.startStep(stepName);
                const output = await runWebStep(page!, spec.baseUrl, step, test.timeoutMs ?? spec.defaults?.timeoutMs ?? 10_000);
                if (output?.extract) {
                  runtime[output.extract.name] = output.extract.value;
                  frame[output.extract.name] = output.extract.value;
                }
                await options.progress?.finishStep('passed', stepName);
                steps.push({
                  index: currentIndex,
                  name: stepName,
                  status: 'passed',
                  durationMs: Date.now() - stepStarted,
                });
              } catch (error) {
                status = 'failed';
                failedStepIndex = currentIndex;
                errorMessage = error instanceof Error ? error.message : String(error);
                await options.progress?.finishStep('failed', stepName);
                const stepArtifacts: Artifact[] = [];
                if (spec.defaults?.screenshotOnFailure !== false) {
                  const screenshotPath = path.join(testDir, `step-${currentIndex + 1}-failure.png`);
                  await page!.screenshot({ path: screenshotPath, fullPage: true });
                  const artifact = { type: 'screenshot' as const, path: screenshotPath, label: 'Failure screenshot' };
                  stepArtifacts.push(artifact);
                  artifacts.push(artifact);
                }
                steps.push({
                  index: currentIndex,
                  name: stepName,
                  status: 'failed',
                  durationMs: Date.now() - stepStarted,
                  error: errorMessage,
                  artifacts: stepArtifacts,
                });
                break;
              }
          }
        };
        await executeSteps([...(spec.beforeEach ?? []), ...test.steps, ...(spec.afterEach ?? [])]);
          if (failedStepIndex !== undefined && errorMessage) {
            throw new Error(errorMessage ?? 'Web test failed');
          }
          if (status === 'passed' && spec.defaults?.screenshotOnSuccess) {
            const screenshotPath = path.join(testDir, 'success.png');
            await page!.screenshot({ path: screenshotPath, fullPage: true });
            artifacts.push({ type: 'screenshot', path: screenshotPath, label: 'Success screenshot' });
          }
        });
      } catch (error) {
        if (failedStepIndex === undefined) {
          status = 'error';
          errorMessage = error instanceof Error ? error.message : String(error);
        }
      } finally {
        if (consoleLogs.length > 0) {
          const logPath = path.join(testDir, 'console.log');
          fs.writeFileSync(logPath, consoleLogs.join('\n'), 'utf8');
          artifacts.push({ type: 'log', path: logPath, label: 'Console logs' });
        }

        if (context) {
          const traceMode = spec.defaults?.trace ?? 'retain-on-failure';
          if (shouldRecord(traceMode)) {
            const tracePath = path.join(testDir, 'trace.zip');
            await context.tracing.stop({ path: tracePath });
            if (traceMode === true || traceMode === 'on' || status !== 'passed') {
              artifacts.push({ type: 'trace', path: tracePath, label: 'Playwright trace' });
            }
          }

          await context.close();

          const videoFiles = fs.existsSync(testDir)
            ? fs.readdirSync(testDir).filter((file) => file.endsWith('.webm'))
            : [];
          for (const file of videoFiles) {
            const videoPath = path.join(testDir, file);
            artifacts.push({ type: 'video', path: videoPath, label: 'Playwright video' });
          }
        }
      }

      results.push({
        name: test.name,
        status,
        durationMs: Date.now() - started,
        failedStepIndex,
        error: errorMessage,
        steps,
        artifacts,
        metadata: { tags: test.tags ?? [] },
      });
      await options.progress?.finishTest(status);
    }
  } finally {
    await browser?.close();
  }

  return results;
}

async function runWebStep(page: Page, baseUrl: string | undefined, step: WebStep, timeoutMs: number): Promise<{ extract?: { name: string; value: string } } | void> {
  if ('goto' in step) {
    if (!baseUrl && !/^https?:\/\//i.test(step.goto)) {
      throw new Error('baseUrl ausente. Use baseUrl no spec ou --base-url.');
    }
    const url = /^https?:\/\//i.test(step.goto) ? step.goto : new URL(step.goto, baseUrl).toString();
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    return;
  }
  if ('click' in step) {
    await locator(page, step.click).click();
    return;
  }
  if ('fill' in step) {
    const value = typeof step.fill === 'object' ? step.fill.value : undefined;
    if (value === undefined) throw new Error('fill.value ausente');
    await locator(page, step.fill).fill(value);
    return;
  }
  if ('select' in step) {
    const value = typeof step.select === 'object' ? step.select.value : undefined;
    if (value === undefined) throw new Error('select.value ausente');
    await locator(page, step.select).selectOption(value);
    return;
  }
  if ('check' in step) {
    await locator(page, step.check).check();
    return;
  }
  if ('press' in step) {
    if (typeof step.press === 'string') {
      await page.keyboard.press(step.press);
      return;
    }
    if (!step.press.key) throw new Error('press.key ausente');
    await locator(page, step.press).press(step.press.key);
    return;
  }
  if ('waitFor' in step) {
    if (typeof step.waitFor === 'number') {
      await page.waitForTimeout(step.waitFor);
    } else {
      await page.waitForLoadState(step.waitFor as Parameters<Page['waitForLoadState']>[0]);
    }
    return;
  }
  if ('expectText' in step) {
    const target = typeof step.expectText === 'string' ? page.getByText(step.expectText) : locator(page, step.expectText);
    await expect(target).toBeVisible({ timeout: timeoutMs });
    return;
  }
  if ('expectUrlContains' in step) {
    await expect(page).toHaveURL(new RegExp(escapeRegExp(step.expectUrlContains)), { timeout: timeoutMs });
    return;
  }
  if ('expectVisible' in step) {
    await expect(locator(page, step.expectVisible)).toBeVisible({ timeout: timeoutMs });
    return;
  }
  if ('expectHidden' in step) {
    await expect(locator(page, step.expectHidden)).toBeHidden({ timeout: timeoutMs });
    return;
  }
  if ('expectAttribute' in step) {
    if (!step.expectAttribute.attribute) throw new Error('expectAttribute.attribute ausente');
    if (step.expectAttribute.value === undefined) throw new Error('expectAttribute.value ausente');
    await expect(locator(page, step.expectAttribute)).toHaveAttribute(step.expectAttribute.attribute, step.expectAttribute.value, { timeout: timeoutMs });
    return;
  }
  if ('expectValue' in step) {
    if (step.expectValue.value === undefined) throw new Error('expectValue.value ausente');
    await expect(locator(page, step.expectValue)).toHaveValue(step.expectValue.value, { timeout: timeoutMs });
    return;
  }
  if ('expectCount' in step) {
    if (step.expectCount.count === undefined) throw new Error('expectCount.count ausente');
    await expect(locator(page, step.expectCount)).toHaveCount(step.expectCount.count, { timeout: timeoutMs });
    return;
  }
  if ('uploadFile' in step) {
    if (!step.uploadFile.path) throw new Error('uploadFile.path ausente');
    await locator(page, step.uploadFile).setInputFiles(step.uploadFile.path);
    return;
  }
  if ('extract' in step) {
    const value = await extractValue(page, step.extract, timeoutMs);
    return { extract: { name: step.extract.as, value } };
  }
}

function locator(page: Page, input: SelectorInput): Locator {
  if (typeof input === 'string') return page.locator(input);
  if (input.selector) return page.locator(input.selector);
  if (input.text) return page.getByText(input.text, { exact: input.exact });
  const target = input.target ?? input.name ?? input.value;
  switch (input.by) {
    case 'label':
      if (!target) throw new Error('selector label requer target');
      return page.getByLabel(target, { exact: input.exact });
    case 'text':
      if (!target) throw new Error('selector text requer target');
      return page.getByText(target, { exact: input.exact });
    case 'role':
      if (!input.role) throw new Error('selector role requer role');
      return page.getByRole(input.role as Parameters<Page['getByRole']>[0], { name: input.name ?? target, exact: input.exact });
    case 'testId':
      if (!target) throw new Error('selector testId requer target');
      return page.getByTestId(target);
    case 'css':
      if (!target) throw new Error('selector css requer target');
      return page.locator(target);
    case 'placeholder':
      if (!target) throw new Error('selector placeholder requer target');
      return page.getByPlaceholder(target, { exact: input.exact });
  }
  throw new Error('selector requer selector, text ou by');
}

async function extractValue(page: Page, input: Extract<WebStep, { extract: unknown }>['extract'], timeoutMs: number): Promise<string> {
  if (input.property === 'url') return page.url();
  if (!input.from) throw new Error(`extract.${input.property} requer from`);
  const target = locator(page, input.from);
  if (input.property === 'text') return (await target.textContent({ timeout: timeoutMs })) ?? '';
  if (input.property === 'value') return await target.inputValue({ timeout: timeoutMs });
  if (input.property === 'attribute') {
    if (!input.attribute) throw new Error('extract.attribute requer attribute');
    return (await target.getAttribute(input.attribute, { timeout: timeoutMs })) ?? '';
  }
  return '';
}

function describeStep(step: WebStep, prefix?: string): string {
  const [key, value] = Object.entries(step)[0] ?? ['step', ''];
  const label = `${key}: ${typeof value === 'string' ? value : JSON.stringify(value)}`;
  return prefix ? `${prefix} / ${label}` : label;
}

function shouldRecord(value: WebSpec['defaults'] extends infer D ? D extends { video?: infer V } ? V : never : never): boolean {
  return value === true || value === 'on' || value === 'retain-on-failure';
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
