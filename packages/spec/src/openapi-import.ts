import YAML from 'yaml';

const methods = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options']);

export function openApiToSuite(input: unknown, name = 'openapi-import'): string {
  const spec = input as { paths?: Record<string, Record<string, unknown>> };
  if (!spec.paths || typeof spec.paths !== 'object') throw new Error('OpenAPI invalido: paths ausente');

  const tests = Object.entries(spec.paths).flatMap(([rawPath, operations]) => {
    if (!operations || typeof operations !== 'object') return [];
    return Object.entries(operations)
      .filter(([method]) => methods.has(method.toLowerCase()))
      .map(([method, operation]) => {
        const op = operation as { summary?: string; operationId?: string; responses?: Record<string, unknown> };
        const status = firstSuccessStatus(op.responses);
        return {
          name: op.operationId ?? op.summary ?? `${method.toUpperCase()} ${rawPath}`,
          request: {
            method: method.toUpperCase(),
            path: samplePath(rawPath),
          },
          expect: { status },
        };
      });
  });

  if (tests.length === 0) throw new Error('OpenAPI sem operacoes HTTP importaveis');
  return YAML.stringify({ version: 1, type: 'api', name, tests });
}

function firstSuccessStatus(responses?: Record<string, unknown>): number {
  const key = Object.keys(responses ?? {}).find((status) => /^2\d\d$/.test(status));
  return key ? Number(key) : 200;
}

function samplePath(rawPath: string): string {
  return rawPath.replace(/\{[^}]+}/g, '1');
}
