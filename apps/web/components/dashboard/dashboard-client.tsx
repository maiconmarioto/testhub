'use client';

import { useEffect, useMemo, useState } from 'react';
import type React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Activity,
  Archive,
  BookOpen,
  Bot,
  Boxes,
  Braces,
  CheckCircle2,
  Clock3,
  Database,
  FolderKanban,
  FileCode2,
  Gauge,
  Globe2,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Server,
  Settings2,
  ShieldAlert,
  Square,
  TerminalSquare,
  XCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

type Project = { id: string; name: string; description?: string };
type Environment = { id: string; projectId: string; name: string; baseUrl: string; variables?: Record<string, string> };
type Suite = { id: string; projectId: string; name: string; type: 'api' | 'web'; specPath?: string };
type SuiteWithContent = Suite & { specContent: string };
type RunStatus = 'queued' | 'running' | 'passed' | 'failed' | 'error' | 'canceled' | 'deleted';
type Run = {
  id: string;
  projectId: string;
  environmentId: string;
  suiteId: string;
  status: RunStatus;
  summary?: RunSummary | null;
  error?: string | null;
  reportPath?: string | null;
  reportHtmlPath?: string | null;
  createdAt?: string;
  startedAt?: string | null;
  finishedAt?: string | null;
};
type RunSummary = { total?: number; passed?: number; failed?: number; skipped?: number; error?: number; uploadedArtifacts?: Array<{ key: string; bucket: string; localPath: string }> };
type Artifact = { type: string; path: string; label?: string };
type RunReport = { artifacts?: Artifact[]; results?: Array<{ name: string; status: RunStatus; durationMs?: number; error?: string; artifacts?: Artifact[]; steps?: Array<{ index?: number; name: string; status: RunStatus; error?: string; durationMs?: number }> }> };
type AiConnection = { id: string; name: string; provider: 'openrouter' | 'openai' | 'anthropic'; model: string; enabled: boolean };

const apiBase = process.env.NEXT_PUBLIC_TESTHUB_API_URL ?? 'http://localhost:4321';

const defaultSpec = `version: 1
type: api
name: health
tests:
  - name: status 200
    request:
      method: GET
      path: /status/200
    expect:
      status: 200`;

const docsApiSpec = `version: 1
type: api
name: httpbin-health
description: Smoke API publico para validar runner
baseUrl: https://httpbin.org
defaults:
  timeoutMs: 10000
tests:
  - name: get status 200
    tags: [smoke]
    request:
      method: GET
      path: /status/200
    expect:
      status: 200
      maxMs: 5000

  - name: get json schema
    tags: [contract]
    request:
      method: GET
      path: /json
    expect:
      status: 200
      jsonSchema:
        type: object
        required: [slideshow]`;

const docsWebSpec = `version: 1
type: web
name: login-invalid
description: Login invalido deve exibir erro
baseUrl: \${BASE_URL}
defaults:
  timeoutMs: 10000
  screenshotOnFailure: true
  video: retain-on-failure
  trace: retain-on-failure
tests:
  - name: credenciais invalidas
    tags: [smoke, auth]
    steps:
      - goto: /login
      - fill:
          selector: input[type="email"]
          value: qa-invalido@example.com
      - fill:
          selector: input[type="password"]
          value: senha-incorreta
      - click:
          by: role
          role: button
          name: Login
      - expectText:
          text: Invalid email or password`;

const docsApiChainSpec = `version: 1
type: api
name: api-chain
baseUrl: https://httpbin.org
tests:
  - name: extract token
    request:
      method: GET
      path: /response-headers
      query:
        x-test-token: abc123
    expect:
      status: 200
      bodyPathExists: [x-test-token]
    extract:
      TOKEN: body.x-test-token

  - name: reuse token
    request:
      method: GET
      path: /headers
      headers:
        x-test-token: \${TOKEN}
    expect:
      status: 200
      bodyPathMatches:
        headers.X-Test-Token: abc123`;

const docsEnvFile = `BASE_URL=https://crm-hml.local
CRM_USER=qa@example.com
CRM_PASS=secret
TOKEN=abc123`;

const docsCliRun = `npm run build
node dist/apps/cli/src/cli.js run examples/api-health.yaml --env-file .env
node dist/apps/cli/src/cli.js run examples/web-example.yaml --tag smoke --junit reports/junit.xml`;

const docsApiAuthSpec = `version: 1
type: api
name: auth-negative-contract
baseUrl: \${BASE_URL}
tests:
  - name: should reject missing token
    request:
      method: GET
      path: /api/me
    expect:
      status: 401
      bodyContains:
        error: Unauthorized

  - name: should return current user
    request:
      method: GET
      path: /api/me
      headers:
        authorization: Bearer \${TOKEN}
    expect:
      status: 200
      bodyPathExists: [id, email]
      bodyPathMatches:
        email: qa@example.com`;

const docsWebFormSpec = `version: 1
type: web
name: cadastro-cliente-smoke
baseUrl: \${BASE_URL}
defaults:
  timeoutMs: 15000
  screenshotOnFailure: true
  video: retain-on-failure
tests:
  - name: cria cliente minimo
    tags: [smoke, cadastro]
    steps:
      - goto: /clientes/novo
      - fill: { selector: input[name="name"], value: Cliente QA }
      - fill: { selector: input[name="email"], value: qa@example.com }
      - select: { by: label, target: Tipo, value: lead }
      - click: { by: role, role: button, name: Salvar }
      - expectText: { text: Cliente criado }
      - expectUrlContains: /clientes/`;

const docsSelectorSpec = `# Preferencia de seletores
- fill: { selector: input[type="email"], value: qa@example.com }
- click: { by: role, role: button, name: Entrar }
- expectText: { text: Bem-vindo }
- expectVisible: { selector: '[data-testid="user-menu"]' }
- expectCount: { by: css, target: .table-row, count: 10 }
- expectAttribute:
    by: testId
    target: submit
    attribute: disabled
    value: disabled`;

const docsWebUploadSpec = `version: 1
type: web
name: upload-documento
baseUrl: \${BASE_URL}
tests:
  - name: envia pdf
    steps:
      - goto: /documentos
      - uploadFile:
          by: label
          target: Arquivo
          path: ./fixtures/contrato.pdf
      - click:
          by: role
          role: button
          name: Enviar
      - expectText: Upload concluido`;

const navItems = [
  { id: 'overview', label: 'Overview', href: '/overview', icon: Gauge },
  { id: 'projects', label: 'Projects', href: '/projects', icon: FolderKanban },
  { id: 'suites', label: 'Suites', href: '/suites', icon: FileCode2 },
  { id: 'runs', label: 'Runs', href: '/runs', icon: Activity },
  { id: 'docs', label: 'Docs', href: '/docs', icon: BookOpen },
  { id: 'settings', label: 'Settings', href: '/settings', icon: Settings2 },
] as const;

export const docsNavItems = [
  { label: 'Comeco rapido', slug: 'quick-start', href: '/docs/quick-start' },
  { label: 'Modelo mental', slug: 'mental-model', href: '/docs/mental-model' },
  { label: 'Projeto e ambiente', slug: 'project-env', href: '/docs/project-env' },
  { label: 'Suite API', slug: 'api-suite', href: '/docs/api-suite' },
  { label: 'API com auth', slug: 'api-auth', href: '/docs/api-auth' },
  { label: 'API encadeada', slug: 'api-chain', href: '/docs/api-chain' },
  { label: 'Suite web', slug: 'web-suite', href: '/docs/web-suite' },
  { label: 'Web CRUD/form', slug: 'web-form', href: '/docs/web-form' },
  { label: 'Seletores', slug: 'selectors', href: '/docs/selectors' },
  { label: 'Upload', slug: 'upload', href: '/docs/upload' },
  { label: 'Variaveis', slug: 'variables', href: '/docs/variables' },
  { label: 'Resultados', slug: 'results', href: '/docs/results' },
  { label: 'Troubleshooting', slug: 'troubleshooting', href: '/docs/troubleshooting' },
] as const;

type View = (typeof navItems)[number]['id'];
type DocsPageId = (typeof docsNavItems)[number]['slug'];

export function DashboardClient({ view, docsPage = 'quick-start' }: { view: View; docsPage?: DocsPageId | string }) {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [envs, setEnvs] = useState<Environment[]>([]);
  const [suites, setSuites] = useState<Suite[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [aiConnections, setAiConnections] = useState<AiConnection[]>([]);
  const [selectedProject, setSelectedProject] = useState('');
  const [editingProjectId, setEditingProjectId] = useState('');
  const [projectName, setProjectName] = useState('');
  const [projectDescription, setProjectDescription] = useState('');
  const [selectedEnv, setSelectedEnv] = useState('');
  const [selectedSuite, setSelectedSuite] = useState('');
  const [editingSuiteId, setEditingSuiteId] = useState('');
  const [suiteName, setSuiteName] = useState('');
  const [suiteType, setSuiteType] = useState<'api' | 'web'>('api');
  const [selectedRun, setSelectedRun] = useState<Run | null>(null);
  const [report, setReport] = useState<RunReport | null>(null);
  const [spec, setSpec] = useState(defaultSpec);
  const [aiOutput, setAiOutput] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const currentProject = projects.find((project) => project.id === selectedProject);
  const projectEnvs = useMemo(() => envs.filter((env) => env.projectId === selectedProject), [envs, selectedProject]);
  const projectSuites = useMemo(() => suites.filter((suite) => suite.projectId === selectedProject), [suites, selectedProject]);
  const projectRuns = useMemo(() => runs.filter((run) => run.projectId === selectedProject), [runs, selectedProject]);
  const selectedRunSuite = selectedRun ? suites.find((suite) => suite.id === selectedRun.suiteId) : undefined;
  const selectedRunEnv = selectedRun ? envs.find((env) => env.id === selectedRun.environmentId) : undefined;
  const stats = useMemo(() => summarizeRuns(projectRuns), [projectRuns]);

  async function refresh() {
    setError('');
    try {
      const [nextProjects, nextEnvs, nextSuites, nextRuns, nextConnections] = await Promise.all([
        api<Project[]>('/api/projects'),
        api<Environment[]>('/api/environments'),
        api<Suite[]>('/api/suites'),
        api<Run[]>('/api/runs'),
        api<AiConnection[]>('/api/ai/connections').catch(() => []),
      ]);
      setProjects(nextProjects);
      setEnvs(nextEnvs);
      setSuites(nextSuites);
      setRuns(nextRuns);
      setAiConnections(nextConnections);
      setSelectedProject((current) => current && nextProjects.some((project) => project.id === current) ? current : nextProjects.at(-1)?.id ?? '');
    } catch (nextError) {
      setError(messageOf(nextError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 3000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    setSelectedEnv((current) => current && projectEnvs.some((env) => env.id === current) ? current : projectEnvs[0]?.id ?? '');
    setSelectedSuite((current) => current && projectSuites.some((suite) => suite.id === current) ? current : projectSuites[0]?.id ?? '');
  }, [selectedProject, projectEnvs, projectSuites]);

  async function saveProject(formData: FormData) {
    const payload = {
      name: projectName || String(formData.get('name') || ''),
      description: projectDescription || undefined,
    };
    if (editingProjectId) {
      await mutate(
        () => api(`/api/projects/${editingProjectId}`, { method: 'PUT', body: JSON.stringify(payload) }),
        { success: 'Projeto atualizado.' },
      );
      return;
    }
    await mutate(
      () => api<Project>('/api/projects', { method: 'POST', body: JSON.stringify(payload) }),
      { success: 'Projeto criado.' },
    );
    setProjectName('');
    setProjectDescription('');
  }

  function editProject(project: Project) {
    setEditingProjectId(project.id);
    setProjectName(project.name);
    setProjectDescription(project.description ?? '');
    setSelectedProject(project.id);
    setNotice(`Editando ${project.name}.`);
  }

  function newProjectDraft() {
    setEditingProjectId('');
    setProjectName('');
    setProjectDescription('');
    setNotice('Novo projeto.');
  }

  async function deleteProject(project: Project) {
    const confirmed = window.confirm(`Arquivar projeto "${project.name}" e ocultar seus ambientes, suites e runs?`);
    if (!confirmed) return;
    await mutate(
      () => api(`/api/projects/${project.id}`, { method: 'DELETE' }),
      { success: 'Projeto arquivado.' },
    );
    if (editingProjectId === project.id) {
      setEditingProjectId('');
      setProjectName('');
      setProjectDescription('');
    }
  }

  async function createEnv(formData: FormData) {
    await mutate(() => api('/api/environments', {
      method: 'POST',
      body: JSON.stringify({
        projectId: selectedProject,
        name: formData.get('name'),
        baseUrl: formData.get('baseUrl'),
        variables: parseVars(String(formData.get('variables') || '')),
      }),
    }), { success: 'Ambiente criado.' });
  }

  async function createSuite(formData: FormData) {
    const payload = {
      name: suiteName || String(formData.get('name') || ''),
      type: suiteType,
      specContent: spec,
    };
    if (editingSuiteId) {
      await mutate(() => api(`/api/suites/${editingSuiteId}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      }), { success: 'Suite atualizada.' });
      return;
    }
    await mutate(() => api('/api/suites', {
      method: 'POST',
      body: JSON.stringify({ projectId: selectedProject, ...payload }),
    }), { success: 'Suite criada.' });
  }

  async function editSuite(suite: Suite) {
    await mutate(async () => {
      const loaded = await api<SuiteWithContent>(`/api/suites/${suite.id}`);
      setEditingSuiteId(loaded.id);
      setSuiteName(loaded.name);
      setSuiteType(loaded.type);
      setSpec(loaded.specContent);
      setSelectedSuite(loaded.id);
    }, { refresh: false, success: `Editando ${suite.name}.` });
  }

  function newSuiteDraft() {
    setEditingSuiteId('');
    setSuiteName('');
    setSuiteType('api');
    setSpec(defaultSpec);
    setNotice('Novo rascunho de suite.');
  }

  async function importOpenApi(formData: FormData) {
    await mutate(() => api('/api/import/openapi', {
      method: 'POST',
      body: JSON.stringify({
        projectId: selectedProject,
        name: formData.get('name') || 'openapi-import',
        spec: JSON.parse(String(formData.get('spec') || '{}')),
      }),
    }), { success: 'OpenAPI importado.' });
  }

  async function upsertAiConnection(formData: FormData) {
    await mutate(() => api('/api/ai/connections', {
      method: 'POST',
      body: JSON.stringify({
        name: formData.get('name'),
        provider: formData.get('provider'),
        apiKey: formData.get('apiKey') || undefined,
        model: formData.get('model'),
        baseUrl: formData.get('baseUrl') || undefined,
        enabled: true,
      }),
    }), { success: 'AI connection salva.' });
  }

  async function runSuite() {
    if (!selectedProject || !selectedEnv || !selectedSuite) {
      setError('Escolha projeto, ambiente e suite antes de executar.');
      return;
    }
    setRunning(true);
    await mutate(async () => {
      const run = await api<Run>('/api/runs', { method: 'POST', body: JSON.stringify({ projectId: selectedProject, environmentId: selectedEnv, suiteId: selectedSuite }) });
      setSelectedRun(run);
      router.push('/runs');
    }, { success: 'Run enviada para fila.' });
    setRunning(false);
  }

  async function cancelRun(run: Run) {
    await mutate(() => api(`/api/runs/${run.id}/cancel`, { method: 'POST', body: '{}' }), { success: 'Run cancelada.' });
  }

  async function inspectRun(run: Run) {
    setSelectedRun(run);
    setAiOutput('');
    if (!run.reportPath) {
      setReport(null);
      return;
    }
    await mutate(async () => {
      setReport(await api<RunReport>(`/api/runs/${run.id}/report`));
    }, { refresh: false });
  }

  async function explain(run: Run) {
    setAiOutput('');
    await mutate(async () => {
      const result = await api<{ output?: string }>('/api/ai/explain-failure', {
        method: 'POST',
        body: JSON.stringify({ context: { run, report } }),
      });
      setAiOutput(result.output ?? JSON.stringify(result, null, 2));
    }, { refresh: false, success: 'Analise de IA concluida.' });
  }

  async function cleanupOldRuns() {
    await mutate(() => api('/api/cleanup', { method: 'POST', body: JSON.stringify({ days: 1 }) }), { success: 'Cleanup executado.' });
  }

  async function mutate(operation: () => Promise<unknown>, options: { refresh?: boolean; success?: string } = {}) {
    setError('');
    setNotice('');
    try {
      await operation();
      if (options.refresh !== false) await refresh();
      if (options.success) setNotice(options.success);
    } catch (nextError) {
      setError(messageOf(nextError));
    } finally {
      setRunning(false);
    }
  }

  const latestRun = projectRuns[0];

  return (
    <main className="min-h-screen">
      <div className="grid min-h-screen grid-cols-[280px_minmax(0,1fr)] max-lg:grid-cols-1">
        <aside className="border-r bg-[#151915] text-[#f7f6f0] max-lg:border-b">
          <div className="sticky top-0 flex h-screen flex-col max-lg:h-auto">
            <div className="p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-accent text-accent-foreground">
                  <TerminalSquare className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xl font-extrabold tracking-tight">TestHub</p>
                  <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-[#c7d957]">QA Console</p>
                </div>
              </div>
            </div>
            <div className="px-4">
              <ProjectSelector projects={projects} value={selectedProject} onChange={setSelectedProject} />
            </div>
            <nav className="mt-5 grid gap-1 px-3">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = view === item.id;
                return (
                  <div key={item.id}>
                    <Link
                      href={item.href}
                      className={cn(
                        'flex cursor-pointer items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm font-semibold text-[#d9d5c8] transition-colors hover:bg-white/10',
                        active && 'bg-[#c7d957] text-[#151915]',
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      <span className="flex-1">{item.label}</span>
                      {item.id === 'docs' ? <span className={cn('text-xs transition-transform', active && 'rotate-90')}>›</span> : null}
                    </Link>
                    {item.id === 'docs' && active ? (
                      <div className="ml-5 mt-1 grid border-l border-white/10 pl-3">
                        {docsNavItems.map((docItem) => (
                          <Link
                            key={docItem.slug}
                            href={docItem.href}
                            className={cn(
                              'rounded-md px-3 py-1.5 text-xs font-semibold text-[#b8b3a6] transition-colors hover:bg-white/10 hover:text-[#f7f6f0]',
                              docsPage === docItem.slug && 'bg-white/10 text-[#f7f6f0]',
                            )}
                          >
                            {docItem.label}
                          </Link>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </nav>
            <div className="mt-auto space-y-3 p-4">
              <div className="rounded-lg border border-white/10 bg-white/[0.04] p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wide text-[#d9d5c8]">API</span>
                  <Badge variant="success">online</Badge>
                </div>
                <a className="mt-2 block text-xs text-[#c7d957] underline-offset-4 hover:underline" href={`${apiBase}/docs`} target="_blank">Swagger / OpenAPI</a>
              </div>
            </div>
          </div>
        </aside>

        <section className="min-w-0">
          <header className="sticky top-0 z-20 border-b bg-background/90 px-6 py-4 backdrop-blur">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">workspace</p>
                <h1 className="text-2xl font-extrabold tracking-tight">{currentProject?.name ?? 'Nenhum projeto'}</h1>
              </div>
              <div className="flex flex-1 items-end justify-end gap-3 max-lg:w-full max-lg:flex-col max-lg:items-stretch">
                <div className="grid min-w-[520px] grid-cols-2 gap-3 max-lg:min-w-0 max-md:grid-cols-1">
                  <LabeledSelect label="Ambiente" value={selectedEnv} onValueChange={setSelectedEnv} placeholder="Escolha ambiente">
                    {projectEnvs.map((env) => <SelectItem key={env.id} value={env.id}>{env.name} - {env.baseUrl}</SelectItem>)}
                  </LabeledSelect>
                  <LabeledSelect label="Suite" value={selectedSuite} onValueChange={setSelectedSuite} placeholder="Escolha suite">
                    {projectSuites.map((suite) => <SelectItem key={suite.id} value={suite.id}>{suite.name} ({suite.type})</SelectItem>)}
                  </LabeledSelect>
                </div>
                <Button className="h-10 min-w-28" onClick={runSuite} disabled={!selectedEnv || !selectedSuite || running}>
                  {running ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  {running ? 'Enviando' : 'Run'}
                </Button>
              </div>
            </div>
            {error ? (
              <div className="mt-4 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            ) : null}
            {notice ? (
              <div className="mt-4 flex items-start gap-2 rounded-md border border-primary/25 bg-primary/10 px-3 py-2 text-sm font-medium text-primary">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{notice}</span>
              </div>
            ) : null}
          </header>

          <div className="grid gap-6 p-6">
            {view === 'overview' ? (
              <Overview
                loading={loading}
                stats={stats}
                latestRun={latestRun}
                runs={projectRuns.slice(0, 5)}
                suites={projectSuites}
                envs={projectEnvs}
                onInspect={(run) => { router.push('/runs'); inspectRun(run); }}
              />
            ) : null}

            {view === 'projects' ? (
              <ProjectsPanel
                projects={projects}
                selectedProject={selectedProject}
                envs={projectEnvs}
                editingProjectId={editingProjectId}
                projectName={projectName}
                projectDescription={projectDescription}
                setProjectName={setProjectName}
                setProjectDescription={setProjectDescription}
                onSaveProject={saveProject}
                onEditProject={editProject}
                onNewProject={newProjectDraft}
                onDeleteProject={deleteProject}
                onCreateEnv={createEnv}
              />
            ) : null}

            {view === 'suites' ? (
              <SuitesPanel
                suites={projectSuites}
                spec={spec}
                setSpec={setSpec}
                editingSuiteId={editingSuiteId}
                suiteName={suiteName}
                setSuiteName={setSuiteName}
                suiteType={suiteType}
                setSuiteType={setSuiteType}
                onCreateSuite={createSuite}
                onEditSuite={editSuite}
                onNewSuite={newSuiteDraft}
                onImportOpenApi={importOpenApi}
              />
            ) : null}

            {view === 'runs' ? (
              <RunsPanel
                runs={projectRuns}
                suites={suites}
                envs={envs}
                selectedRun={selectedRun}
                selectedRunSuite={selectedRunSuite}
                selectedRunEnv={selectedRunEnv}
                report={report}
                aiOutput={aiOutput}
                onInspect={inspectRun}
                onCancel={cancelRun}
                onExplain={explain}
              />
            ) : null}

            {view === 'docs' ? (
              <DocsPanel page={docsPage} />
            ) : null}

            {view === 'settings' ? (
              <SettingsPanel
                connections={aiConnections}
                onCreateConnection={upsertAiConnection}
                onRefresh={refresh}
                onCleanup={cleanupOldRuns}
              />
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}

function Overview(props: {
  loading: boolean;
  stats: ReturnType<typeof summarizeRuns>;
  latestRun?: Run;
  runs: Run[];
  suites: Suite[];
  envs: Environment[];
  onInspect: (run: Run) => void;
}) {
  const { loading, stats, latestRun, runs, suites, envs, onInspect } = props;
  return (
    <div className="grid gap-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Passaram" value={stats.passed} icon={CheckCircle2} tone="success" />
        <MetricCard label="Falharam" value={stats.failed + stats.error} icon={XCircle} tone="danger" />
        <MetricCard label="Rodando" value={stats.active} icon={Clock3} tone="warning" />
        <MetricCard label="Suites" value={suites.length} icon={FileCode2} tone="neutral" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <Card className="overflow-hidden">
          <CardHeader className="flex-row items-center justify-between gap-4">
            <div>
              <CardTitle>Runs recentes</CardTitle>
              <CardDescription>Estado operacional do projeto selecionado.</CardDescription>
            </div>
            <Badge variant={latestRun ? statusVariant(latestRun.status) : 'muted'}>{latestRun?.status ?? 'sem run'}</Badge>
          </CardHeader>
          <CardContent className="grid gap-2">
            {loading ? <EmptyState title="Carregando workspace" /> : null}
            {!loading && runs.length === 0 ? <EmptyState title="Nenhuma run ainda" description="Crie um ambiente, uma suite e rode o primeiro smoke." /> : null}
            {runs.map((run) => (
              <RunRow key={run.id} run={run} suite={suites.find((suite) => suite.id === run.suiteId)} env={envs.find((env) => env.id === run.environmentId)} onInspect={onInspect} />
            ))}
          </CardContent>
        </Card>

        <Card className="border-primary/30 bg-[#151915] text-[#f7f6f0]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-[#c7d957]"><Server className="h-4 w-4" /> Run Dossier</CardTitle>
            <CardDescription className="text-[#d9d5c8]">Leitura rapida da ultima execucao.</CardDescription>
          </CardHeader>
          <CardContent>
            {latestRun ? (
              <div className="space-y-4">
                <div className="font-mono text-xs text-[#d9d5c8]">{shortId(latestRun.id)}</div>
                <div className="text-3xl font-extrabold">{latestRun.status.toUpperCase()}</div>
                <p className="text-sm text-[#d9d5c8]">{runHumanSummary(latestRun)}</p>
                <Button variant="secondary" className="w-full" onClick={() => onInspect(latestRun)}>Abrir detalhe</Button>
              </div>
            ) : (
              <p className="text-sm text-[#d9d5c8]">Sem execucao para diagnosticar.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ProjectsPanel(props: {
  projects: Project[];
  selectedProject: string;
  envs: Environment[];
  editingProjectId: string;
  projectName: string;
  projectDescription: string;
  setProjectName: (value: string) => void;
  setProjectDescription: (value: string) => void;
  onSaveProject: (formData: FormData) => Promise<void>;
  onEditProject: (project: Project) => void;
  onNewProject: () => void;
  onDeleteProject: (project: Project) => Promise<void>;
  onCreateEnv: (formData: FormData) => Promise<void>;
}) {
  const editingProject = props.projects.find((project) => project.id === props.editingProjectId);
  return (
    <div className="grid gap-6">
      <div className="grid gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
        <Card className="border-primary/20">
          <CardHeader className="flex-row items-start justify-between gap-4">
            <div>
              <CardTitle>{props.editingProjectId ? 'Editar projeto' : 'Novo projeto'}</CardTitle>
              <CardDescription>
                {props.editingProjectId ? `Alterando ${editingProject?.name ?? shortId(props.editingProjectId)}.` : 'Cria o container de suites, ambientes e runs.'}
              </CardDescription>
            </div>
            {props.editingProjectId ? (
              <Button type="button" variant="outline" size="sm" onClick={props.onNewProject}>
                <Plus className="h-4 w-4" />
                Novo
              </Button>
            ) : null}
          </CardHeader>
          <CardContent>
            <FormShell
              onSubmit={props.onSaveProject}
              submitLabel={props.editingProjectId ? 'Atualizar projeto' : 'Criar projeto'}
              pendingLabel={props.editingProjectId ? 'Atualizando...' : 'Criando...'}
            >
              <Label>Nome</Label>
              <Input name="name" placeholder="CRM legado" value={props.projectName} onChange={(event) => props.setProjectName(event.target.value)} required />
              <Label>Descricao</Label>
              <Textarea
                name="description"
                placeholder="Sistema de vendas, ambiente hml, smoke critico"
                value={props.projectDescription}
                onChange={(event) => props.setProjectDescription(event.target.value)}
              />
            </FormShell>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Projetos</CardTitle>
            <CardDescription>Gerencie o escopo antes de criar suites e ambientes.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {props.projects.length === 0 ? <EmptyState title="Nenhum projeto" description="Crie o primeiro projeto para habilitar o restante do fluxo." /> : null}
            {props.projects.map((project) => (
              <div key={project.id} className={cn('rounded-md border bg-card p-4', project.id === props.selectedProject && 'border-primary bg-primary/5')}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">{project.name}</p>
                      {project.id === props.selectedProject ? <Badge variant="success">ativo</Badge> : null}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{project.description || 'Sem descricao.'}</p>
                    <p className="mt-2 font-mono text-xs text-muted-foreground">{shortId(project.id)}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      aria-label={`Editar projeto ${project.name}`}
                      onClick={() => props.onEditProject(project)}
                    >
                      <Pencil className="h-4 w-4" />
                      Editar
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      aria-label={`Arquivar projeto ${project.name}`}
                      onClick={() => props.onDeleteProject(project)}
                    >
                      <Archive className="h-4 w-4" />
                      Arquivar
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <EnvironmentsPanel envs={props.envs} onCreateEnv={props.onCreateEnv} />
    </div>
  );
}

function SuitesPanel(props: {
  suites: Suite[];
  spec: string;
  setSpec: (value: string) => void;
  editingSuiteId: string;
  suiteName: string;
  setSuiteName: (value: string) => void;
  suiteType: 'api' | 'web';
  setSuiteType: (value: 'api' | 'web') => void;
  onCreateSuite: (formData: FormData) => Promise<void>;
  onEditSuite: (suite: Suite) => Promise<void>;
  onNewSuite: () => void;
  onImportOpenApi: (formData: FormData) => Promise<void>;
}) {
  return (
    <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
      <Card>
        <CardHeader>
          <CardTitle>Suite Library</CardTitle>
          <CardDescription>Contratos API e smoke tests web do projeto.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2">
          {props.suites.length === 0 ? <EmptyState title="Nenhuma suite" description="Crie YAML ou importe OpenAPI." /> : null}
          {props.suites.map((suite) => (
            <button
              key={suite.id}
              type="button"
              onClick={() => props.onEditSuite(suite)}
              className={cn(
                'cursor-pointer rounded-md border bg-card p-3 text-left transition-colors hover:border-primary/40 hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                props.editingSuiteId === suite.id && 'border-primary bg-primary/5',
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-semibold">{suite.name}</p>
                  <p className="font-mono text-xs text-muted-foreground">{shortId(suite.id)}</p>
                </div>
                <Badge variant={suite.type === 'api' ? 'secondary' : 'outline'}>{suite.type}</Badge>
              </div>
            </button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle>{props.editingSuiteId ? 'Editar suite' : 'Spec Studio'}</CardTitle>
            <CardDescription>
              {props.editingSuiteId ? `Alterando ${shortId(props.editingSuiteId)}. Salvar atualiza a suite selecionada.` : 'Crie uma suite versionavel em YAML.'}
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={props.onNewSuite}>Nova suite</Button>
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline"><Braces className="h-4 w-4" /> Import OpenAPI</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Importar OpenAPI</DialogTitle>
                  <DialogDescription>Gera uma suite API basica a partir de `paths` e responses 2xx.</DialogDescription>
                </DialogHeader>
                <FormShell onSubmit={props.onImportOpenApi} submitLabel="Importar">
                  <Label>Nome</Label>
                  <Input name="name" placeholder="catalog-api" />
                  <Label>OpenAPI JSON</Label>
                  <Textarea name="spec" className="min-h-72 font-mono text-xs" placeholder='{"openapi":"3.0.0","paths":{"/health":{"get":{"responses":{"200":{"description":"ok"}}}}}}' />
                </FormShell>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          <FormShell onSubmit={props.onCreateSuite} submitLabel={props.editingSuiteId ? 'Atualizar suite' : 'Criar suite'}>
            <div className="grid gap-3 md:grid-cols-[1fr_160px]">
              <div className="grid gap-2">
                <Label>Nome da suite</Label>
                <Input name="name" placeholder="login-smoke" value={props.suiteName} onChange={(event) => props.setSuiteName(event.target.value)} required />
              </div>
              <div className="grid gap-2">
                <Label>Tipo</Label>
                <Select name="type" value={props.suiteType} onValueChange={(value) => props.setSuiteType(value as 'api' | 'web')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="api">api</SelectItem>
                    <SelectItem value="web">web</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Label>YAML</Label>
            <Textarea className="min-h-[430px] font-mono text-xs leading-5" value={props.spec} onChange={(event) => props.setSpec(event.target.value)} />
          </FormShell>
        </CardContent>
      </Card>
    </div>
  );
}

function RunsPanel(props: {
  runs: Run[];
  suites: Suite[];
  envs: Environment[];
  selectedRun: Run | null;
  selectedRunSuite?: Suite;
  selectedRunEnv?: Environment;
  report: RunReport | null;
  aiOutput: string;
  onInspect: (run: Run) => void;
  onCancel: (run: Run) => void;
  onExplain: (run: Run) => void;
}) {
  return (
    <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_520px]">
      <Card>
        <CardHeader>
          <CardTitle>Run Ledger</CardTitle>
          <CardDescription>Historico limpo: status, suite, ambiente, report e diagnostico.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2">
          {props.runs.length === 0 ? <EmptyState title="Nenhuma run neste projeto" /> : null}
          {props.runs.map((run) => (
            <RunRow
              key={run.id}
              run={run}
              suite={props.suites.find((suite) => suite.id === run.suiteId)}
              env={props.envs.find((env) => env.id === run.environmentId)}
              selected={props.selectedRun?.id === run.id}
              onInspect={props.onInspect}
              onCancel={props.onCancel}
            />
          ))}
        </CardContent>
      </Card>

      <Card className="2xl:sticky 2xl:top-24 2xl:max-h-[calc(100vh-7rem)]">
        <CardHeader>
          <CardTitle>Failure Dossier</CardTitle>
          <CardDescription>Resumo humano, steps e artifacts da run selecionada.</CardDescription>
        </CardHeader>
        <CardContent>
          {!props.selectedRun ? <EmptyState title="Selecione uma run" description="O detalhe aparece aqui, sem despejar JSON bruto." /> : null}
          {props.selectedRun ? (
            <ScrollArea className="h-[calc(100vh-14rem)] pr-4">
              <div className="space-y-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <Badge variant={statusVariant(props.selectedRun.status)}>{props.selectedRun.status}</Badge>
                    <h3 className="mt-3 text-xl font-extrabold">{props.selectedRunSuite?.name ?? 'Suite removida'}</h3>
                    <p className="text-sm text-muted-foreground">{props.selectedRunEnv?.name ?? 'Ambiente removido'} · {formatDate(props.selectedRun.createdAt)}</p>
                  </div>
                  {props.selectedRun.reportHtmlPath ? (
                    <Button asChild variant="outline" size="sm">
                      <a href={`${apiBase}/artifacts?path=${encodeURIComponent(props.selectedRun.reportHtmlPath)}`} target="_blank">Report</a>
                    </Button>
                  ) : null}
                </div>

                <div className="rounded-md border bg-muted/40 p-3 text-sm">{runHumanSummary(props.selectedRun)}</div>
                {props.selectedRun.error ? <pre className="overflow-auto rounded-md bg-[#151915] p-3 font-mono text-xs text-[#f7f6f0]">{props.selectedRun.error}</pre> : null}

                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" onClick={() => props.onExplain(props.selectedRun!)}><Bot className="h-4 w-4" /> Explicar com IA</Button>
                  {['queued', 'running'].includes(props.selectedRun.status) ? <Button variant="destructive" size="sm" onClick={() => props.onCancel(props.selectedRun!)}><Square className="h-4 w-4" /> Cancelar</Button> : null}
                </div>

                {props.report?.results?.length ? (
                  <div>
                    <h4 className="mb-2 text-sm font-semibold">Timeline</h4>
                    <div className="space-y-2">
                      {props.report.results.map((result) => (
                        <div key={result.name} className="rounded-md border p-3">
                          <div className="flex items-center justify-between gap-3">
                            <span className="font-semibold">{result.name}</span>
                            <Badge variant={statusVariant(result.status)}>{result.status}</Badge>
                          </div>
                          {result.error ? <p className="mt-2 text-sm text-destructive">{result.error}</p> : null}
                          {result.steps?.length ? (
                            <div className="mt-3 space-y-2">
                              {result.steps.map((step) => (
                                <div key={`${result.name}:${step.index}`} className="grid gap-2 rounded-md bg-muted/50 p-2 text-xs md:grid-cols-[64px_minmax(0,1fr)_72px] md:items-start">
                                  <Badge variant={statusVariant(step.status)}>{step.status}</Badge>
                                  <span className="min-w-0 break-words font-mono text-muted-foreground">{step.name}</span>
                                  <span className="font-mono text-muted-foreground md:text-right">{step.durationMs}ms</span>
                                  {step.error ? <p className="text-destructive md:col-span-3">{step.error}</p> : null}
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                <ArtifactsList report={props.report} run={props.selectedRun} />

                {props.aiOutput ? (
                  <div>
                    <h4 className="mb-2 text-sm font-semibold">AI Review</h4>
                    <pre className="overflow-auto rounded-md bg-[#151915] p-3 font-mono text-xs text-[#f7f6f0]">{props.aiOutput}</pre>
                  </div>
                ) : null}
              </div>
            </ScrollArea>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function EnvironmentsPanel({ envs, onCreateEnv }: { envs: Environment[]; onCreateEnv: (formData: FormData) => Promise<void> }) {
  return (
    <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
      <Card>
        <CardHeader>
          <CardTitle>Novo ambiente</CardTitle>
          <CardDescription>Base URL e variaveis mascaradas por ambiente.</CardDescription>
        </CardHeader>
        <CardContent>
          <FormShell onSubmit={onCreateEnv} submitLabel="Criar ambiente">
            <Label>Nome</Label>
            <Input name="name" placeholder="hml" />
            <Label>Base URL</Label>
            <Input name="baseUrl" placeholder="https://httpbin.org" />
            <Label>Variaveis</Label>
            <Textarea name="variables" className="min-h-32 font-mono text-xs" placeholder="TOKEN=abc" />
          </FormShell>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Ambientes</CardTitle>
          <CardDescription>Destinos onde as suites rodam. TestHub nao sobe aplicacao.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {envs.length === 0 ? <EmptyState title="Nenhum ambiente" /> : null}
          {envs.map((env) => (
            <div key={env.id} className="rounded-md border p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-semibold">{env.name}</p>
                  <p className="text-sm text-muted-foreground">{env.baseUrl}</p>
                </div>
                <Badge variant="outline">{Object.keys(env.variables ?? {}).length} vars</Badge>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function DocsPanel({ page }: { page: DocsPageId | string }) {
  const selected = docsNavItems.find((item) => item.slug === page) ?? docsNavItems[0];
  return (
    <div className="grid gap-6">
      <Card className="border-primary/30 bg-[#151915] text-[#f7f6f0]">
        <CardHeader>
          <Badge className="w-fit" variant="success">Wiki v1</Badge>
          <CardTitle className="text-3xl text-[#c7d957]">{selected.label}</CardTitle>
          <CardDescription className="max-w-3xl text-[#d9d5c8]">
            Wiki TestHub. Cada submenu da sidebar e uma rota propria com exemplo real e explicacao direta.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          <DocStat label="Escopo" value="projeto" />
          <DocStat label="Destino" value="ambiente" />
          <DocStat label="Contrato" value="suite YAML" />
          <DocStat label="Evidencia" value="run" />
        </CardContent>
      </Card>

      <WikiCallout title="Regra central" text="TestHub nao sobe aplicacao. Ele executa contra URL existente e guarda evidencia. Use o submenu Docs na sidebar para navegar por assunto." />

      <DocsArticle page={selected.slug} />
    </div>
  );
}

function DocsArticle({ page }: { page: DocsPageId }) {
  if (page === 'mental-model') {
    return (
      <WikiSection id="mental-model" eyebrow="Fundacao" title="Modelo mental" description="Cada entidade tem responsabilidade unica. Isso evita dashboard confuso e suite errada.">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <DocBullet title="Projeto" text="Agrupa um sistema: CRM, ERP, Docin, Billing." />
          <DocBullet title="Ambiente" text="Destino de execucao: hml, staging, prod-smoke. Aqui fica Base URL." />
          <DocBullet title="Suite" text="Contrato versionavel em YAML. Pode ser `api` ou `web`." />
          <DocBullet title="Run" text="Execucao de uma suite em um ambiente. Gera status e evidencia." />
        </div>
      </WikiSection>
    );
  }
  if (page === 'project-env') {
    return (
      <WikiSection id="project-env" eyebrow="Configuracao" title="Projeto e ambiente" description="Base URL nao fica em Settings. Ela pertence ao ambiente do projeto.">
        <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
          <WikiList title="Exemplo de organizacao" items={['Projeto: CRM legado', 'Ambiente: hml -> https://crm-hml.local', 'Ambiente: prod-smoke -> https://crm.empresa.com', 'Variaveis: TOKEN, CRM_USER, CRM_PASS']} />
          <WikiList title="Boas praticas" items={['Use um projeto por sistema.', 'Use ambiente por destino real.', 'Nao coloque segredo no YAML.', 'Prefira variaveis no ambiente.']} />
        </div>
      </WikiSection>
    );
  }
  if (page === 'api-suite') return <WikiSection id="api-suite" eyebrow="Receita API" title="Health check + contrato JSON" description="Use para validar endpoint vivo, tempo maximo e formato de response."><DocExample code={docsApiSpec} /></WikiSection>;
  if (page === 'api-auth') return <WikiSection id="api-auth" eyebrow="Receita API" title="Auth negativa e positiva" description="Primeiro teste garante que endpoint protege dado. Segundo garante que token valido funciona."><DocExample code={docsApiAuthSpec} /></WikiSection>;
  if (page === 'api-chain') return <WikiSection id="api-chain" eyebrow="Receita API" title="Encadear requests com extract" description="Use `extract` quando uma response alimenta request seguinte. Bom para token, id criado, protocolo, slug."><DocExample code={docsApiChainSpec} /></WikiSection>;
  if (page === 'web-suite') return <WikiSection id="web-suite" eyebrow="Receita web" title="Login invalido com video" description="Suite web usa Playwright. Run salva video por padrao para evidenciar o que aconteceu."><DocExample code={docsWebSpec} /></WikiSection>;
  if (page === 'web-form') return <WikiSection id="web-form" eyebrow="Receita web" title="CRUD simples em tela" description="Exemplo de preenchimento de formulario, select, click e validacao de URL/texto."><DocExample code={docsWebFormSpec} /></WikiSection>;
  if (page === 'selectors') {
    return (
      <WikiSection id="selectors" eyebrow="Sintaxe web" title="Seletores recomendados" description="Seletores decidem se teste sera estavel ou fragil. Ordem recomendada: label, role, testId, css.">
        <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
          <DocExample code={docsSelectorSpec} />
          <div className="grid gap-3">
            <DocBullet title="label" text="Melhor para inputs. Ex.: campo Email com label visivel." />
            <DocBullet title="role" text="Melhor para botao/link. Ex.: role button + name Entrar." />
            <DocBullet title="testId" text="Melhor quando UI muda muito mas comportamento continua." />
            <DocBullet title="css" text="Use so quando legado nao oferece alternativa." />
          </div>
        </div>
      </WikiSection>
    );
  }
  if (page === 'upload') return <WikiSection id="upload" eyebrow="Receita web" title="Upload de arquivo" description="Use `uploadFile` para validar fluxo de anexos em legado ou sistemas internos."><DocExample code={docsWebUploadSpec} /></WikiSection>;
  if (page === 'variables') {
    return (
      <WikiSection id="variables" eyebrow="Variaveis" title="Variaveis e secrets" description="Use `${VAR}` no YAML. Na UI, valores ficam no ambiente do projeto. Na CLI, podem vir de `.env`.">
        <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
          <DocExample code={docsEnvFile} />
          <DocExample code={docsCliRun} />
        </div>
        <WikiCallout title="Seguranca" text="Reports mascaram variaveis sensiveis. Mesmo assim, nunca coloque senha fixa dentro do YAML da suite." />
      </WikiSection>
    );
  }
  if (page === 'results') {
    return (
      <WikiSection id="results" eyebrow="Operacao" title="Resultados e artifacts" description="Runs mostram status e evidencias certas para cada tipo de suite.">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <DocBullet title="passed" text="Todos asserts passaram." />
          <DocBullet title="failed" text="App respondeu, mas assert falhou." />
          <DocBullet title="error" text="Erro infra: YAML invalido, URL fora, arquivo ausente." />
          <DocBullet title="deleted" text="Run arquivada por soft delete." />
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <DocBullet title="Web" text="Video `.webm`, screenshot de falha e HTML report." />
          <DocBullet title="API" text="Request, response, status, payload e JSON report." />
          <DocBullet title="IA opcional" text="Pode explicar falha e sugerir ajuste; runner nao depende disso." />
        </div>
      </WikiSection>
    );
  }
  if (page === 'troubleshooting') {
    return (
      <WikiSection id="troubleshooting" eyebrow="Debug" title="Troubleshooting" description="Problemas comuns e onde olhar primeiro.">
        <div className="grid gap-3 md:grid-cols-2">
          <DocBullet title="ENOENT suite" text="Spec aponta para arquivo inexistente. Edite ou recrie suite; path antigo nao deve ser usado." />
          <DocBullet title="error vs failed" text="`error` e infra/config. `failed` e assert do teste." />
          <DocBullet title="Elemento nao encontrado" text="Troque CSS por label/role/testId. Confirme texto exato da tela." />
          <DocBullet title="Base URL errada" text="Corrija no ambiente do projeto, nao em Settings." />
          <DocBullet title="Sem video" text="Video existe para suite web. API mostra payload, nao gravacao." />
          <DocBullet title="Variavel ausente" text="Cadastre no ambiente ou informe `.env` via CLI." />
        </div>
      </WikiSection>
    );
  }
  return (
    <WikiSection id="quick-start" eyebrow="Primeiro uso" title="Comeco rapido" description="Caminho feliz para sair de zero ate uma run com evidencia.">
      <div className="grid gap-3 md:grid-cols-5">
        {[
          ['1', 'Projects', 'Crie projeto para isolar sistema/time.'],
          ['2', 'Ambiente', 'Cadastre Base URL e variaveis.'],
          ['3', 'Suites', 'Cole YAML api ou web.'],
          ['4', 'Run', 'Escolha ambiente + suite e execute.'],
          ['5', 'Runs', 'Abra report, video ou payload.'],
        ].map(([index, title, text]) => <StepCard key={index} index={index} title={title} text={text} />)}
      </div>
      <WikiCallout title="Quando usar" text="Smoke de login, contrato de endpoint, auth negativa, fluxo legado critico, validacao pos deploy." />
    </WikiSection>
  );
}

function WikiSection({ id, eyebrow, title, description, children }: { id: string; eyebrow: string; title: string; description: string; children: React.ReactNode }) {
  return (
    <Card id={id} className="scroll-mt-24 overflow-hidden">
      <CardHeader>
        <p className="font-mono text-xs uppercase tracking-[0.16em] text-primary">{eyebrow}</p>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {children}
      </CardContent>
    </Card>
  );
}

function DocExample({ code }: { code: string }) {
  return <CodeBlock code={code} />;
}

function CodeBlock({ code }: { code: string }) {
  return (
    <pre className="max-h-[560px] overflow-auto rounded-md bg-[#151915] p-4 font-mono text-xs leading-5 text-[#f7f6f0]">
      <code>{code}</code>
    </pre>
  );
}

function StepCard({ index, title, text }: { index: string; title: string; text: string }) {
  return (
    <div className="rounded-md border bg-muted/30 p-4">
      <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary font-mono text-xs font-bold text-primary-foreground">{index}</span>
      <p className="mt-3 font-semibold">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{text}</p>
    </div>
  );
}

function WikiList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-md border bg-muted/30 p-4">
      <p className="font-semibold">{title}</p>
      <ul className="mt-3 grid gap-2 text-sm text-muted-foreground">
        {items.map((item) => <li key={item} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />{item}</li>)}
      </ul>
    </div>
  );
}

function WikiCallout({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-md border border-primary/30 bg-primary/10 p-4">
      <p className="font-semibold text-primary">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{text}</p>
    </div>
  );
}

function DocStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.04] p-3">
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[#d9d5c8]">{label}</p>
      <p className="mt-1 text-lg font-extrabold">{value}</p>
    </div>
  );
}

function DocBullet({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-md border bg-card p-3">
      <p className="font-mono text-xs font-bold text-primary">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{text}</p>
    </div>
  );
}

function AiPanel({ connections, onCreateConnection }: { connections: AiConnection[]; onCreateConnection: (formData: FormData) => Promise<void> }) {
  return (
    <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
      <Card>
        <CardHeader>
          <CardTitle>AI connection</CardTitle>
          <CardDescription>Opcional. Runner continua deterministico sem IA.</CardDescription>
        </CardHeader>
        <CardContent>
          <FormShell onSubmit={onCreateConnection} submitLabel="Salvar connection">
            <Label>Nome</Label>
            <Input name="name" placeholder="OpenRouter QA" />
            <Label>Provider</Label>
            <Select name="provider" defaultValue="openrouter">
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="openrouter">OpenRouter</SelectItem>
                <SelectItem value="openai">OpenAI</SelectItem>
                <SelectItem value="anthropic">Anthropic</SelectItem>
              </SelectContent>
            </Select>
            <Label>Modelo</Label>
            <Input name="model" placeholder="openai/gpt-4o-mini" />
            <Label>API key</Label>
            <Input name="apiKey" type="password" placeholder="sk-..." />
            <Label>Endpoint do provider</Label>
            <Input name="baseUrl" placeholder="https://openrouter.ai/api/v1" />
          </FormShell>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Connections</CardTitle>
          <CardDescription>Chaves ficam criptografadas e nunca aparecem no report.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {connections.length === 0 ? <EmptyState title="IA desabilitada" description="Sem connection, botoes de IA retornam erro controlado." /> : null}
          {connections.map((connection) => (
            <div key={connection.id} className="rounded-md border p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-semibold">{connection.name}</p>
                  <p className="text-sm text-muted-foreground">{connection.provider} · {connection.model}</p>
                </div>
                <Badge variant={connection.enabled ? 'success' : 'muted'}>{connection.enabled ? 'enabled' : 'disabled'}</Badge>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function SettingsPanel(props: {
  connections: AiConnection[];
  onCreateConnection: (formData: FormData) => Promise<void>;
  onRefresh: () => Promise<void>;
  onCleanup: () => Promise<void>;
}) {
  return (
    <div className="grid gap-6">
      <AiPanel connections={props.connections} onCreateConnection={props.onCreateConnection} />
      <Card>
        <CardHeader>
          <CardTitle>Operacao</CardTitle>
          <CardDescription>API fica em `:4321`; UI oficial fica em `:3333`.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <Button variant="outline" onClick={props.onRefresh}><RefreshCw className="h-4 w-4" /> Atualizar</Button>
          <Button variant="outline" asChild><a href={`${apiBase}/docs`} target="_blank"><Boxes className="h-4 w-4" /> Swagger</a></Button>
          <Button variant="destructive" onClick={props.onCleanup}><Database className="h-4 w-4" /> Arquivar &gt;1d</Button>
        </CardContent>
      </Card>
    </div>
  );
}

function ProjectSelector({ projects, value, onChange }: { projects: Project[]; value: string; onChange: (value: string) => void }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.04] p-3">
      <Label className="mb-2 block text-xs uppercase tracking-wide text-[#d9d5c8]">Projeto ativo</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="border-white/10 bg-[#0f130f] text-[#f7f6f0]">
          <SelectValue placeholder="Criar projeto em Sistema" />
        </SelectTrigger>
        <SelectContent>
          {projects.map((project) => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

function LabeledSelect(props: { label: string; value: string; onValueChange: (value: string) => void; placeholder: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">{props.label}</Label>
      <Select value={props.value} onValueChange={props.onValueChange}>
        <SelectTrigger><SelectValue placeholder={props.placeholder} /></SelectTrigger>
        <SelectContent>{props.children}</SelectContent>
      </Select>
    </div>
  );
}

function FormShell({ children, onSubmit, submitLabel, pendingLabel }: { children: React.ReactNode; onSubmit: (formData: FormData) => Promise<void>; submitLabel: string; pendingLabel?: string }) {
  const [pending, setPending] = useState(false);
  return (
    <form
      className="grid gap-3"
      onSubmit={async (event) => {
        event.preventDefault();
        setPending(true);
        try {
          await onSubmit(new FormData(event.currentTarget));
        } finally {
          setPending(false);
        }
      }}
    >
      {children}
      <Button type="submit" className="mt-2" disabled={pending}>
        {pending ? <RefreshCw className="h-4 w-4 animate-spin" /> : null}
        {pending ? pendingLabel ?? 'Salvando...' : submitLabel}
      </Button>
    </form>
  );
}

function MetricCard({ label, value, icon: Icon, tone }: { label: string; value: number; icon: typeof CheckCircle2; tone: 'success' | 'danger' | 'warning' | 'neutral' }) {
  return (
    <Card className={cn(tone === 'success' && 'border-emerald-300', tone === 'danger' && 'border-red-300', tone === 'warning' && 'border-amber-300')}>
      <CardContent className="flex items-center justify-between p-5">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-1 text-3xl font-extrabold">{value}</p>
        </div>
        <div className="flex h-11 w-11 items-center justify-center rounded-md bg-muted">
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  );
}

function RunRow(props: { run: Run; suite?: Suite; env?: Environment; selected?: boolean; onInspect: (run: Run) => void; onCancel?: (run: Run) => void }) {
  const { run, suite, env, selected, onInspect, onCancel } = props;
  return (
    <div className={cn('grid gap-3 rounded-md border bg-card p-3 transition-colors md:grid-cols-[140px_1fr_auto] md:items-center', selected && 'border-primary bg-primary/5')}>
      <div className="flex items-center gap-2">
        <StatusIcon status={run.status} />
        <Badge variant={statusVariant(run.status)}>{run.status}</Badge>
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold">{suite?.name ?? 'Suite removida'}</p>
          <Badge variant="outline">{suite?.type ?? 'unknown'}</Badge>
          <span className="text-sm text-muted-foreground">{env?.name ?? 'Ambiente removido'}</span>
        </div>
        <p className="mt-1 truncate font-mono text-xs text-muted-foreground">{shortId(run.id)} · {formatDate(run.createdAt)}</p>
        <p className="mt-1 text-sm text-muted-foreground">{runHumanSummary(run)}</p>
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        {run.reportHtmlPath ? <Button asChild variant="outline" size="sm"><a href={`${apiBase}/artifacts?path=${encodeURIComponent(run.reportHtmlPath)}`} target="_blank">Report</a></Button> : null}
        {['queued', 'running'].includes(run.status) && onCancel ? <Button variant="destructive" size="sm" onClick={() => onCancel(run)}>Cancelar</Button> : null}
        <Button variant="secondary" size="sm" onClick={() => onInspect(run)}>Detalhe</Button>
      </div>
    </div>
  );
}

function ArtifactsList({ report, run }: { report: RunReport | null; run: Run }) {
  const artifacts = [
    ...(report?.artifacts ?? []),
    ...((report?.results ?? []).flatMap((result) => result.artifacts ?? [])),
  ];
  const apiArtifacts = artifacts.filter((artifact) => artifact.type === 'request' || artifact.type === 'response');
  if (!run.reportHtmlPath && artifacts.length === 0) return null;
  return (
    <div className="space-y-4">
      {artifacts.some((artifact) => artifact.type === 'video') ? (
        <div>
          <h4 className="mb-2 text-sm font-semibold">Gravacao Playwright</h4>
          <div className="grid gap-3">
            {artifacts.filter((artifact) => artifact.type === 'video').map((artifact) => (
              <div key={`player:${artifact.path}`} className="overflow-hidden rounded-md border bg-[#151915]">
                <video className="aspect-video w-full bg-black" src={`${apiBase}/artifacts?path=${encodeURIComponent(artifact.path)}`} controls preload="metadata" />
                <div className="flex items-center justify-between gap-3 px-3 py-2 text-sm text-[#f7f6f0]">
                  <span>{artifact.label ?? 'Playwright video'}</span>
                  <a className="font-semibold text-[#c7d957] underline-offset-4 hover:underline" href={`${apiBase}/artifacts?path=${encodeURIComponent(artifact.path)}`} target="_blank">Abrir</a>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {apiArtifacts.length > 0 ? (
        <div>
          <h4 className="mb-2 text-sm font-semibold">Request / Response</h4>
          <div className="grid gap-3">
            {apiArtifacts.map((artifact) => <ArtifactJsonPreview key={`${artifact.type}:${artifact.path}`} artifact={artifact} />)}
          </div>
        </div>
      ) : null}

      <div>
        <h4 className="mb-2 text-sm font-semibold">Artifacts</h4>
      <div className="grid gap-3">
        {run.reportHtmlPath ? (
          <a className="rounded-md border p-2 text-sm font-semibold text-primary hover:bg-muted" href={`${apiBase}/artifacts?path=${encodeURIComponent(run.reportHtmlPath)}`} target="_blank">HTML report</a>
        ) : null}
        {artifacts.filter((artifact) => artifact.type !== 'video' && artifact.type !== 'request' && artifact.type !== 'response').map((artifact) => (
          <a key={`${artifact.type}:${artifact.path}`} className="rounded-md border p-2 text-sm hover:bg-muted" href={`${apiBase}/artifacts?path=${encodeURIComponent(artifact.path)}`} target="_blank">
            <span className="font-semibold">{artifact.type}</span>
            <span className="ml-2 text-muted-foreground">{artifact.label ?? shortPath(artifact.path)}</span>
          </a>
        ))}
      </div>
      </div>
    </div>
  );
}

function ArtifactJsonPreview({ artifact }: { artifact: Artifact }) {
  const [payload, setPayload] = useState<unknown>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    fetch(`${apiBase}/artifacts?path=${encodeURIComponent(artifact.path)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error(await response.text());
        return response.json() as Promise<unknown>;
      })
      .then((nextPayload) => {
        if (active) setPayload(nextPayload);
      })
      .catch((nextError) => {
        if (active) setError(messageOf(nextError));
      });
    return () => {
      active = false;
    };
  }, [artifact.path]);

  const summary = summarizeHttpArtifact(artifact.type, payload);
  return (
    <div className="rounded-md border bg-card p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-semibold">{artifact.label ?? artifact.type}</p>
          <p className="font-mono text-xs text-muted-foreground">{summary}</p>
        </div>
        <Badge variant={artifact.type === 'response' ? 'secondary' : 'outline'}>{artifact.type}</Badge>
      </div>
      {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
      {payload ? (
        <pre className="mt-3 max-h-64 overflow-auto rounded-md bg-[#151915] p-3 font-mono text-xs leading-5 text-[#f7f6f0]">
          {JSON.stringify(payload, null, 2)}
        </pre>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">Carregando payload...</p>
      )}
    </div>
  );
}

function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="rounded-md border border-dashed bg-muted/40 p-6 text-center">
      <p className="font-semibold">{title}</p>
      {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
    </div>
  );
}

function StatusIcon({ status }: { status: RunStatus }) {
  if (status === 'passed') return <CheckCircle2 className="h-4 w-4 text-emerald-700" />;
  if (status === 'failed' || status === 'error') return <XCircle className="h-4 w-4 text-red-700" />;
  if (status === 'queued' || status === 'running') return <Clock3 className="h-4 w-4 text-amber-700" />;
  return <Square className="h-4 w-4 text-muted-foreground" />;
}

function summarizeRuns(runs: Run[]) {
  return {
    passed: runs.filter((run) => run.status === 'passed').length,
    failed: runs.filter((run) => run.status === 'failed').length,
    error: runs.filter((run) => run.status === 'error').length,
    active: runs.filter((run) => run.status === 'queued' || run.status === 'running').length,
  };
}

function statusVariant(status: RunStatus): 'success' | 'warning' | 'destructive' | 'muted' | 'secondary' {
  if (status === 'passed') return 'success';
  if (status === 'failed' || status === 'error') return 'destructive';
  if (status === 'queued' || status === 'running') return 'warning';
  if (status === 'canceled') return 'muted';
  if (status === 'deleted') return 'muted';
  return 'secondary';
}

function runHumanSummary(run: Run): string {
  if (run.error) return run.error;
  const summary = run.summary;
  if (!summary) return 'Sem report final ainda.';
  return `${summary.passed ?? 0}/${summary.total ?? 0} passaram, ${summary.failed ?? 0} falharam, ${summary.error ?? 0} erro infra.`;
}

async function api<T>(apiPath: string, options: RequestInit = {}): Promise<T> {
  const headers = {
    ...(options.body ? { 'content-type': 'application/json' } : {}),
    ...(options.headers ?? {}),
  };
  const response = await fetch(`${apiBase}${apiPath}`, { ...options, headers });
  if (!response.ok) throw new Error(await response.text());
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

function parseVars(input: string): Record<string, string> {
  return Object.fromEntries(input.split('\n').filter(Boolean).map((line) => {
    const index = line.indexOf('=');
    if (index === -1) return [line.trim(), ''];
    return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
  }));
}

function formatDate(value?: string | null): string {
  if (!value) return '-';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

function shortId(value: string): string {
  return value.slice(0, 8);
}

function shortPath(value: string): string {
  return value.split('/').slice(-2).join('/');
}

function summarizeHttpArtifact(type: Artifact['type'], payload: unknown): string {
  if (!payload || typeof payload !== 'object') return type;
  const record = payload as Record<string, unknown>;
  if (type === 'request') {
    return [record.method, record.url].filter(Boolean).join(' ');
  }
  if (type === 'response') {
    return [`status ${record.status ?? '-'}`, `${record.durationMs ?? '-'}ms`].join(' · ');
  }
  return type;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
