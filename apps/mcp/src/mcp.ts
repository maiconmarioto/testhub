#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const TESTHUB_URL = process.env.TESTHUB_URL ?? 'http://localhost:4321';
const TESTHUB_TOKEN = process.env.TESTHUB_TOKEN ?? process.env.TESTHUB_PAT ?? process.env.TESTHUB_SESSION_TOKEN;
const TESTHUB_ORGANIZATION_ID = process.env.TESTHUB_ORGANIZATION_ID;

type EnvironmentSummary = {
  id: string;
  projectId: string;
  name: string;
  baseUrl: string;
};

const server = new McpServer({
  name: 'testhub-mcp',
  version: '0.1.0',
});

const commandCatalog = {
  project: ['testhub_list_projects', 'testhub_create_project', 'testhub_get_project', 'testhub_update_project', 'testhub_archive_project'],
  environment: ['testhub_list_environments', 'testhub_create_environment', 'testhub_update_environment', 'testhub_archive_environment', 'testhub_get_environment', 'testhub_list_envs', 'testhub_create_env', 'list_environments', 'create_environment', 'get_environment'],
  suite: ['testhub_list_suites', 'testhub_create_suite', 'testhub_get_suite', 'testhub_update_suite', 'testhub_validate_spec', 'testhub_get_spec_examples'],
  flow: ['testhub_list_flows', 'testhub_get_flow', 'testhub_create_flow', 'testhub_update_flow', 'testhub_archive_flow'],
  run: ['testhub_get_test_context', 'testhub_list_runs', 'testhub_run_suite', 'testhub_get_run_status', 'testhub_wait_run', 'testhub_get_run_report', 'testhub_get_artifacts', 'testhub_cancel_run'],
};

const specExamples = {
  api: String.raw`version: 1
type: api
name: health
tests:
  - name: status 200
    request:
      method: GET
      path: /status/200
    expect:
      status: 200`,
  web: String.raw`version: 1
type: web
name: invalid-login
tests:
  - name: invalid credentials
    steps:
      - goto: /login
      - fill:
          selector: input[type="email"]
          value: wrong@example.com
      - fill:
          selector: input[type="password"]
          value: wrong-password
      - click: button[type="submit"]
      - expectText:
          text: Invalid email or password`,
  'web-flow': String.raw`version: 1
type: web
name: checkout-completo
defaults:
  timeoutMs: 15000
  retries: 1
  video: retain-on-failure
  trace: retain-on-failure
flows:
  login:
    params:
      email: \${USER_EMAIL}
      password: \${USER_PASSWORD}
    steps:
      - goto: /login
      - fill:
          by: label
          target: Email
          value: \${email}
      - fill:
          by: label
          target: Senha
          value: \${password}
      - click:
          by: role
          role: button
          name: Entrar
tests:
  - name: compra produto com cartao
    tags: [checkout, smoke]
    steps:
      - use: login
      - goto: /produtos
      - click:
          by: text
          target: Produto A
      - click:
          by: role
          role: button
          name: Adicionar ao carrinho
      - goto: /checkout
      - click:
          by: role
          role: button
          name: Finalizar compra
      - extract:
          as: ORDER_ID
          from:
            by: testId
            target: order-id
          property: text
      - expectText: \${ORDER_ID}`,
  'web-extract': String.raw`version: 1
type: web
name: extract-web
tests:
  - name: captura dados dinâmicos
    steps:
      - goto: /orders/new
      - click:
          by: role
          role: button
          name: Criar pedido
      - extract:
          as: ORDER_ID
          from:
            by: testId
            target: order-id
          property: text
      - extract:
          as: DETAIL_URL
          from:
            by: testId
            target: order-link
          property: attribute
          attribute: href
      - extract:
          as: CURRENT_URL
          property: url
      - goto: \${DETAIL_URL}
      - expectText: \${ORDER_ID}`,
  'web-library-flow': String.raw`version: 1
type: web
name: checkout-com-flow-compartilhado
tests:
  - name: checkout reutilizando auth.login
    steps:
      - use: auth.login
        with:
          email: qa@example.com
          password: \${USER_PASSWORD}
      - goto: /checkout
      - expectText: Checkout`,
} as const;

const operatorGuide = `# TestHub MCP operator guide

Use TestHub as a test-management and execution platform. Do not guess state. Always inspect current projects, environments, suites, and runs before changing or running anything.

## Golden path
1. Call testhub_list_projects.
2. Pick existing project by name, or create one with testhub_create_project.
3. Call testhub_list_environments with projectId. Aliases alsó exist: list_environments and testhub_list_envs.
4. Pick/create/update environment. If unsure, call testhub_get_test_context with projectId to get projects, environments, suites, and recent runs with IDs in one response.
5. Environment baseUrl is target app URL. Variables are secrets/config used by specs.
6. Call testhub_list_suites with projectId.
7. For an existing suite: call testhub_get_suite before editing.
8. Before writing web suites, call testhub_list_flows. Reuse existing organization flows such as auth.login when they match the journey.
9. Validate YAML with testhub_validate_spec before create/update when possible. Validation resolves organization flows when authenticated.
10. For a new suite: create YAML spec with testhub_create_suite.
11. Run with testhub_run_suite using projectId, suiteId, and environmentId. If environmentId is missing, testhub_run_suite will first match environmentName, then use the first project environment, or create one when baseUrl is provided.
12. Poll with testhub_wait_run. Use timeoutMs large enough for web tests.
13. Fetch testhub_get_run_report.
14. Fetch testhub_get_artifacts. For web runs, look for video/webm, screenshot/png, trace/report. For API runs, inspect request/response JSON.

## Rules
- Never hard delete. testhub_archive_project is soft delete, but still destructive to visible workspace. Ask user before using it unless archiving your own temporary smoke data.
- Never hard delete environments. testhub_archive_environment is soft delete and hides linked runs.
- Never recreate a suite just because update is needed. Use testhub_get_suite then testhub_update_suite.
- Do not run tests without confirming project, environment, and suite match the target.
- API assertion failures should be treated as failed. Infra/config/runtime issues should be treated as error.
- Web/app tests should produce recording artifacts by default. Backend/API tests should expose request, response, payload, and report artifacts.
- Variables in specs use environment variables. Keep secrets inside environments, not YAML when possible.
- For long web journeys, prefer flows + use + with instead of duplicating login/setup steps.
- For organization-wide reuse, prefer Flow Library refs like use: auth.login. Use testhub_create_flow/update_flow to maintain shared flows.
- For dynamic web data, use extract with property text, value, attribute, or url; then reuse with \${VARIABLE}.

## Suite YAML examples

API:
\`\`\`yaml
version: 1
type: api
name: health
tests:
  - name: status 200
    request:
      method: GET
      path: /status/200
    expect:
      status: 200
\`\`\`

Web:
\`\`\`yaml
${specExamples.web}
\`\`\`

Web flow + extract:
\`\`\`yaml
${specExamples['web-flow']}
\`\`\`

Web suite using Flow Library:
\`\`\`yaml
${specExamples['web-library-flow']}
\`\`\`

## Command catalog
- Project: ${commandCatalog.project.join(', ')}
- Environment: ${commandCatalog.environment.join(', ')}
- Suite: ${commandCatalog.suite.join(', ')}
- Flow Library: ${commandCatalog.flow.join(', ')}
- Run: ${commandCatalog.run.join(', ')}
`;

server.registerResource('testhub-guide', 'testhub://guide', {
  title: 'TestHub operator guide',
  description: 'How an AI agent should inspect, edit, run, and review tests with TestHub.',
  mimeType: 'text/markdown',
}, (uri) => ({
  contents: [{ uri: uri.href, mimeType: 'text/markdown', text: operatorGuide }],
}));

server.registerPrompt('testhub_operator', {
  title: 'TestHub operator',
  description: 'Instructions for safely working with projects, suites, runs, artifacts, and optional AI review in TestHub.',
}, () => ({
  description: 'Use this prompt before operating TestHub through MCP tools.',
  messages: [{
    role: 'user',
    content: { type: 'text', text: operatorGuide },
  }],
}));

server.tool('testhub_help', 'Mostra guia operacional e catálogo de comandos do TestHub MCP', {
  section: z.enum(['all', 'workflow', 'rules', 'examples', 'commands']).default('all'),
}, ({ section }) => {
  const sections = {
    all: operatorGuide,
    workflow: operatorGuide.slice(operatorGuide.indexOf('## Golden path'), operatorGuide.indexOf('## Rules')).trim(),
    rules: operatorGuide.slice(operatorGuide.indexOf('## Rules'), operatorGuide.indexOf('## Suite YAML examples')).trim(),
    examples: operatorGuide.slice(operatorGuide.indexOf('## Suite YAML examples'), operatorGuide.indexOf('## Command catalog')).trim(),
    commands: operatorGuide.slice(operatorGuide.indexOf('## Command catalog')).trim(),
  };
  return text({
    section,
    guide: sections[section],
    commands: commandCatalog,
  });
});

server.tool('testhub_get_spec_examples', 'Retorna exemplos oficiais de YAML TestHub, incluindo Flow Library, flows web e extract web', {
  example: z.enum(['all', 'api', 'web', 'web-flow', 'web-extract', 'web-library-flow']).default('all'),
}, ({ example }) => {
  const examples = example === 'all'
    ? specExamples
    : { [example]: specExamples[example as keyof typeof specExamples] };
  return text({
    example,
    notes: [
      'Sempre valide specContent com testhub_validate_spec antes de criar ou atualizar suite.',
      'Use flows + use + with para fluxos web extensos e reutilizaveis.',
      'Chame testhub_list_flows antes de criar suite web; use refs como auth.login quando houver flow compartilhado.',
      'Use extract web para capturar text, value, attribute ou url e reutilizar como ${VARIAVEL}.',
      'Mantenha secrets em environments; use variables/params apenas para valores não sensiveis ou placeholders.',
    ],
    examples,
  });
});

server.tool('testhub_list_projects', 'Lista projetos do TestHub', {}, async () => {
  return text(await api('/api/projects'));
});

server.tool('testhub_get_test_context', 'Retorna contexto para planejar execução: projetos, environments, suites e runs recentes com IDs', {
  projectId: z.string().optional(),
}, async ({ projectId }) => {
  const suffix = projectId ? `?projectId=${encodeURIComponent(projectId)}` : '';
  const [projects, environments, suites, runs] = await Promise.all([
    api('/api/projects'),
    api(`/api/environments${suffix}`),
    api(`/api/suites${suffix}`),
    api(`/api/runs${suffix}`),
  ]);
  return text({
    nextStep: 'Escolha projectId, environmentId e suiteId. Depois chame testhub_run_suite.',
    projects,
    environments,
    suites,
    runs,
  });
});

server.tool('testhub_create_project', 'Cria projeto no TestHub', {
  name: z.string(),
  description: z.string().optional(),
  baseUrl: z.string().url().optional(),
  environmentName: z.string().optional(),
  variables: z.record(z.string()).optional(),
}, async (input) => {
  const { baseUrl, environmentName, variables, ...projectInput } = input;
  const project = await api('/api/projects', { method: 'POST', body: JSON.stringify(projectInput) }) as { id: string };
  const environment = baseUrl
    ? await createEnvironment({ projectId: project.id, name: environmentName ?? 'default', baseUrl, variables })
    : undefined;
  return text({ project, environment });
});

server.tool('testhub_get_project', 'Busca projeto ativo por ID', {
  projectId: z.string(),
}, async ({ projectId }) => {
  return text(await getProjectContext(projectId));
});

server.tool('testhub_update_project', 'Atualiza nome/descrição de projeto ativo', {
  projectId: z.string(),
  name: z.string(),
  description: z.string().optional(),
}, async ({ projectId, ...input }) => {
  return text(await api(`/api/projects/${encodeURIComponent(projectId)}`, { method: 'PUT', body: JSON.stringify(input) }));
});

server.tool('testhub_archive_project', 'Arquiva projeto por soft delete e oculta filhos', {
  projectId: z.string(),
}, async ({ projectId }) => {
  await api(`/api/projects/${encodeURIComponent(projectId)}`, { method: 'DELETE' });
  return text({ archived: true, projectId });
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
  return text(await createEnvironment(input));
});

server.tool('testhub_get_environment', 'Busca environment/ambiente ativo por ID', {
  environmentId: z.string(),
}, async ({ environmentId }) => {
  return text(await getEnvironment(environmentId));
});

server.tool('testhub_update_environment', 'Atualiza ambiente ativo. Use para trocar baseUrl/variáveis sem recriar suite.', {
  environmentId: z.string(),
  name: z.string(),
  baseUrl: z.string().url(),
  variables: z.record(z.string()).optional(),
}, async ({ environmentId, ...input }) => {
  return text(await api(`/api/environments/${encodeURIComponent(environmentId)}`, { method: 'PUT', body: JSON.stringify(input) }));
});

server.tool('testhub_archive_environment', 'Arquiva ambiente por soft delete e oculta runs vinculadas', {
  environmentId: z.string(),
}, async ({ environmentId }) => {
  await api(`/api/environments/${encodeURIComponent(environmentId)}`, { method: 'DELETE' });
  return text({ archived: true, environmentId });
});

server.tool('testhub_list_envs', 'Alias de testhub_list_environments. Lista environments/ambientes e retorna environmentId', {
  projectId: z.string().optional(),
}, async ({ projectId }) => {
  return text(await api(`/api/environments${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`));
});

server.tool('testhub_create_env', 'Alias de testhub_create_environment. Cria environment/ambiente e retorna environmentId', {
  projectId: z.string(),
  name: z.string(),
  baseUrl: z.string(),
  variables: z.record(z.string()).optional(),
}, async (input) => {
  return text(await createEnvironment(input));
});

server.tool('list_environments', 'Alias sem prefixo. Lista environments/ambientes e retorna environmentId', {
  projectId: z.string().optional(),
}, async ({ projectId }) => {
  return text(await listEnvironments(projectId));
});

server.tool('create_environment', 'Alias sem prefixo. Cria environment/ambiente e retorna environmentId', {
  projectId: z.string(),
  name: z.string(),
  baseUrl: z.string(),
  variables: z.record(z.string()).optional(),
}, async (input) => {
  return text(await createEnvironment(input));
});

server.tool('get_environment', 'Alias sem prefixo. Busca environment/ambiente ativo por ID', {
  environmentId: z.string(),
}, async ({ environmentId }) => {
  return text(await getEnvironment(environmentId));
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

server.tool('testhub_get_suite', 'Busca suite ativa com conteudo YAML', {
  suiteId: z.string(),
}, async ({ suiteId }) => {
  return text(await api(`/api/suites/${encodeURIComponent(suiteId)}`));
});

server.tool('testhub_update_suite', 'Atualiza nome, tipo e YAML de suite ativa', {
  suiteId: z.string(),
  name: z.string(),
  type: z.enum(['web', 'api']),
  specContent: z.string(),
}, async ({ suiteId, ...input }) => {
  return text(await api(`/api/suites/${encodeURIComponent(suiteId)}`, { method: 'PUT', body: JSON.stringify(input) }));
});

server.tool('testhub_validate_spec', 'Valida YAML TestHub sem salvar suite', {
  specContent: z.string(),
}, async (input) => {
  return text(await api('/api/spec/validate', { method: 'POST', body: JSON.stringify(input) }));
});

server.tool('testhub_list_flows', 'Lista flows reutilizaveis da organização atual, opcionalmente por namespace', {
  namespace: z.string().optional(),
}, async ({ namespace }) => {
  return text(await api(`/api/flows${namespace ? `?namespace=${encodeURIComponent(namespace)}` : ''}`));
});

server.tool('testhub_get_flow', 'Busca flow reutilizável por ID', {
  flowId: z.string(),
}, async ({ flowId }) => {
  return text(await api(`/api/flows/${encodeURIComponent(flowId)}`));
});

server.tool('testhub_create_flow', 'Cria flow web reutilizável da organização atual', {
  namespace: z.string(),
  name: z.string(),
  description: z.string().optional(),
  params: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
  steps: z.array(z.unknown()).min(1),
}, async (input) => {
  return text(await api('/api/flows', { method: 'POST', body: JSON.stringify(input) }));
});

server.tool('testhub_update_flow', 'Atualiza flow web reutilizável da organização atual', {
  flowId: z.string(),
  namespace: z.string(),
  name: z.string(),
  description: z.string().optional(),
  params: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
  steps: z.array(z.unknown()).min(1),
}, async ({ flowId, ...input }) => {
  return text(await api(`/api/flows/${encodeURIComponent(flowId)}`, { method: 'PUT', body: JSON.stringify(input) }));
});

server.tool('testhub_archive_flow', 'Arquiva flow reutilizável por soft delete', {
  flowId: z.string(),
}, async ({ flowId }) => {
  await api(`/api/flows/${encodeURIComponent(flowId)}`, { method: 'DELETE' });
  return text({ archived: true, flowId });
});

server.tool('testhub_list_runs', 'Lista runs, opcionalmente por projeto', {
  projectId: z.string().optional(),
}, async ({ projectId }) => {
  return text(await api(`/api/runs${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`));
});

server.tool('testhub_run_suite', 'Dispara execução de suite', {
  projectId: z.string(),
  environmentId: z.string().optional(),
  suiteId: z.string(),
  baseUrl: z.string().url().optional(),
  environmentName: z.string().optional(),
  variables: z.record(z.string()).optional(),
}, async ({ baseUrl, environmentName, variables, ...input }) => {
  const environmentId = await resolveEnvironmentId({
    projectId: input.projectId,
    environmentId: input.environmentId,
    baseUrl,
    environmentName,
    variables,
  });
  return text(await api('/api/runs', {
    method: 'POST',
    body: JSON.stringify({ projectId: input.projectId, suiteId: input.suiteId, environmentId }),
  }));
});

server.tool('testhub_get_run_status', 'Consulta status de run', {
  runId: z.string(),
}, async ({ runId }) => {
  return text(await api(`/api/runs/${encodeURIComponent(runId)}`));
});

server.tool('testhub_cancel_run', 'Cancela run em fila ou em execução', {
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
  const normalize = (artifacts: unknown) => Array.isArray(artifacts)
    ? artifacts.map((artifact) => {
      if (!artifact || typeof artifact !== 'object' || !('path' in artifact)) return artifact;
      const path = String((artifact as { path: unknown }).path);
      return { ...artifact, url: `${TESTHUB_URL}/artifacts?path=${encodeURIComponent(path)}` };
    })
    : [];
  return text({
    runArtifacts: normalize(report.artifacts),
    testArtifacts: report.results?.flatMap((result) => normalize(result.artifacts)) ?? [],
  });
});

async function getProjectContext(projectId: string): Promise<unknown> {
  const [project, environments, suites, runs] = await Promise.all([
    api(`/api/projects/${encodeURIComponent(projectId)}`),
    listEnvironments(projectId),
    api(`/api/suites?projectId=${encodeURIComponent(projectId)}`),
    api(`/api/runs?projectId=${encodeURIComponent(projectId)}`),
  ]);
  return {
    project,
    environments,
    suites,
    runs,
    nextStep: 'Use um environment.id como environmentId em testhub_run_suite. Se não existir environment, crie com testhub_create_environment/create_environment ou passe baseUrl no testhub_run_suite.',
  };
}

async function listEnvironments(projectId?: string): Promise<EnvironmentSummary[]> {
  return await api(`/api/environments${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`) as EnvironmentSummary[];
}

async function createEnvironment(input: {
  projectId: string;
  name: string;
  baseUrl: string;
  variables?: Record<string, string>;
}): Promise<unknown> {
  return await api('/api/environments', { method: 'POST', body: JSON.stringify(input) });
}

async function getEnvironment(environmentId: string): Promise<EnvironmentSummary> {
  return await api(`/api/environments/${encodeURIComponent(environmentId)}`) as EnvironmentSummary;
}

async function resolveEnvironmentId(input: {
  projectId: string;
  environmentId?: string;
  baseUrl?: string;
  environmentName?: string;
  variables?: Record<string, string>;
}): Promise<string> {
  if (input.environmentId) return input.environmentId;
  const existing = await listEnvironments(input.projectId);
  if (input.environmentName) {
    const named = existing.find((environment) => environment.name === input.environmentName);
    if (named) return named.id;
  }
  if (existing[0]) return existing[0].id;
  if (input.baseUrl) {
    const created = await createEnvironment({
      projectId: input.projectId,
      name: input.environmentName ?? 'default',
      baseUrl: input.baseUrl,
      variables: input.variables,
    }) as { id?: string };
    if (created.id) return created.id;
  }
  throw new Error('Nenhum environment encontrado. Passe environmentId, ou passe baseUrl para testhub_run_suite criar um environment automaticamente.');
}

async function api(path: string, options: RequestInit = {}): Promise<unknown> {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  if (TESTHUB_TOKEN) headers.set('authorization', `Bearer ${TESTHUB_TOKEN}`);
  if (TESTHUB_ORGANIZATION_ID) headers.set('x-testhub-organization-id', TESTHUB_ORGANIZATION_ID);
  const response = await fetch(`${TESTHUB_URL}${path}`, {
    ...options,
    headers,
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
