import YAML from 'yaml';

const methods = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options']);

export interface OpenApiImportOptions {
  baseUrl?: string;
  headers?: Record<string, string>;
  authTemplate?: 'none' | 'bearer' | 'apiKey';
  selectedOperations?: string[];
  tags?: string[];
  includeBodyExamples?: boolean;
}

export function openApiToSuite(input: unknown, name = 'openapi-import', options: OpenApiImportOptions = {}): string {
  const spec = input as { servers?: Array<{ url?: string }>; paths?: Record<string, Record<string, unknown>> };
  if (!spec.paths || typeof spec.paths !== 'object') throw new Error('OpenAPI invalido: paths ausente');
  const selected = new Set(options.selectedOperations ?? []);
  const selectedTags = new Set(options.tags ?? []);
  const defaultHeaders = headersFor(options);

  const tests = Object.entries(spec.paths).flatMap(([rawPath, operations]) => {
    if (!operations || typeof operations !== 'object') return [];
    return Object.entries(operations)
      .filter(([method]) => methods.has(method.toLowerCase()))
      .filter(([method, operation]) => {
        const op = operation as { operationId?: string; tags?: string[] };
        const operationKey = `${method.toUpperCase()} ${rawPath}`;
        if (selected.size > 0 && !selected.has(operationKey) && (!op.operationId || !selected.has(op.operationId))) return false;
        if (selectedTags.size > 0 && !(op.tags ?? []).some((tag) => selectedTags.has(tag))) return false;
        return true;
      })
      .map(([method, operation]) => {
        const op = operation as {
          summary?: string;
          operationId?: string;
          tags?: string[];
          parameters?: Array<{ name?: string; in?: string; example?: unknown; schema?: { default?: unknown; example?: unknown; enum?: unknown[]; type?: string } }>;
          requestBody?: { content?: Record<string, { example?: unknown; examples?: Record<string, { value?: unknown }>; schema?: { example?: unknown; properties?: Record<string, { example?: unknown; default?: unknown; type?: string }> } }> };
          responses?: Record<string, unknown>;
        };
        const status = firstSuccessStatus(op.responses);
        const request: Record<string, unknown> = {
          method: method.toUpperCase(),
          path: samplePath(rawPath, op.parameters),
        };
        const query = queryParams(op.parameters);
        const body = options.includeBodyExamples === false ? undefined : bodyExample(op.requestBody);
        if (Object.keys(defaultHeaders).length > 0) request.headers = defaultHeaders;
        if (Object.keys(query).length > 0) request.query = query;
        if (body !== undefined) request.body = body;
        return {
          name: op.operationId ?? op.summary ?? `${method.toUpperCase()} ${rawPath}`,
          tags: op.tags,
          request,
          expect: { status },
        };
      });
  });

  if (tests.length === 0) throw new Error('OpenAPI sem operacoes HTTP importaveis');
  return YAML.stringify({ version: 1, type: 'api', name, baseUrl: options.baseUrl ?? spec.servers?.[0]?.url, tests });
}

function firstSuccessStatus(responses?: Record<string, unknown>): number {
  const key = Object.keys(responses ?? {}).find((status) => /^2\d\d$/.test(status));
  return key ? Number(key) : 200;
}

function samplePath(rawPath: string, parameters: Array<{ name?: string; in?: string; example?: unknown; schema?: { default?: unknown; example?: unknown; enum?: unknown[]; type?: string } }> = []): string {
  return rawPath.replace(/\{([^}]+)}/g, (_, name: string) => encodeURIComponent(String(sampleValue(parameters.find((param) => param.in === 'path' && param.name === name)))));
}

function queryParams(parameters: Array<{ name?: string; in?: string; example?: unknown; schema?: { default?: unknown; example?: unknown; enum?: unknown[]; type?: string } }> = []): Record<string, string | number | boolean> {
  return Object.fromEntries(parameters
    .filter((param) => param.in === 'query' && param.name)
    .map((param) => [param.name!, sampleValue(param)]));
}

function bodyExample(requestBody?: { content?: Record<string, { example?: unknown; examples?: Record<string, { value?: unknown }>; schema?: { example?: unknown; properties?: Record<string, { example?: unknown; default?: unknown; type?: string }> } }> }): unknown {
  const content = requestBody?.content;
  if (!content) return undefined;
  const media = content['application/json'] ?? Object.values(content)[0];
  if (!media) return undefined;
  if (media.example !== undefined) return media.example;
  const firstExample = media.examples ? Object.values(media.examples)[0]?.value : undefined;
  if (firstExample !== undefined) return firstExample;
  if (media.schema?.example !== undefined) return media.schema.example;
  if (media.schema?.properties) {
    return Object.fromEntries(Object.entries(media.schema.properties).map(([key, schema]) => [key, schema.example ?? schema.default ?? sampleValue({ schema })]));
  }
  return undefined;
}

function sampleValue(param: { example?: unknown; schema?: { default?: unknown; example?: unknown; enum?: unknown[]; type?: string } } | undefined): string | number | boolean {
  if (!param) return '1';
  if (param.example !== undefined) return primitive(param.example);
  if (param.schema?.example !== undefined) return primitive(param.schema.example);
  if (param.schema?.default !== undefined) return primitive(param.schema.default);
  if (param.schema?.enum?.[0] !== undefined) return primitive(param.schema.enum[0]);
  if (param.schema?.type === 'number' || param.schema?.type === 'integer') return 1;
  if (param.schema?.type === 'boolean') return true;
  return '1';
}

function primitive(value: unknown): string | number | boolean {
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  return String(value);
}

function headersFor(options: OpenApiImportOptions): Record<string, string> {
  const headers = { ...(options.headers ?? {}) };
  if (options.authTemplate === 'bearer') headers.Authorization = headers.Authorization ?? 'Bearer ${API_TOKEN}';
  if (options.authTemplate === 'apiKey') headers['x-api-key'] = headers['x-api-key'] ?? '${API_KEY}';
  return headers;
}
