import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { z } from 'zod';
import type { TestHubSpec, WebFlow, WebStep } from '../../shared/src/types.js';

const selectorSchema = z.union([
  z.string(),
  z
    .object({
      by: z.enum(['label', 'text', 'role', 'testId', 'css', 'placeholder']).optional(),
      target: z.string().optional(),
      value: z.string().optional(),
      role: z.string().optional(),
      name: z.string().optional(),
      exact: z.boolean().optional(),
      selector: z.string().optional(),
      text: z.string().optional(),
    })
    .passthrough(),
]);

const webStepSchema = z.union([
  z.object({ goto: z.string() }).strict(),
  z.object({ click: selectorSchema }).strict(),
  z.object({ fill: selectorSchema }).strict(),
  z.object({ select: selectorSchema }).strict(),
  z.object({ check: selectorSchema }).strict(),
  z.object({ press: z.union([selectorSchema, z.string()]) }).strict(),
  z.object({ waitFor: z.union([z.number(), z.string()]) }).strict(),
  z.object({ expectText: z.union([z.string(), selectorSchema]) }).strict(),
  z.object({ expectUrlContains: z.string() }).strict(),
  z.object({ expectVisible: selectorSchema }).strict(),
  z.object({ expectHidden: selectorSchema }).strict(),
  z.object({ expectAttribute: selectorSchema }).strict(),
  z.object({ expectValue: selectorSchema }).strict(),
  z.object({ expectCount: selectorSchema }).strict(),
  z.object({ uploadFile: selectorSchema }).strict(),
  z.object({ use: z.string().min(1), with: z.record(z.union([z.string(), z.number(), z.boolean()])).optional() }).strict(),
  z.object({
    extract: z.object({
      as: z.string().regex(/^[A-Z0-9_]+$/i),
      from: selectorSchema.optional(),
      property: z.enum(['text', 'value', 'url', 'attribute']),
      attribute: z.string().optional(),
    }).strict(),
  }).strict(),
]);

const webSpecSchema = z
  .object({
    version: z.number(),
    type: z.literal('web'),
    name: z.string().min(1),
    description: z.string().optional(),
    baseUrl: z.string().optional(),
    defaults: z
      .object({
        timeoutMs: z.number().int().positive().optional(),
        screenshotOnFailure: z.boolean().optional(),
        screenshotOnSuccess: z.boolean().optional(),
        video: z.union([z.boolean(), z.enum(['on', 'off', 'retain-on-failure'])]).optional(),
        trace: z.union([z.boolean(), z.enum(['on', 'off', 'retain-on-failure'])]).optional(),
        retries: z.number().int().min(0).optional(),
      })
      .optional(),
    variables: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
    flows: z.record(z.object({
      params: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
      steps: z.array(webStepSchema).min(1),
    }).strict()).optional(),
    beforeEach: z.array(webStepSchema).optional(),
    afterEach: z.array(webStepSchema).optional(),
    tests: z
      .array(
        z.object({
          name: z.string().min(1),
          tags: z.array(z.string()).optional(),
          timeoutMs: z.number().int().positive().optional(),
          skip: z.union([z.boolean(), z.string()]).optional(),
          only: z.boolean().optional(),
          retries: z.number().int().min(0).optional(),
          steps: z.array(webStepSchema).min(1),
        }),
      )
      .min(1),
  })
  .strict();

const apiExpectSchema = z
  .object({
    status: z.number().int().optional(),
    maxMs: z.number().int().positive().optional(),
    headers: z.record(z.string()).optional(),
    body: z.record(z.unknown()).optional(),
    bodyContains: z.unknown().optional(),
    bodyPathExists: z.array(z.string()).optional(),
    bodyPathMatches: z.record(z.string()).optional(),
    jsonSchema: z.record(z.unknown()).optional(),
  })
  .optional();

const apiRequestSchema = z.object({
  method: z.string().min(1),
  path: z.string().min(1),
  headers: z.record(z.string()).optional(),
  query: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
  body: z.unknown().optional(),
  expect: apiExpectSchema,
  extract: z.record(z.string()).optional(),
});

const apiSpecSchema = z
  .object({
    version: z.number(),
    type: z.literal('api'),
    name: z.string().min(1),
    description: z.string().optional(),
    baseUrl: z.string().optional(),
    defaults: z
      .object({
        timeoutMs: z.number().int().positive().optional(),
        retries: z.number().int().min(0).optional(),
      })
      .optional(),
    variables: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
    beforeEach: z.array(apiRequestSchema).optional(),
    afterEach: z.array(apiRequestSchema).optional(),
    tests: z
      .array(
        z.object({
          name: z.string().min(1),
          tags: z.array(z.string()).optional(),
          skip: z.union([z.boolean(), z.string()]).optional(),
          only: z.boolean().optional(),
          retries: z.number().int().min(0).optional(),
          request: apiRequestSchema,
          expect: apiExpectSchema,
          extract: z.record(z.string()).optional(),
        }),
      )
      .min(1),
  })
  .strict();

const specSchema = z.discriminatedUnion('type', [webSpecSchema, apiSpecSchema]);

export class SpecValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SpecValidationError';
  }
}

export function loadEnvFile(envFile?: string): Record<string, string> {
  if (!envFile) return {};
  const absolute = path.resolve(envFile);
  const content = fs.readFileSync(absolute, 'utf8');
  const env: Record<string, string> = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/g, '');
    env[key] = value;
  }
  return env;
}

export function parseSpecFile(specPath: string, options: { externalFlows?: Record<string, WebFlow> } = {}): TestHubSpec {
  const absolute = path.resolve(specPath);
  const raw = fs.readFileSync(absolute, 'utf8');
  return parseSpecContent(raw, options);
}

export function parseSpecContent(raw: string, options: { externalFlows?: Record<string, WebFlow> } = {}): TestHubSpec {
  const parsed = YAML.parse(raw) as unknown;
  const result = specSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
      .join('\n');
    throw new SpecValidationError(`Spec invalida:\n${issues}`);
  }
  if (result.data.type === 'web') validateWebFlows(result.data, options.externalFlows ?? {});
  return result.data as TestHubSpec;
}

function validateWebFlows(spec: Extract<TestHubSpec, { type: 'web' }>, externalFlows: Record<string, WebFlow>): void {
  const flows = spec.flows ?? {};
  const allFlows = { ...externalFlows, ...flows };
  const validateStep = (step: WebStep) => {
    if ('use' in step && !allFlows[step.use]) {
      throw new SpecValidationError(`Spec invalida:\nflow "${step.use}" nao encontrado`);
    }
    if ('extract' in step && step.extract.property === 'attribute' && !step.extract.attribute) {
      throw new SpecValidationError(`Spec invalida:\nextract "${step.extract.as}" com property attribute requer attribute`);
    }
    if ('extract' in step && step.extract.property !== 'url' && !step.extract.from) {
      throw new SpecValidationError(`Spec invalida:\nextract "${step.extract.as}" requer from para property ${step.extract.property}`);
    }
  };
  for (const step of [
    ...(spec.beforeEach ?? []),
    ...(spec.afterEach ?? []),
    ...spec.tests.flatMap((test) => test.steps),
    ...Object.values(allFlows).flatMap((flow) => flow.steps),
  ]) {
    validateStep(step);
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (name: string, path: string[]) => {
    if (visited.has(name)) return;
    if (visiting.has(name)) {
      throw new SpecValidationError(`Spec invalida:\nciclo em flows: ${[...path, name].join(' -> ')}`);
    }
    visiting.add(name);
    for (const step of allFlows[name]?.steps ?? []) {
      if ('use' in step) visit(step.use, [...path, name]);
    }
    visiting.delete(name);
    visited.add(name);
  };
  for (const name of Object.keys(allFlows)) visit(name, []);
}

export function resolveVariables<T>(value: T, env: Record<string, string | undefined>, options: { allowMissing?: boolean } = {}): T {
  if (typeof value === 'string') {
    return value.replace(/\$\{([A-Z0-9_]+)\}/gi, (_, key: string) => {
      const replacement = env[key];
      if (replacement === undefined) {
        if (options.allowMissing) return `\${${key}}`;
        throw new MissingVariableError(key);
      }
      return replacement;
    }) as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => resolveVariables(item, env, options)) as T;
  }
  if (value && typeof value === 'object') {
    const output: Record<string, unknown> = {};
    for (const [key, nestedValue] of Object.entries(value)) {
      output[key] = resolveVariables(nestedValue, env, options);
    }
    return output as T;
  }
  return value;
}

export function resolveVariablesWithContext<T>(
  value: T,
  env: Record<string, string | number | boolean | undefined>,
): T {
  return resolveVariables(value, Object.fromEntries(Object.entries(env).map(([key, nestedValue]) => [key, nestedValue === undefined ? undefined : String(nestedValue)])));
}

export class MissingVariableError extends Error {
  constructor(public readonly variableName: string) {
    super(`Variavel obrigatoria ausente: ${variableName}`);
    this.name = 'MissingVariableError';
  }
}
