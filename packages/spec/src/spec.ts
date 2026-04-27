import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { z } from 'zod';
import type { TestHubSpec } from '../../shared/src/types.js';

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

export function parseSpecFile(specPath: string): TestHubSpec {
  const absolute = path.resolve(specPath);
  const raw = fs.readFileSync(absolute, 'utf8');
  const parsed = YAML.parse(raw) as unknown;
  const result = specSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
      .join('\n');
    throw new SpecValidationError(`Spec invalida:\n${issues}`);
  }
  return result.data as TestHubSpec;
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
