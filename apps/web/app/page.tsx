'use client';

import { useEffect, useMemo, useState } from 'react';
import type React from 'react';
import {
  Activity,
  Bot,
  Boxes,
  Braces,
  CheckCircle2,
  Clock3,
  Database,
  FileCode2,
  Gauge,
  Globe2,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

type Project = { id: string; name: string; description?: string };
type Environment = { id: string; projectId: string; name: string; baseUrl: string; variables?: Record<string, string> };
type Suite = { id: string; projectId: string; name: string; type: 'api' | 'web'; specPath?: string };
type RunStatus = 'queued' | 'running' | 'passed' | 'failed' | 'error' | 'canceled';
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
type RunReport = { artifacts?: Artifact[]; results?: Array<{ name: string; status: RunStatus; durationMs?: number; error?: string; artifacts?: Artifact[]; steps?: Array<{ name: string; status: RunStatus; error?: string; durationMs?: number }> }> };
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

const navItems = [
  { id: 'overview', label: 'Overview', icon: Gauge },
  { id: 'suites', label: 'Suites', icon: FileCode2 },
  { id: 'runs', label: 'Runs', icon: Activity },
  { id: 'environments', label: 'Ambientes', icon: Globe2 },
  { id: 'ai', label: 'AI', icon: Bot },
  { id: 'system', label: 'Sistema', icon: Settings2 },
] as const;

type View = (typeof navItems)[number]['id'];

export default function Page() {
  const [view, setView] = useState<View>('overview');
  const [projects, setProjects] = useState<Project[]>([]);
  const [envs, setEnvs] = useState<Environment[]>([]);
  const [suites, setSuites] = useState<Suite[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [aiConnections, setAiConnections] = useState<AiConnection[]>([]);
  const [selectedProject, setSelectedProject] = useState('');
  const [selectedEnv, setSelectedEnv] = useState('');
  const [selectedSuite, setSelectedSuite] = useState('');
  const [selectedRun, setSelectedRun] = useState<Run | null>(null);
  const [report, setReport] = useState<RunReport | null>(null);
  const [spec, setSpec] = useState(defaultSpec);
  const [aiOutput, setAiOutput] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

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

  async function createProject(formData: FormData) {
    await mutate(() => api('/api/projects', { method: 'POST', body: JSON.stringify({ name: formData.get('name'), description: formData.get('description') || undefined }) }));
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
    }));
  }

  async function createSuite(formData: FormData) {
    await mutate(() => api('/api/suites', {
      method: 'POST',
      body: JSON.stringify({ projectId: selectedProject, name: formData.get('name'), type: formData.get('type'), specContent: spec }),
    }));
  }

  async function importOpenApi(formData: FormData) {
    await mutate(() => api('/api/import/openapi', {
      method: 'POST',
      body: JSON.stringify({
        projectId: selectedProject,
        name: formData.get('name') || 'openapi-import',
        spec: JSON.parse(String(formData.get('spec') || '{}')),
      }),
    }));
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
    }));
  }

  async function runSuite() {
    if (!selectedProject || !selectedEnv || !selectedSuite) {
      setError('Escolha projeto, ambiente e suite antes de executar.');
      return;
    }
    await mutate(async () => {
      const run = await api<Run>('/api/runs', { method: 'POST', body: JSON.stringify({ projectId: selectedProject, environmentId: selectedEnv, suiteId: selectedSuite }) });
      setSelectedRun(run);
      setView('runs');
    });
  }

  async function cancelRun(run: Run) {
    await mutate(() => api(`/api/runs/${run.id}/cancel`, { method: 'POST', body: '{}' }));
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
    }, false);
  }

  async function explain(run: Run) {
    setAiOutput('');
    await mutate(async () => {
      const result = await api<{ output?: string }>('/api/ai/explain-failure', {
        method: 'POST',
        body: JSON.stringify({ context: { run, report } }),
      });
      setAiOutput(result.output ?? JSON.stringify(result, null, 2));
    }, false);
  }

  async function cleanupOldRuns() {
    await mutate(() => api('/api/cleanup', { method: 'POST', body: JSON.stringify({ days: 1 }) }));
  }

  async function mutate(operation: () => Promise<unknown>, shouldRefresh = true) {
    setError('');
    try {
      await operation();
      if (shouldRefresh) await refresh();
    } catch (nextError) {
      setError(messageOf(nextError));
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
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setView(item.id)}
                    className={cn(
                      'flex items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm font-semibold text-[#d9d5c8] transition-colors hover:bg-white/10',
                      view === item.id && 'bg-[#c7d957] text-[#151915]',
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </button>
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
                <Button className="h-10 min-w-28" onClick={runSuite} disabled={!selectedEnv || !selectedSuite}>
                  <Play className="h-4 w-4" />
                  Run
                </Button>
              </div>
            </div>
            {error ? (
              <div className="mt-4 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
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
                onInspect={(run) => { setView('runs'); inspectRun(run); }}
              />
            ) : null}

            {view === 'suites' ? (
              <SuitesPanel
                suites={projectSuites}
                spec={spec}
                setSpec={setSpec}
                onCreateSuite={createSuite}
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

            {view === 'environments' ? (
              <EnvironmentsPanel envs={projectEnvs} onCreateEnv={createEnv} />
            ) : null}

            {view === 'ai' ? (
              <AiPanel connections={aiConnections} onCreateConnection={upsertAiConnection} />
            ) : null}

            {view === 'system' ? (
              <SystemPanel onCreateProject={createProject} onRefresh={refresh} onCleanup={cleanupOldRuns} />
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

function SuitesPanel(props: {
  suites: Suite[];
  spec: string;
  setSpec: (value: string) => void;
  onCreateSuite: (formData: FormData) => Promise<void>;
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
            <div key={suite.id} className="rounded-md border bg-card p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-semibold">{suite.name}</p>
                  <p className="font-mono text-xs text-muted-foreground">{shortId(suite.id)}</p>
                </div>
                <Badge variant={suite.type === 'api' ? 'secondary' : 'outline'}>{suite.type}</Badge>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle>Spec Studio</CardTitle>
            <CardDescription>Crie uma suite versionavel em YAML. Validador visual entra na proxima etapa.</CardDescription>
          </div>
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
        </CardHeader>
        <CardContent>
          <FormShell onSubmit={props.onCreateSuite} submitLabel="Salvar suite">
            <div className="grid gap-3 md:grid-cols-[1fr_160px]">
              <div className="grid gap-2">
                <Label>Nome da suite</Label>
                <Input name="name" placeholder="login-smoke" />
              </div>
              <div className="grid gap-2">
                <Label>Tipo</Label>
                <Select name="type" defaultValue="api">
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
            <Label>Base URL opcional</Label>
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

function SystemPanel(props: { onCreateProject: (formData: FormData) => Promise<void>; onRefresh: () => Promise<void>; onCleanup: () => Promise<void> }) {
  return (
    <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
      <Card>
        <CardHeader>
          <CardTitle>Novo projeto</CardTitle>
          <CardDescription>Agrupa suites, ambientes e runs.</CardDescription>
        </CardHeader>
        <CardContent>
          <FormShell onSubmit={props.onCreateProject} submitLabel="Criar projeto">
            <Label>Nome</Label>
            <Input name="name" placeholder="CRM" />
            <Label>Descricao</Label>
            <Textarea name="description" placeholder="Sistema legado de vendas" />
          </FormShell>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Operacao</CardTitle>
          <CardDescription>API fica em `:4321`; UI oficial fica em `:3000`.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <Button variant="outline" onClick={props.onRefresh}><RefreshCw className="h-4 w-4" /> Atualizar</Button>
          <Button variant="outline" asChild><a href={`${apiBase}/docs`} target="_blank"><Boxes className="h-4 w-4" /> Swagger</a></Button>
          <Button variant="destructive" onClick={props.onCleanup}><Database className="h-4 w-4" /> Cleanup 1d</Button>
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

function FormShell({ children, onSubmit, submitLabel }: { children: React.ReactNode; onSubmit: (formData: FormData) => Promise<void>; submitLabel: string }) {
  return (
    <form
      className="grid gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(new FormData(event.currentTarget));
      }}
    >
      {children}
      <Button type="submit" className="mt-2">{submitLabel}</Button>
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
  if (!run.reportHtmlPath && artifacts.length === 0) return null;
  return (
    <div>
      <h4 className="mb-2 text-sm font-semibold">Artifacts</h4>
      <div className="grid gap-2">
        {run.reportHtmlPath ? (
          <a className="rounded-md border p-2 text-sm font-semibold text-primary hover:bg-muted" href={`${apiBase}/artifacts?path=${encodeURIComponent(run.reportHtmlPath)}`} target="_blank">HTML report</a>
        ) : null}
        {artifacts.map((artifact) => (
          <a key={`${artifact.type}:${artifact.path}`} className="rounded-md border p-2 text-sm hover:bg-muted" href={`${apiBase}/artifacts?path=${encodeURIComponent(artifact.path)}`} target="_blank">
            <span className="font-semibold">{artifact.type}</span>
            <span className="ml-2 text-muted-foreground">{artifact.label ?? shortPath(artifact.path)}</span>
          </a>
        ))}
      </div>
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
  return 'secondary';
}

function runHumanSummary(run: Run): string {
  if (run.error) return run.error;
  const summary = run.summary;
  if (!summary) return 'Sem report final ainda.';
  return `${summary.passed ?? 0}/${summary.total ?? 0} passaram, ${summary.failed ?? 0} falharam, ${summary.error ?? 0} erro infra.`;
}

async function api<T>(apiPath: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${apiBase}${apiPath}`, { headers: { 'content-type': 'application/json', ...(options.headers ?? {}) }, ...options });
  if (!response.ok) throw new Error(await response.text());
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

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
