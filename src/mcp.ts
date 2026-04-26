#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const TESTHUB_URL = process.env.TESTHUB_URL ?? 'http://localhost:4321';
const TESTHUB_TOKEN = process.env.TESTHUB_TOKEN;

const server = new McpServer({
  name: 'testhub-mcp',
  version: '0.1.0',
});

server.tool('testhub_list_projects', 'Lista projetos do TestHub', {}, async () => {
  return text(await api('/api/projects'));
});

server.tool('testhub_create_project', 'Cria projeto no TestHub', {
  name: z.string(),
  description: z.string().optional(),
}, async (input) => {
  return text(await api('/api/projects', { method: 'POST', body: JSON.stringify(input) }));
});

server.tool('testhub_list_environments', 'Lista ambientes, opcionalmente por projeto', {
  projectId: z.string().optional(),
}, async ({ projectId }) => {
  return text(await api(`/api/environments${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`));
});

server.tool('testhub_create_environment', 'Cria ambiente de projeto', {
  projectId: z.string(),
  name: z.string(),
  baseUrl: z.string(),
  variables: z.record(z.string()).optional(),
}, async (input) => {
  return text(await api('/api/environments', { method: 'POST', body: JSON.stringify(input) }));
});

server.tool('testhub_list_suites', 'Lista suites, opcionalmente por projeto', {
  projectId: z.string().optional(),
}, async ({ projectId }) => {
  return text(await api(`/api/suites${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`));
});

server.tool('testhub_create_suite', 'Cria suite YAML no TestHub', {
  projectId: z.string(),
  name: z.string(),
  type: z.enum(['web', 'api']),
  specContent: z.string(),
}, async (input) => {
  return text(await api('/api/suites', { method: 'POST', body: JSON.stringify(input) }));
});

server.tool('testhub_import_openapi', 'Importa OpenAPI JSON como suite API basica', {
  projectId: z.string(),
  name: z.string(),
  spec: z.record(z.unknown()),
}, async (input) => {
  return text(await api('/api/import/openapi', { method: 'POST', body: JSON.stringify(input) }));
});

server.tool('testhub_run_suite', 'Dispara execucao de suite', {
  projectId: z.string(),
  environmentId: z.string(),
  suiteId: z.string(),
}, async (input) => {
  return text(await api('/api/runs', { method: 'POST', body: JSON.stringify(input) }));
});

server.tool('testhub_get_run_status', 'Consulta status de run', {
  runId: z.string(),
}, async ({ runId }) => {
  return text(await api(`/api/runs/${encodeURIComponent(runId)}`));
});

server.tool('testhub_cancel_run', 'Cancela run em fila ou em execucao', {
  runId: z.string(),
}, async ({ runId }) => {
  return text(await api(`/api/runs/${encodeURIComponent(runId)}/cancel`, { method: 'POST', body: '{}' }));
});

server.tool('testhub_get_run_report', 'Busca report JSON de run', {
  runId: z.string(),
}, async ({ runId }) => {
  return text(await api(`/api/runs/${encodeURIComponent(runId)}/report`));
});

server.tool('testhub_wait_run', 'Aguarda run terminar por polling', {
  runId: z.string(),
  timeoutMs: z.number().default(120000),
}, async ({ runId, timeoutMs }) => {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const run = await api(`/api/runs/${encodeURIComponent(runId)}`) as { status?: string };
    if (run.status && !['queued', 'running'].includes(run.status)) return text(run);
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  throw new Error(`Timeout aguardando run ${runId}`);
});

server.tool('testhub_get_artifacts', 'Lista artifacts do report da run', {
  runId: z.string(),
}, async ({ runId }) => {
  const report = await api(`/api/runs/${encodeURIComponent(runId)}/report`) as { artifacts?: unknown; results?: Array<{ artifacts?: unknown }> };
  return text({
    runArtifacts: report.artifacts ?? [],
    testArtifacts: report.results?.flatMap((result) => result.artifacts ?? []) ?? [],
  });
});

server.tool('testhub_explain_failure', 'Explica falha usando AI connection configurada no TestHub', {
  connectionId: z.string().optional(),
  context: z.record(z.unknown()),
}, async (input) => {
  return text(await api('/api/ai/explain-failure', { method: 'POST', body: JSON.stringify(input) }));
});

server.tool('testhub_cleanup', 'Remove runs antigas e artifacts locais', {
  days: z.number().int().min(1).default(30),
}, async (input) => {
  return text(await api('/api/cleanup', { method: 'POST', body: JSON.stringify(input) }));
});

async function api(path: string, options: RequestInit = {}): Promise<unknown> {
  const response = await fetch(`${TESTHUB_URL}${path}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(TESTHUB_TOKEN ? { authorization: `Bearer ${TESTHUB_TOKEN}` } : {}),
      ...(options.headers ?? {}),
    },
  });
  const body = await response.text();
  if (!response.ok) throw new Error(body);
  return body ? JSON.parse(body) : null;
}

function text(value: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }],
  };
}

await server.connect(new StdioServerTransport());
