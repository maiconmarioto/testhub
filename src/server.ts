#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import Fastify from 'fastify';
import { z } from 'zod';
import { createStore } from './store-factory.js';
import { buildFailurePrompt, buildFixPrompt, buildTestSuggestionPrompt, callAi } from './ai.js';
import { redactDeep } from './redact.js';
import { createRunQueue } from './jobs.js';
import { executeRun } from './run-executor.js';
import { maskVariables } from './secrets.js';
import { cleanupOldRuns } from './cleanup.js';
import { openApiToSuite } from './openapi-import.js';

export function createApp() {
  const store = createStore();
  const runQueue = createRunQueue();
  const app = Fastify({ logger: true });

app.addHook('preHandler', async (req, reply) => {
  const token = process.env.TESTHUB_TOKEN;
  if (!token) return;
  if (req.url === '/' || req.url.startsWith('/api/health')) return;
  const authorization = req.headers.authorization;
  if (authorization === `Bearer ${token}`) return;
  return reply.code(401).send({ error: 'Unauthorized' });
});

app.get('/', async (_req, reply) => {
  return reply.type('text/html').send(renderDashboard());
});

app.get('/api/health', async () => ({ ok: true }));

app.get('/api/projects', async () => (await store.read()).projects);
app.post('/api/projects', async (req, reply) => {
  const input = z.object({ name: z.string().min(1), description: z.string().optional() }).parse(req.body);
  return reply.code(201).send(await store.createProject(input));
});

app.get('/api/environments', async (req) => {
  const query = z.object({ projectId: z.string().optional() }).parse(req.query);
  return (await store.read()).environments
    .filter((environment) => !query.projectId || environment.projectId === query.projectId)
    .map((environment) => ({ ...environment, variables: maskVariables(environment.variables) }));
});
app.post('/api/environments', async (req, reply) => {
  const input = z.object({
    projectId: z.string(),
    name: z.string().min(1),
    baseUrl: z.string().url(),
    variables: z.record(z.string()).optional(),
  }).parse(req.body);
  return reply.code(201).send(await store.createEnvironment(input));
});

app.get('/api/suites', async (req) => {
  const query = z.object({ projectId: z.string().optional() }).parse(req.query);
  return (await store.read()).suites.filter((suite) => !query.projectId || suite.projectId === query.projectId);
});
app.post('/api/suites', async (req, reply) => {
  const input = z.object({
    projectId: z.string(),
    name: z.string().min(1),
    type: z.enum(['web', 'api']),
    specContent: z.string().min(1),
  }).parse(req.body);
  return reply.code(201).send(await store.createSuite(input));
});

app.post('/api/import/openapi', async (req, reply) => {
  const input = z.object({
    projectId: z.string(),
    name: z.string().min(1).default('openapi-import'),
    spec: z.unknown(),
  }).parse(req.body);
  const specContent = openApiToSuite(input.spec, input.name);
  return reply.code(201).send(await store.createSuite({ projectId: input.projectId, name: input.name, type: 'api', specContent }));
});

app.get('/api/runs', async (req) => {
  const query = z.object({ projectId: z.string().optional() }).parse(req.query);
  return (await store.read()).runs.filter((run) => !query.projectId || run.projectId === query.projectId);
});
app.get('/api/runs/:id', async (req, reply) => {
  const params = z.object({ id: z.string() }).parse(req.params);
  const run = (await store.read()).runs.find((item) => item.id === params.id);
  if (!run) return reply.code(404).send({ error: 'Run nao encontrada' });
  return run;
});
app.post('/api/runs', async (req, reply) => {
  const input = z.object({ projectId: z.string(), environmentId: z.string(), suiteId: z.string() }).parse(req.body);
  const db = await store.read();
  const environment = db.environments.find((item) => item.id === input.environmentId);
  const suite = db.suites.find((item) => item.id === input.suiteId);
  if (!environment || !suite) return reply.code(400).send({ error: 'Environment ou suite invalido' });
  const run = store.createRun(input);
  const createdRun = await run;
  if (runQueue) await runQueue.add('run', { runId: createdRun.id });
  else void executeRun(store, createdRun.id);
  return reply.code(202).send(createdRun);
});

app.post('/api/runs/:id/cancel', async (req, reply) => {
  const params = z.object({ id: z.string() }).parse(req.params);
  const db = await store.read();
  const run = db.runs.find((item) => item.id === params.id);
  if (!run) return reply.code(404).send({ error: 'Run nao encontrada' });
  if (!['queued', 'running'].includes(run.status)) return run;
  if (runQueue) {
    const jobs = await runQueue.getJobs(['waiting', 'delayed', 'prioritized']);
    await Promise.all(jobs.filter((job) => job.data.runId === params.id).map((job) => job.remove()));
  }
  return store.updateRun(params.id, { status: 'canceled', finishedAt: new Date().toISOString() });
});

app.get('/api/runs/:id/report', async (req, reply) => {
  const params = z.object({ id: z.string() }).parse(req.params);
  const run = (await store.read()).runs.find((item) => item.id === params.id);
  if (!run?.reportPath || !fs.existsSync(run.reportPath)) return reply.code(404).send({ error: 'Report nao encontrado' });
  return JSON.parse(fs.readFileSync(run.reportPath, 'utf8'));
});

app.post('/api/cleanup', async (req, reply) => {
  const input = z.object({ days: z.number().int().min(1).default(30) }).parse(req.body ?? {});
  return reply.send(await cleanupOldRuns(store, input.days));
});

app.get('/artifacts', async (req, reply) => {
  const query = z.object({ path: z.string() }).parse(req.query);
  const requested = path.resolve(query.path);
  const allowedRoots = [path.resolve('.testhub-runs'), path.resolve(store.rootDir)];
  if (!allowedRoots.some((root) => requested.startsWith(root))) {
    return reply.code(403).send({ error: 'Artifact fora de area permitida' });
  }
  if (!fs.existsSync(requested)) return reply.code(404).send({ error: 'Artifact nao encontrado' });
  return reply.send(fs.createReadStream(requested));
});

app.get('/api/ai/connections', async () => (await store.read()).aiConnections.map((connection) => ({ ...connection, apiKey: connection.apiKey ? '[REDACTED]' : undefined })));
app.post('/api/ai/connections', async (req, reply) => {
  const input = z.object({
    id: z.string().optional(),
    name: z.string().min(1),
    provider: z.enum(['openrouter', 'openai', 'anthropic']),
    apiKey: z.string().optional(),
    model: z.string().min(1),
    baseUrl: z.string().url().optional(),
    enabled: z.boolean().default(true),
  }).parse(req.body);
  return reply.code(201).send(await store.upsertAiConnection(input));
});

app.post('/api/ai/:kind', async (req, reply) => {
  const params = z.object({ kind: z.enum(['explain-failure', 'suggest-test-fix', 'suggest-test-cases']) }).parse(req.params);
  const body = z.object({ connectionId: z.string().optional(), context: z.unknown() }).parse(req.body);
  const connection = await store.getAiConnection(body.connectionId);
  if (!connection) return reply.code(400).send({ error: 'Nenhuma AI connection habilitada' });
  const context = redactDeep(body.context);
  const prompt =
    params.kind === 'explain-failure'
      ? buildFailurePrompt(context)
      : params.kind === 'suggest-test-fix'
        ? buildFixPrompt(context)
        : buildTestSuggestionPrompt(context);
  return callAi(connection, prompt);
});

function renderDashboard(): string {
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>TestHub</title>
  <style>
    body { margin: 0; font-family: Inter, system-ui, sans-serif; background: #f6f7f9; color: #17202a; }
    header { padding: 16px 24px; background: #111827; color: white; }
    main { padding: 24px; display: grid; grid-template-columns: 360px 1fr; gap: 20px; }
    section { background: white; border: 1px solid #d9dee7; border-radius: 8px; padding: 16px; margin-bottom: 16px; }
    input, textarea, select, button { width: 100%; box-sizing: border-box; padding: 8px; margin: 4px 0 10px; }
    button { cursor: pointer; background: #2563eb; color: white; border: 0; border-radius: 6px; font-weight: 700; }
    pre { white-space: pre-wrap; background: #0f172a; color: #e2e8f0; padding: 12px; border-radius: 6px; overflow: auto; }
    table { width: 100%; border-collapse: collapse; }
    td, th { border-bottom: 1px solid #e5e7eb; padding: 8px; text-align: left; vertical-align: top; }
    .passed { color: #047857; font-weight: 700; }
    .failed, .error { color: #b91c1c; font-weight: 700; }
    .running, .queued { color: #b45309; font-weight: 700; }
  </style>
</head>
<body>
  <header><h1>TestHub</h1></header>
  <main>
    <div>
      <section>
        <h2>Projeto</h2>
        <input id="projectName" placeholder="CRM" />
        <button onclick="createProject()">Criar projeto</button>
      </section>
      <section>
        <h2>Ambiente</h2>
        <select id="envProject"></select>
        <input id="envName" placeholder="hml" />
        <input id="envBaseUrl" placeholder="https://example.com" />
        <textarea id="envVars" rows="4" placeholder="TOKEN=abc"></textarea>
        <button onclick="createEnvironment()">Criar ambiente</button>
      </section>
      <section>
        <h2>Suite</h2>
        <select id="suiteProject"></select>
        <input id="suiteName" placeholder="login-smoke" />
        <select id="suiteType"><option>api</option><option>web</option></select>
        <textarea id="suiteSpec" rows="14">version: 1
type: api
name: health
tests:
  - name: health
    request:
      method: GET
      path: /
    expect:
      status: 200</textarea>
        <button onclick="createSuite()">Criar suite</button>
      </section>
    </div>
    <div>
      <section>
        <h2>Executar</h2>
        <select id="runProject"></select>
        <select id="runEnv"></select>
        <select id="runSuite"></select>
        <button onclick="createRun()">Run</button>
      </section>
      <section>
        <h2>Runs</h2>
        <div id="runs"></div>
      </section>
    </div>
  </main>
  <script>
    async function api(path, options) {
      const res = await fetch(path, { headers: { 'content-type': 'application/json' }, ...options });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    }
    function vars(text) {
      return Object.fromEntries(text.split(/\\n/).filter(Boolean).map(line => {
        const i = line.indexOf('=');
        return [line.slice(0, i).trim(), line.slice(i + 1).trim()];
      }));
    }
    async function refresh() {
      const [projects, envs, suites, runs] = await Promise.all([
        api('/api/projects'), api('/api/environments'), api('/api/suites'), api('/api/runs')
      ]);
      for (const id of ['envProject','suiteProject','runProject']) {
        document.getElementById(id).innerHTML = projects.map(p => '<option value="'+p.id+'">'+p.name+'</option>').join('');
      }
      document.getElementById('runEnv').innerHTML = envs.map(e => '<option value="'+e.id+'">'+e.name+'</option>').join('');
      document.getElementById('runSuite').innerHTML = suites.map(s => '<option value="'+s.id+'">'+s.name+' ('+s.type+')</option>').join('');
      document.getElementById('runs').innerHTML = '<table><tr><th>Status</th><th>Run</th><th>Resumo</th><th>Report</th></tr>' + runs.map(r => '<tr><td class="'+r.status+'">'+r.status+'</td><td>'+r.id+'</td><td><pre>'+JSON.stringify(r.summary || r.error || {}, null, 2)+'</pre></td><td>'+(r.reportHtmlPath ? '<a href="/artifacts?path='+encodeURIComponent(r.reportHtmlPath)+'" target="_blank">HTML</a>' : '')+'</td></tr>').join('') + '</table>';
    }
    async function createProject() { await api('/api/projects', { method: 'POST', body: JSON.stringify({ name: projectName.value }) }); refresh(); }
    async function createEnvironment() { await api('/api/environments', { method: 'POST', body: JSON.stringify({ projectId: envProject.value, name: envName.value, baseUrl: envBaseUrl.value, variables: vars(envVars.value) }) }); refresh(); }
    async function createSuite() { await api('/api/suites', { method: 'POST', body: JSON.stringify({ projectId: suiteProject.value, name: suiteName.value, type: suiteType.value, specContent: suiteSpec.value }) }); refresh(); }
    async function createRun() { await api('/api/runs', { method: 'POST', body: JSON.stringify({ projectId: runProject.value, environmentId: runEnv.value, suiteId: runSuite.value }) }); setTimeout(refresh, 500); }
    refresh(); setInterval(refresh, 3000);
  </script>
</body>
</html>`;
}

return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const app = createApp();
  const port = Number(process.env.PORT ?? 4321);
  await app.listen({ port, host: '0.0.0.0' });
  console.log(`TestHub server: http://localhost:${port}`);
}
