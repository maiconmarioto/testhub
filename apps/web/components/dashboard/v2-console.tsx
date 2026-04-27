'use client';

import { useEffect, useMemo, useState } from 'react';
import type React from 'react';
import Link from 'next/link';
import {
  Archive,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Code2,
  Database,
  FileCode2,
  Globe2,
  Loader2,
  Pencil,
  Play,
  Save,
  Scissors,
  ShieldCheck,
  Square,
  TerminalSquare,
  Trash2,
  Video,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
  summary?: { total?: number; passed?: number; failed?: number; error?: number; uploadedArtifacts?: Array<{ key: string; bucket: string; localPath: string }> } | null;
  error?: string | null;
  reportPath?: string | null;
  reportHtmlPath?: string | null;
  createdAt?: string;
  startedAt?: string | null;
  finishedAt?: string | null;
};
type Artifact = { type: string; path: string; label?: string };
type RunReport = {
  artifacts?: Artifact[];
  results?: Array<{
    name: string;
    status: RunStatus;
    durationMs?: number;
    error?: string;
    artifacts?: Artifact[];
    steps?: Array<{ index?: number; name: string; status: RunStatus; error?: string; durationMs?: number }>;
  }>;
};
type ValidationResult = { valid: true; type: 'api' | 'web'; name: string; tests: number } | { valid: false; error: string };
type EvidenceTab = 'overview' | 'timeline' | 'artifacts' | 'payload';

const apiBase = process.env.NEXT_PUBLIC_TESTHUB_API_URL ?? 'http://localhost:4321';

const templates = {
  api: {
    label: 'API smoke',
    type: 'api' as const,
    spec: `version: 1
type: api
name: api-smoke
tests:
  - name: health
    request:
      method: GET
      path: /health
    expect:
      status: 200
`,
  },
  webLogin: {
    label: 'Web login',
    type: 'web' as const,
    spec: `version: 1
type: web
name: login-invalid
defaults:
  timeoutMs: 15000
  video: on
  trace: retain-on-failure
tests:
  - name: invalid login
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
          text: Invalid email or password
`,
  },
  legacy: {
    label: 'Legacy checkpoint',
    type: 'web' as const,
    spec: `version: 1
type: web
name: legacy-critical-path
defaults:
  timeoutMs: 20000
  screenshotOnFailure: true
  video: on
tests:
  - name: page contract
    steps:
      - goto: /
      - expectVisible:
          selector: body
      - expectText:
          text: Dashboard
`,
  },
};

export function V2Console() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [envs, setEnvs] = useState<Environment[]>([]);
  const [suites, setSuites] = useState<Suite[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [projectId, setProjectId] = useState('');
  const [environmentId, setEnvironmentId] = useState('');
  const [suiteId, setSuiteId] = useState('');
  const [selectedRunId, setSelectedRunId] = useState('');
  const [report, setReport] = useState<RunReport | null>(null);
  const [tab, setTab] = useState<EvidenceTab>('overview');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [envDraft, setEnvDraft] = useState({ id: '', name: '', baseUrl: '', variables: '' });
  const [suiteDraft, setSuiteDraft] = useState({ id: '', name: '', type: 'api' as 'api' | 'web', specContent: templates.api.spec });
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [cleanupDays, setCleanupDays] = useState(14);

  const projectEnvs = useMemo(() => envs.filter((env) => env.projectId === projectId), [envs, projectId]);
  const projectSuites = useMemo(() => suites.filter((suite) => suite.projectId === projectId), [suites, projectId]);
  const projectRuns = useMemo(() => runs.filter((run) => run.projectId === projectId), [runs, projectId]);
  const selectedRun = projectRuns.find((run) => run.id === selectedRunId) ?? projectRuns[0];
  const selectedSuite = suites.find((suite) => suite.id === selectedRun?.suiteId || suite.id === suiteId);
  const selectedEnv = envs.find((env) => env.id === selectedRun?.environmentId || env.id === environmentId);
  const stats = summarize(projectRuns);
  const artifacts = collectArtifacts(report);
  const videos = artifacts.filter((artifact) => artifact.type === 'video');
  const payloads = artifacts.filter((artifact) => artifact.type === 'request' || artifact.type === 'response');

  async function refresh() {
    setError('');
    try {
      const [nextProjects, nextEnvs, nextSuites, nextRuns] = await Promise.all([
        api<Project[]>('/api/projects'),
        api<Environment[]>('/api/environments'),
        api<Suite[]>('/api/suites'),
        api<Run[]>('/api/runs'),
      ]);
      setProjects(nextProjects);
      setEnvs(nextEnvs);
      setSuites(nextSuites);
      setRuns(nextRuns);
      setProjectId((current) => current && nextProjects.some((project) => project.id === current) ? current : nextProjects[0]?.id ?? '');
    } catch (nextError) {
      setError(messageOf(nextError));
    }
  }

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 3000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    setEnvironmentId((current) => current && projectEnvs.some((env) => env.id === current) ? current : projectEnvs[0]?.id ?? '');
    setSuiteId((current) => current && projectSuites.some((suite) => suite.id === current) ? current : projectSuites[0]?.id ?? '');
  }, [projectId, projectEnvs, projectSuites]);

  useEffect(() => {
    if (selectedRun?.reportPath) {
      api<RunReport>(`/api/runs/${selectedRun.id}/report`)
        .then(setReport)
        .catch(() => setReport(null));
    } else {
      setReport(null);
    }
  }, [selectedRun?.id, selectedRun?.reportPath]);

  useEffect(() => {
    const id = setTimeout(() => { void validateSpec(false); }, 350);
    return () => clearTimeout(id);
  }, [suiteDraft.specContent]);

  async function mutate(operation: () => Promise<unknown>, success?: string) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await operation();
      await refresh();
      if (success) setNotice(success);
    } catch (nextError) {
      setError(messageOf(nextError));
    } finally {
      setBusy(false);
    }
  }

  async function runSuite() {
    if (!projectId || !environmentId || !suiteId) {
      setError('Projeto, ambiente e suite obrigatorios.');
      return;
    }
    await mutate(async () => {
      const run = await api<Run>('/api/runs', {
        method: 'POST',
        body: JSON.stringify({ projectId, environmentId, suiteId }),
      });
      setSelectedRunId(run.id);
      setTab('overview');
    }, 'Run enviada.');
  }

  async function cancelRun(run: Run) {
    await mutate(() => api(`/api/runs/${run.id}/cancel`, { method: 'POST', body: '{}' }), 'Run cancelada.');
  }

  async function saveEnvironment() {
    if (!projectId) return;
    const payload = {
      name: envDraft.name,
      baseUrl: envDraft.baseUrl,
      variables: parseVars(envDraft.variables),
    };
    await mutate(async () => {
      if (envDraft.id) {
        await api(`/api/environments/${envDraft.id}`, { method: 'PUT', body: JSON.stringify(payload) });
      } else {
        await api('/api/environments', { method: 'POST', body: JSON.stringify({ projectId, ...payload }) });
      }
      setEnvDraft({ id: '', name: '', baseUrl: '', variables: '' });
    }, envDraft.id ? 'Ambiente atualizado.' : 'Ambiente criado.');
  }

  async function archiveEnvironment(env: Environment) {
    if (!window.confirm(`Arquivar ambiente "${env.name}"? Runs vinculadas ficam ocultas.`)) return;
    await mutate(() => api(`/api/environments/${env.id}`, { method: 'DELETE' }), 'Ambiente arquivado.');
  }

  async function loadSuite(suite: Suite) {
    await mutate(async () => {
      const loaded = await api<SuiteWithContent>(`/api/suites/${suite.id}`);
      setSuiteDraft({ id: loaded.id, name: loaded.name, type: loaded.type, specContent: loaded.specContent });
      setSuiteId(loaded.id);
    }, 'Suite carregada.');
  }

  async function saveSuite() {
    if (!projectId) return;
    const valid = await validateSpec(true);
    if (!valid) return;
    const payload = { name: suiteDraft.name, type: suiteDraft.type, specContent: suiteDraft.specContent };
    await mutate(async () => {
      if (suiteDraft.id) {
        await api(`/api/suites/${suiteDraft.id}`, { method: 'PUT', body: JSON.stringify(payload) });
      } else {
        const suite = await api<Suite>('/api/suites', { method: 'POST', body: JSON.stringify({ projectId, ...payload }) });
        setSuiteDraft((current) => ({ ...current, id: suite.id }));
        setSuiteId(suite.id);
      }
    }, suiteDraft.id ? 'Suite atualizada.' : 'Suite criada.');
  }

  async function validateSpec(showNotice: boolean): Promise<boolean> {
    if (!suiteDraft.specContent.trim()) {
      setValidation(null);
      return false;
    }
    try {
      const result = await api<ValidationResult>('/api/spec/validate', { method: 'POST', body: JSON.stringify({ specContent: suiteDraft.specContent }) });
      setValidation(result);
      if (showNotice) setNotice('Spec valida.');
      return result.valid;
    } catch (nextError) {
      setValidation({ valid: false, error: messageOf(nextError) });
      return false;
    }
  }

  async function cleanup() {
    await mutate(() => api('/api/cleanup', { method: 'POST', body: JSON.stringify({ days: cleanupDays }) }), 'Cleanup executado.');
  }

  function applyTemplate(key: keyof typeof templates) {
    const template = templates[key];
    setSuiteDraft({ id: '', name: template.label.toLowerCase().replace(/\s+/g, '-'), type: template.type, specContent: template.spec });
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(199,217,87,0.08),transparent_34%),linear-gradient(135deg,#0b100c_0%,#111812_48%,#0a0e0b_100%)] text-[#f7f6f0]">
      <div className="grid min-h-screen xl:grid-cols-[84px_minmax(0,1fr)]">
        <aside className="hidden border-r border-[#2b332a]/70 bg-[#111812]/80 backdrop-blur xl:block">
          <div className="flex h-screen flex-col items-center justify-between py-5">
            <div className="grid gap-4">
              <div className="grid h-12 w-12 place-items-center rounded-xl border border-[#c7d957]/50 bg-[#c7d957] text-[#090d0a] shadow-[0_12px_28px_rgba(199,217,87,0.18)]">
                <TerminalSquare className="h-6 w-6" />
              </div>
              <RailIcon icon={Play} active />
              <RailIcon icon={FileCode2} />
              <RailIcon icon={Database} />
              <RailIcon icon={Video} />
            </div>
            <Button asChild variant="outline" size="icon" className="rounded-xl border-[#3d463c]/70 bg-transparent text-[#f7f6f0] hover:bg-[#1b241b]">
              <Link href="/overview" aria-label="Voltar para v1">
                <ChevronRight className="h-4 w-4 rotate-180" />
              </Link>
            </Button>
          </div>
        </aside>

        <section className="grid min-h-screen grid-rows-[auto_minmax(0,1fr)]">
          <header className="border-b border-[#ded8c7] bg-[#f7f6f0]/95 px-5 py-4 text-[#151915] shadow-[0_18px_40px_rgba(0,0,0,0.12)] md:px-8">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="font-mono text-xs uppercase tracking-[0.32em] text-[#657059]">TestHub v2</p>
                <h1 className="text-2xl font-black tracking-normal md:text-4xl">Run Command Deck</h1>
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <Field label="Projeto">
                  <Select value={projectId} onValueChange={setProjectId}>
                    <SelectTrigger className="h-11 min-w-56 bg-[#fffdf7]"><SelectValue placeholder="Projeto" /></SelectTrigger>
                    <SelectContent>{projects.map((project) => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
                <Field label="Ambiente">
                  <Select value={environmentId} onValueChange={setEnvironmentId}>
                    <SelectTrigger className="h-11 min-w-56 bg-[#fffdf7]"><SelectValue placeholder="Ambiente" /></SelectTrigger>
                    <SelectContent>{projectEnvs.map((env) => <SelectItem key={env.id} value={env.id}>{env.name}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
                <Field label="Suite">
                  <Select value={suiteId} onValueChange={setSuiteId}>
                    <SelectTrigger className="h-11 min-w-56 bg-[#fffdf7]"><SelectValue placeholder="Suite" /></SelectTrigger>
                    <SelectContent>{projectSuites.map((suite) => <SelectItem key={suite.id} value={suite.id}>{suite.name} ({suite.type})</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
                <Button onClick={runSuite} disabled={busy || !projectId || !environmentId || !suiteId} className="h-11 px-6">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  Run
                </Button>
              </div>
            </div>
            {error || notice ? (
              <div className="mt-4 grid gap-2">
                {error ? <Signal tone="bad" text={error} /> : null}
                {notice ? <Signal tone="good" text={notice} /> : null}
              </div>
            ) : null}
          </header>

          <div className="grid min-h-0 gap-4 p-4 md:p-6 2xl:grid-cols-[370px_minmax(0,1fr)_520px]">
            <ControlColumn
              envs={projectEnvs}
              envDraft={envDraft}
              setEnvDraft={setEnvDraft}
              onSaveEnv={saveEnvironment}
              onArchiveEnv={archiveEnvironment}
              cleanupDays={cleanupDays}
              setCleanupDays={setCleanupDays}
              onCleanup={cleanup}
              busy={busy}
            />

            <SuiteColumn
              suites={projectSuites}
              suiteDraft={suiteDraft}
              setSuiteDraft={setSuiteDraft}
              selectedSuiteId={suiteId}
              validation={validation}
              onLoadSuite={loadSuite}
              onSaveSuite={saveSuite}
              onValidate={() => validateSpec(true)}
              onTemplate={applyTemplate}
              busy={busy}
            />

            <EvidenceColumn
              runs={projectRuns}
              selectedRun={selectedRun}
              selectedSuite={selectedSuite}
              selectedEnv={selectedEnv}
              report={report}
              stats={stats}
              tab={tab}
              setTab={setTab}
              videos={videos}
              payloads={payloads}
              artifacts={artifacts}
              onSelectRun={(run) => {
                setSelectedRunId(run.id);
                setTab('overview');
              }}
              onCancel={cancelRun}
            />
          </div>
        </section>
      </div>
    </main>
  );
}

function ControlColumn(props: {
  envs: Environment[];
  envDraft: { id: string; name: string; baseUrl: string; variables: string };
  setEnvDraft: (draft: { id: string; name: string; baseUrl: string; variables: string }) => void;
  onSaveEnv: () => Promise<void>;
  onArchiveEnv: (env: Environment) => Promise<void>;
  cleanupDays: number;
  setCleanupDays: (value: number) => void;
  onCleanup: () => Promise<void>;
  busy: boolean;
}) {
  return (
    <div className="grid min-h-0 gap-4">
      <Panel title="Targets" icon={Globe2}>
        <div className="grid gap-3">
          {props.envs.map((env) => (
            <button
              key={env.id}
              type="button"
              onClick={() => props.setEnvDraft({ id: env.id, name: env.name, baseUrl: env.baseUrl, variables: '' })}
              className="grid cursor-pointer gap-2 rounded-xl border border-[#2b352d]/60 bg-[#151d16]/70 p-3 text-left shadow-[0_10px_24px_rgba(0,0,0,0.12)] transition hover:border-[#c7d957]/40 hover:bg-[#192219]/80"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="font-semibold">{env.name}</span>
                <Badge variant="outline">{Object.keys(env.variables ?? {}).length} vars</Badge>
              </div>
              <span className="break-all font-mono text-xs text-[#a9b19d]">{env.baseUrl}</span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="rounded-lg border-[#3d463c]/70 bg-transparent text-[#f7f6f0] hover:bg-[#1a241b]/80">
                  <Pencil className="h-3.5 w-3.5" />
                  Editar
                </Button>
                <Button size="sm" variant="destructive" onClick={(event) => { event.stopPropagation(); props.onArchiveEnv(env); }}>
                  <Archive className="h-3.5 w-3.5" />
                  Arquivar
                </Button>
              </div>
            </button>
          ))}
          {props.envs.length === 0 ? <DarkEmpty text="Nenhum ambiente." /> : null}
        </div>
      </Panel>

      <Panel title={props.envDraft.id ? 'Edit target' : 'New target'} icon={Database}>
        <div className="grid gap-3">
          <Field label="Nome">
            <Input value={props.envDraft.name} onChange={(event) => props.setEnvDraft({ ...props.envDraft, name: event.target.value })} placeholder="hml" />
          </Field>
          <Field label="Base URL">
            <Input value={props.envDraft.baseUrl} onChange={(event) => props.setEnvDraft({ ...props.envDraft, baseUrl: event.target.value })} placeholder="http://host.docker.internal:3000" />
          </Field>
          <Field label="Variables">
            <Textarea value={props.envDraft.variables} onChange={(event) => props.setEnvDraft({ ...props.envDraft, variables: event.target.value })} className="min-h-28 font-mono text-xs" placeholder="TOKEN=abc" />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={props.onSaveEnv} disabled={props.busy || !props.envDraft.name || !props.envDraft.baseUrl}>
              <Save className="h-4 w-4" />
              Salvar
            </Button>
            <Button variant="outline" className="rounded-lg border-[#3d463c]/70 bg-transparent text-[#f7f6f0] hover:bg-[#1a241b]/80" onClick={() => props.setEnvDraft({ id: '', name: '', baseUrl: '', variables: '' })}>
              Limpar
            </Button>
          </div>
        </div>
      </Panel>

      <Panel title="Retention" icon={Scissors}>
        <div className="grid gap-3">
          <Field label="Dias">
            <Input type="number" min={1} value={props.cleanupDays} onChange={(event) => props.setCleanupDays(Number(event.target.value))} />
          </Field>
          <Button variant="secondary" onClick={props.onCleanup} disabled={props.busy}>
            <Trash2 className="h-4 w-4" />
            Cleanup
          </Button>
        </div>
      </Panel>
    </div>
  );
}

function SuiteColumn(props: {
  suites: Suite[];
  suiteDraft: { id: string; name: string; type: 'api' | 'web'; specContent: string };
  setSuiteDraft: (draft: { id: string; name: string; type: 'api' | 'web'; specContent: string }) => void;
  selectedSuiteId: string;
  validation: ValidationResult | null;
  onLoadSuite: (suite: Suite) => Promise<void>;
  onSaveSuite: () => Promise<void>;
  onValidate: () => Promise<unknown>;
  onTemplate: (key: keyof typeof templates) => void;
  busy: boolean;
}) {
  return (
    <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-4">
      <div className="grid gap-3 xl:grid-cols-3">
        {Object.entries(templates).map(([key, template]) => (
          <button key={key} type="button" onClick={() => props.onTemplate(key as keyof typeof templates)} className="cursor-pointer rounded-xl border border-[#2b352d]/60 bg-[#151d16]/70 p-4 text-left shadow-[0_12px_28px_rgba(0,0,0,0.14)] transition hover:border-[#c7d957]/45 hover:bg-[#192219]/80">
            <div className="mb-3 flex items-center justify-between">
              <Code2 className="h-4 w-4 text-[#c7d957]" />
              <Badge variant={template.type === 'api' ? 'secondary' : 'outline'}>{template.type}</Badge>
            </div>
            <p className="font-bold">{template.label}</p>
          </button>
        ))}
      </div>

      <Panel title="Spec Forge" icon={FileCode2} className="min-h-0">
        <div className="grid min-h-0 gap-4 min-[1900px]:grid-cols-[260px_minmax(0,1fr)]">
          <ScrollArea className="max-h-[220px] pr-3 min-[1900px]:max-h-[720px]">
            <div className="grid gap-2 md:grid-cols-2 min-[1900px]:grid-cols-1">
              {props.suites.map((suite) => (
                <button
                  key={suite.id}
                  type="button"
                  onClick={() => props.onLoadSuite(suite)}
                  className={cn('cursor-pointer rounded-xl border p-3 text-left transition hover:border-[#c7d957]/45', props.selectedSuiteId === suite.id ? 'border-[#c7d957]/60 bg-[#1a241b]/80 shadow-[0_0_0_1px_rgba(199,217,87,0.08)]' : 'border-[#2b352d]/60 bg-[#111812]/70')}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{suite.name}</span>
                    <Badge variant={suite.type === 'api' ? 'secondary' : 'outline'}>{suite.type}</Badge>
                  </div>
                  <p className="mt-2 font-mono text-xs text-[#a9b19d]">{shortId(suite.id)}</p>
                </button>
              ))}
              {props.suites.length === 0 ? <DarkEmpty text="Nenhuma suite." /> : null}
            </div>
          </ScrollArea>

          <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] gap-3">
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_150px_auto_auto] md:items-end">
              <Field label="Nome">
                <Input value={props.suiteDraft.name} onChange={(event) => props.setSuiteDraft({ ...props.suiteDraft, name: event.target.value })} placeholder="login-smoke" />
              </Field>
              <Field label="Tipo">
                <Select value={props.suiteDraft.type} onValueChange={(value) => props.setSuiteDraft({ ...props.suiteDraft, type: value as 'api' | 'web' })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="api">api</SelectItem>
                    <SelectItem value="web">web</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Button variant="outline" className="rounded-lg border-[#3d463c]/70 bg-transparent text-[#f7f6f0] hover:bg-[#1a241b]/80" onClick={props.onValidate}>
                <ShieldCheck className="h-4 w-4" />
                Validar
              </Button>
              <Button onClick={props.onSaveSuite} disabled={props.busy || !props.suiteDraft.name || !props.suiteDraft.specContent}>
                <Save className="h-4 w-4" />
                Salvar
              </Button>
            </div>

            <Textarea
              value={props.suiteDraft.specContent}
              onChange={(event) => props.setSuiteDraft({ ...props.suiteDraft, specContent: event.target.value })}
              spellCheck={false}
              className="min-h-[460px] resize-none rounded-xl border-[#2b352d]/60 bg-[#0b100c]/95 font-mono text-xs leading-5 text-[#f7f6f0] shadow-inner focus-visible:ring-[#c7d957] min-[1900px]:min-h-[540px]"
            />

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#2b352d]/70 pt-3">
              <ValidationBadge validation={props.validation} />
              <span className="font-mono text-xs text-[#a9b19d]">{props.suiteDraft.specContent.split(/\r?\n/).length} lines</span>
            </div>
          </div>
        </div>
      </Panel>
    </div>
  );
}

function EvidenceColumn(props: {
  runs: Run[];
  selectedRun?: Run;
  selectedSuite?: Suite;
  selectedEnv?: Environment;
  report: RunReport | null;
  stats: ReturnType<typeof summarize>;
  tab: EvidenceTab;
  setTab: (tab: EvidenceTab) => void;
  videos: Artifact[];
  payloads: Artifact[];
  artifacts: Artifact[];
  onSelectRun: (run: Run) => void;
  onCancel: (run: Run) => Promise<void>;
}) {
  return (
    <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-4">
      <div className="grid grid-cols-4 overflow-hidden rounded-xl border border-[#2b352d]/60 bg-[#151d16]/70 shadow-[0_12px_28px_rgba(0,0,0,0.14)]">
        <Score label="Pass" value={props.stats.passed} tone="good" />
        <Score label="Fail" value={props.stats.failed} tone="bad" />
        <Score label="Error" value={props.stats.error} tone="bad" />
        <Score label="Live" value={props.stats.active} tone="warn" />
      </div>

      <Panel title="Evidence" icon={ClipboardCheck} className="min-h-0">
        <div className="grid min-h-0 grid-rows-[230px_auto_minmax(0,1fr)] gap-4">
          <ScrollArea className="rounded-xl border border-[#2b352d]/60 bg-[#0f1510]/70">
            <div className="grid gap-2 p-3">
              {props.runs.map((run) => (
                <button
                  key={run.id}
                  type="button"
                  onClick={() => props.onSelectRun(run)}
                  className={cn('grid cursor-pointer gap-2 rounded-xl border p-3 text-left transition hover:border-[#c7d957]/45', props.selectedRun?.id === run.id ? 'border-[#c7d957]/60 bg-[#1a241b]/80 shadow-[0_0_0_1px_rgba(199,217,87,0.08)]' : 'border-[#2b352d]/60 bg-[#111812]/70')}
                >
                  <div className="flex items-center justify-between gap-3">
                    <Status status={run.status} />
                    <span className="font-mono text-xs text-[#a9b19d]">{formatDate(run.createdAt)}</span>
                  </div>
                  <p className="font-mono text-xs text-[#a9b19d]">{shortId(run.id)} · {runSummary(run)}</p>
                </button>
              ))}
              {props.runs.length === 0 ? <DarkEmpty text="Nenhuma run." /> : null}
            </div>
          </ScrollArea>

          <div className="grid gap-3 rounded-xl border border-[#ded8c7] bg-[#f7f6f0] p-4 text-[#151915] shadow-[0_14px_34px_rgba(0,0,0,0.16)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <Status status={props.selectedRun?.status ?? 'queued'} />
                <h2 className="mt-3 text-2xl font-black">{props.selectedSuite?.name ?? 'Sem run'}</h2>
                <p className="break-all font-mono text-xs text-[#657059]">{props.selectedEnv?.baseUrl ?? 'target ausente'}</p>
              </div>
              {props.selectedRun && ['queued', 'running'].includes(props.selectedRun.status) ? (
                <Button variant="destructive" size="sm" onClick={() => props.onCancel(props.selectedRun!)}>
                  <Square className="h-4 w-4" />
                  Cancelar
                </Button>
              ) : null}
            </div>
            <div className="grid grid-cols-4 gap-2">
              {(['overview', 'timeline', 'artifacts', 'payload'] as EvidenceTab[]).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => props.setTab(item)}
                  className={cn('h-9 cursor-pointer rounded-lg border text-xs font-bold uppercase tracking-wider transition', props.tab === item ? 'border-[#151915] bg-[#151915] text-[#f7f6f0]' : 'border-[#d8d2c1] bg-transparent text-[#151915] hover:bg-[#ece8dc]')}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          <ScrollArea className="min-h-0 pr-3">
            {props.tab === 'overview' ? <OverviewEvidence run={props.selectedRun} report={props.report} videos={props.videos} /> : null}
            {props.tab === 'timeline' ? <TimelineEvidence report={props.report} /> : null}
            {props.tab === 'artifacts' ? <ArtifactEvidence run={props.selectedRun} artifacts={props.artifacts} /> : null}
            {props.tab === 'payload' ? <PayloadEvidence artifacts={props.payloads} /> : null}
          </ScrollArea>
        </div>
      </Panel>
    </div>
  );
}

function OverviewEvidence({ run, report, videos }: { run?: Run; report: RunReport | null; videos: Artifact[] }) {
  if (!run) return <DarkEmpty text="Selecione uma run." />;
  return (
    <div className="grid gap-4">
      <div className="rounded-xl border border-[#2b352d]/60 bg-[#151d16]/70 p-4 shadow-[0_12px_28px_rgba(0,0,0,0.14)]">
        <p className="font-mono text-xs uppercase tracking-[0.24em] text-[#a9b19d]">Run</p>
        <p className="mt-3 text-lg font-black">{run.status.toUpperCase()}</p>
        <p className="mt-2 text-sm text-[#c6cdbd]">{runSummary(run)}</p>
        {run.error ? <pre className="mt-3 overflow-auto rounded-lg bg-[#0b100c] p-3 font-mono text-xs text-[#ffb4a8]">{run.error}</pre> : null}
      </div>
      {videos[0] ? (
        <div className="overflow-hidden rounded-xl border border-[#2b352d]/60 bg-black">
          <video className="aspect-video w-full bg-black" src={artifactUrl(videos[0].path)} controls preload="metadata" />
        </div>
      ) : null}
      <div className="grid gap-2">
        {(report?.results ?? []).slice(0, 4).map((result) => (
          <div key={result.name} className="flex items-center justify-between gap-3 rounded-xl border border-[#2b352d]/60 bg-[#151d16]/70 p-3">
            <span className="font-semibold">{result.name}</span>
            <Status status={result.status} />
          </div>
        ))}
      </div>
    </div>
  );
}

function TimelineEvidence({ report }: { report: RunReport | null }) {
  const results = report?.results ?? [];
  if (results.length === 0) return <DarkEmpty text="Timeline indisponivel." />;
  return (
    <div className="grid gap-3">
      {results.map((result) => (
        <div key={result.name} className="rounded-xl border border-[#2b352d]/60 bg-[#151d16]/70 p-4 shadow-[0_12px_28px_rgba(0,0,0,0.14)]">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-bold">{result.name}</h3>
            <Status status={result.status} />
          </div>
          {result.error ? <pre className="mt-3 overflow-auto rounded-lg bg-[#0b100c] p-3 font-mono text-xs text-[#ffb4a8]">{result.error}</pre> : null}
          <div className="mt-3 grid gap-2">
            {(result.steps ?? []).map((step) => (
              <div key={`${result.name}:${step.index}`} className="grid gap-2 rounded-lg border border-[#2b352d]/60 bg-[#0f1510]/70 p-2 md:grid-cols-[84px_minmax(0,1fr)_70px]">
                <Status status={step.status} />
                <span className="break-words font-mono text-xs text-[#c6cdbd]">{step.name}</span>
                <span className="font-mono text-xs text-[#a9b19d] md:text-right">{step.durationMs ?? 0}ms</span>
                {step.error ? <p className="text-xs text-[#ffb4a8] md:col-span-3">{step.error}</p> : null}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ArtifactEvidence({ run, artifacts }: { run?: Run; artifacts: Artifact[] }) {
  if (!run?.reportHtmlPath && artifacts.length === 0) return <DarkEmpty text="Artifacts indisponiveis." />;
  return (
    <div className="grid gap-2">
      {run?.reportHtmlPath ? <ArtifactLink label="HTML report" path={run.reportHtmlPath} type="html" /> : null}
      {artifacts.map((artifact) => <ArtifactLink key={`${artifact.type}:${artifact.path}`} label={artifact.label ?? shortPath(artifact.path)} path={artifact.path} type={artifact.type} />)}
    </div>
  );
}

function PayloadEvidence({ artifacts }: { artifacts: Artifact[] }) {
  if (artifacts.length === 0) return <DarkEmpty text="Payload indisponivel para runs web." />;
  return (
    <div className="grid gap-3">
      {artifacts.map((artifact) => <PayloadCard key={`${artifact.type}:${artifact.path}`} artifact={artifact} />)}
    </div>
  );
}

function PayloadCard({ artifact }: { artifact: Artifact }) {
  const [payload, setPayload] = useState<unknown>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    fetch(artifactUrl(artifact.path))
      .then(async (response) => {
        if (!response.ok) throw new Error(await response.text());
        return response.json() as Promise<unknown>;
      })
      .then((nextPayload) => { if (active) setPayload(nextPayload); })
      .catch((nextError) => { if (active) setError(messageOf(nextError)); });
    return () => { active = false; };
  }, [artifact.path]);
  return (
    <div className="rounded-xl border border-[#2b352d]/60 bg-[#151d16]/70 p-4 shadow-[0_12px_28px_rgba(0,0,0,0.14)]">
      <div className="flex items-center justify-between gap-3">
        <span className="font-bold">{artifact.label ?? artifact.type}</span>
        <Badge variant={artifact.type === 'response' ? 'secondary' : 'outline'}>{artifact.type}</Badge>
      </div>
      {error ? <p className="mt-3 text-sm text-[#ffb4a8]">{error}</p> : null}
      <pre className="mt-3 max-h-96 overflow-auto rounded-lg bg-[#0b100c] p-3 font-mono text-xs leading-5 text-[#f7f6f0]">{payload ? JSON.stringify(payload, null, 2) : 'loading...'}</pre>
    </div>
  );
}

function Panel({ title, icon: Icon, className, children }: { title: string; icon: LucideIcon; className?: string; children: React.ReactNode }) {
  return (
    <section className={cn('rounded-2xl border border-[#2b352d]/60 bg-[#111812]/78 p-4 shadow-[0_18px_46px_rgba(0,0,0,0.24)] backdrop-blur', className)}>
      <div className="mb-4 flex items-center justify-between gap-3 border-b border-[#2b352d]/50 pb-3">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-[#c7d957]" />
          <h2 className="font-mono text-xs font-bold uppercase tracking-[0.26em] text-[#f7f6f0]">{title}</h2>
        </div>
      </div>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1">
      <span className="font-mono text-[10px] font-bold uppercase tracking-[0.24em] text-[#a9b19d]">{label}</span>
      {children}
    </label>
  );
}

function Status({ status }: { status: RunStatus }) {
  const passed = status === 'passed';
  const failed = status === 'failed' || status === 'error';
  const active = status === 'queued' || status === 'running';
  return (
    <span className={cn('inline-flex h-7 items-center gap-2 border px-2 font-mono text-[11px] font-bold uppercase', passed && 'border-[#31c48d] text-[#31c48d]', failed && 'border-[#ff7a66] text-[#ff7a66]', active && 'border-[#f5c542] text-[#f5c542]', !passed && !failed && !active && 'border-[#a9b19d] text-[#a9b19d]')}>
      {passed ? <CheckCircle2 className="h-3.5 w-3.5" /> : failed ? <XCircle className="h-3.5 w-3.5" /> : active ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Square className="h-3.5 w-3.5" />}
      {status}
    </span>
  );
}

function Score({ label, value, tone }: { label: string; value: number; tone: 'good' | 'bad' | 'warn' }) {
  return (
    <div className="border-r border-[#2b352d]/50 p-3 last:border-r-0">
      <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#a9b19d]">{label}</p>
      <p className={cn('mt-2 text-2xl font-black', tone === 'good' && 'text-[#31c48d]', tone === 'bad' && 'text-[#ff7a66]', tone === 'warn' && 'text-[#f5c542]')}>{value}</p>
    </div>
  );
}

function Signal({ tone, text }: { tone: 'good' | 'bad'; text: string }) {
  return <div className={cn('rounded-lg border px-3 py-2 font-mono text-xs', tone === 'good' ? 'border-[#1d4f3a]/50 bg-[#e9f4d0] text-[#1d4f3a]' : 'border-[#b42318]/50 bg-[#fff0ed] text-[#9f1f16]')}>{text}</div>;
}

function ValidationBadge({ validation }: { validation: ValidationResult | null }) {
  if (!validation) return <span className="font-mono text-xs text-[#a9b19d]">Spec aguardando validacao.</span>;
  if (validation.valid) return <span className="inline-flex items-center gap-2 font-mono text-xs text-[#31c48d]"><ShieldCheck className="h-4 w-4" /> {validation.type} · {validation.tests} tests</span>;
  return <span className="inline-flex min-w-0 items-center gap-2 break-words font-mono text-xs text-[#ff7a66]"><XCircle className="h-4 w-4 shrink-0" /> {validation.error}</span>;
}

function ArtifactLink({ label, path, type }: { label: string; path: string; type: string }) {
  return (
    <a className="flex items-center justify-between gap-3 rounded-xl border border-[#2b352d]/60 bg-[#151d16]/70 p-3 text-sm transition hover:border-[#c7d957]/45 hover:bg-[#192219]/80" href={artifactUrl(path)} target="_blank">
      <span className="min-w-0 truncate font-semibold">{label}</span>
      <Badge variant="outline">{type}</Badge>
    </a>
  );
}

function RailIcon({ icon: Icon, active }: { icon: LucideIcon; active?: boolean }) {
  return <div className={cn('grid h-11 w-11 place-items-center rounded-xl border transition', active ? 'border-[#c7d957]/50 bg-[#1a241b]/80 text-[#c7d957]' : 'border-[#2b352d]/60 text-[#a9b19d]')}><Icon className="h-5 w-5" /></div>;
}

function DarkEmpty({ text }: { text: string }) {
  return <div className="rounded-xl border border-dashed border-[#2b352d]/60 bg-[#0f1510]/70 p-6 text-center text-sm text-[#a9b19d]">{text}</div>;
}

function summarize(runs: Run[]) {
  return {
    passed: runs.filter((run) => run.status === 'passed').length,
    failed: runs.filter((run) => run.status === 'failed').length,
    error: runs.filter((run) => run.status === 'error').length,
    active: runs.filter((run) => run.status === 'queued' || run.status === 'running').length,
  };
}

function collectArtifacts(report: RunReport | null): Artifact[] {
  return [
    ...(report?.artifacts ?? []),
    ...((report?.results ?? []).flatMap((result) => result.artifacts ?? [])),
  ];
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

function runSummary(run: Run): string {
  if (run.error) return run.error;
  if (!run.summary) return 'Sem report final.';
  return `${run.summary.passed ?? 0}/${run.summary.total ?? 0} pass · ${run.summary.failed ?? 0} fail · ${run.summary.error ?? 0} error`;
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

function artifactUrl(path: string): string {
  return `${apiBase}/artifacts?path=${encodeURIComponent(path)}`;
}

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
