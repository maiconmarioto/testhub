'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type React from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { Bot, CheckCircle2, ChevronDown, ChevronRight, ClipboardCheck, Database, FileCode2, FolderKanban, Loader2, LogOut, Play, Settings2, ShieldAlert, Square, TerminalSquare, Trash2, Upload, WandSparkles, XCircle, type LucideIcon } from 'lucide-react';
import YAML from 'yaml';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { api, apiBase } from '@/lib/api';
import { cn } from '@/lib/utils';

type Project = { id: string; name: string; description?: string; retentionDays?: number; cleanupArtifacts?: boolean };
type Environment = { id: string; projectId: string; name: string; baseUrl: string; variables?: Record<string, string> };
type Suite = { id: string; projectId: string; name: string; type: 'api' | 'web'; specPath?: string };
type AiConnection = { id: string; name: string; provider: 'openrouter' | 'openai' | 'anthropic'; apiKey?: string; model: string; baseUrl?: string; enabled: boolean };
type SecurityStatus = {
  oidc: { configured: boolean; issuer: string | null };
  auth: { apiTokenEnabled: boolean; rbacRole: string; mode: 'off' | 'token' | 'oidc' | 'local' };
  secrets: { defaultKey: boolean; blockedInProduction: boolean };
  network: { allowedHosts: string[]; allowAllWhenEmpty: boolean };
  retention: { days: number };
};
type AuthMe = { user: { email: string; name?: string }; organization: { id: string; name: string }; membership: { role: 'admin' | 'editor' | 'viewer' }; organizations: Array<{ id: string; name: string }> };
type AuditEntry = { id: string; action: string; actor: string; status: 'ok' | 'blocked' | 'error'; target?: string; createdAt: string; detail?: Record<string, unknown> };
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
type EvidenceTab = 'overview' | 'timeline' | 'artifacts' | 'payload';
type MenuSheet = 'evidence' | null;
type V2View = 'run' | 'projects' | 'suites' | 'settings';
type SuiteWithContent = Suite & { specContent: string };
type ValidationResult = { valid: true; type: 'api' | 'web'; name: string; tests: number } | { valid: false; error: string };
type WizardDraft = {
  projectName: string;
  projectDescription: string;
  environmentName: string;
  baseUrl: string;
  variables: string;
  suiteName: string;
  suiteType: Suite['type'];
  specContent: string;
};
type OpenApiDraft = { name: string; spec: string; baseUrl: string; authTemplate: 'none' | 'bearer' | 'apiKey'; headers: string; tags: string; selectedOperations: string; includeBodyExamples: boolean };

const controlClass = 'h-10 border-[#d7d2c4] bg-white text-[#1f241f] shadow-none placeholder:text-[#8a877c] focus-visible:ring-[#426b4d]';
const darkSelectClass = `min-w-52 ${controlClass}`;
const MonacoEditor = dynamic(() => import('@monaco-editor/react'), { ssr: false });
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

export function V2Console({ view = 'run' }: { view?: V2View }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [envs, setEnvs] = useState<Environment[]>([]);
  const [suites, setSuites] = useState<Suite[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [aiConnections, setAiConnections] = useState<AiConnection[]>([]);
  const [security, setSecurity] = useState<SecurityStatus | null>(null);
  const [me, setMe] = useState<AuthMe | null>(null);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [projectId, setProjectId] = useState('');
  const [environmentId, setEnvironmentId] = useState('');
  const [suiteId, setSuiteId] = useState('');
  const [selectedRunId, setSelectedRunId] = useState('');
  const [report, setReport] = useState<RunReport | null>(null);
  const [tab, setTab] = useState<EvidenceTab>('overview');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [openSheet, setOpenSheet] = useState<MenuSheet>(null);
  const [projectDraft, setProjectDraft] = useState({ id: '', name: '', description: '', retentionDays: '30', cleanupArtifacts: false });
  const [openApiDraft, setOpenApiDraft] = useState<OpenApiDraft>({ name: 'openapi-import', spec: '', baseUrl: '', authTemplate: 'none', headers: '', tags: '', selectedOperations: '', includeBodyExamples: true });
  const [suiteDraft, setSuiteDraft] = useState({ id: '', name: '', type: 'api' as 'api' | 'web', specContent: defaultSpec });
  const [envDraft, setEnvDraft] = useState({ id: '', name: '', baseUrl: '', variables: '' });
  const [aiDraft, setAiDraft] = useState({ id: '', name: 'OpenRouter', provider: 'openrouter' as AiConnection['provider'], apiKey: '', model: 'openai/gpt-4o-mini', baseUrl: 'https://openrouter.ai/api/v1', enabled: true });
  const [aiOutput, setAiOutput] = useState('');
  const [cleanupDays, setCleanupDays] = useState('30');
  const [cleanupResult, setCleanupResult] = useState('');
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [approvedAiPatch, setApprovedAiPatch] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(0);
  const [wizardDraft, setWizardDraft] = useState({
    projectName: '',
    projectDescription: '',
    environmentName: 'local',
    baseUrl: 'http://host.docker.internal:3000',
    variables: '',
    suiteName: 'api-health-smoke',
    suiteType: 'api' as Suite['type'],
    specContent: defaultSpec,
  });
  const queryAppliedRef = useRef(false);
  const suiteAutoLoadRef = useRef('');

  const projectEnvs = useMemo(() => envs.filter((env) => env.projectId === projectId), [envs, projectId]);
  const projectSuites = useMemo(() => suites.filter((suite) => suite.projectId === projectId), [suites, projectId]);
  const projectRuns = useMemo(() => runs.filter((run) => run.projectId === projectId), [runs, projectId]);
  const selectedSuite = projectSuites.find((suite) => suite.id === suiteId);
  const selectedEnv = projectEnvs.find((env) => env.id === environmentId);
  const selectedProject = projects.find((project) => project.id === projectId);
  const scopedRuns = useMemo(
    () => projectRuns.filter((run) => run.suiteId === suiteId && run.environmentId === environmentId),
    [projectRuns, suiteId, environmentId],
  );
  const selectedRun = scopedRuns.find((run) => run.id === selectedRunId) ?? scopedRuns[0];
  const role = (me ? me.membership.role : security?.auth.mode && security.auth.mode !== 'local' ? security.auth.rbacRole : 'viewer') as 'admin' | 'editor' | 'viewer';
  const canWrite = role === 'admin' || role === 'editor';
  const canAdmin = role === 'admin';
  const stats = summarize(scopedRuns);
  const artifacts = collectArtifacts(report);
  const videos = artifacts.filter((artifact) => artifact.type === 'video');
  const payloads = artifacts.filter((artifact) => artifact.type === 'request' || artifact.type === 'response');

  async function refresh() {
    setError('');
    try {
      const [nextMe, nextProjects, nextEnvs, nextSuites, nextRuns, nextConnections, nextSecurity, nextAudit] = await Promise.all([
        api<AuthMe>('/api/auth/me', { redirectOnUnauthorized: false }).catch(() => null),
        api<Project[]>('/api/projects'),
        api<Environment[]>('/api/environments'),
        api<Suite[]>('/api/suites'),
        api<Run[]>('/api/runs'),
        api<AiConnection[]>('/api/ai/connections').catch(() => []),
        api<SecurityStatus>('/api/system/security').catch(() => null),
        api<AuditEntry[]>('/api/audit?limit=40').catch(() => []),
      ]);
      setMe(nextMe);
      setProjects(nextProjects);
      setEnvs(nextEnvs);
      setSuites(nextSuites);
      setRuns(nextRuns);
      setAiConnections(nextConnections);
      setSecurity(nextSecurity);
      setAudit(nextAudit);
      setProjectId((current) => {
        if (current && nextProjects.some((project) => project.id === current)) return current;
        if (!queryAppliedRef.current && typeof window !== 'undefined') {
          const queryProject = new URLSearchParams(window.location.search).get('project');
          if (queryProject && nextProjects.some((project) => project.id === queryProject)) return queryProject;
        }
        return nextProjects[0]?.id ?? '';
      });
    } catch (nextError) {
      setError(messageOf(nextError));
    }
  }

  async function logout() {
    setBusy(true);
    setError('');
    try {
      await api('/api/auth/logout', { method: 'POST', body: '{}' }).catch(() => undefined);
      window.localStorage.removeItem('testhub.token');
      window.location.assign('/login');
    } catch (nextError) {
      setError(messageOf(nextError));
      setBusy(false);
    }
  }

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 3000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const current = projects.find((project) => project.id === projectId);
    setProjectDraft({
      id: current?.id ?? '',
      name: current?.name ?? '',
      description: current?.description ?? '',
      retentionDays: String(current?.retentionDays ?? security?.retention.days ?? 30),
      cleanupArtifacts: Boolean(current?.cleanupArtifacts),
    });
  }, [projectId, projects, security?.retention.days]);

  useEffect(() => {
    if (security?.retention.days) setCleanupDays(String(security.retention.days));
  }, [security?.retention.days]);

  useEffect(() => {
    if (view !== 'suites' || !suiteId || suiteAutoLoadRef.current === suiteId) return;
    const suite = projectSuites.find((item) => item.id === suiteId);
    if (!suite) return;
    suiteAutoLoadRef.current = suiteId;
    api<SuiteWithContent>(`/api/suites/${suite.id}`)
      .then((loaded) => {
        setSuiteDraft({ id: loaded.id, name: loaded.name, type: loaded.type, specContent: loaded.specContent });
        setValidation(null);
      })
      .catch((nextError) => setError(messageOf(nextError)));
  }, [view, suiteId, projectSuites]);

  useEffect(() => {
    setEnvironmentId((current) => current && projectEnvs.some((env) => env.id === current) ? current : projectEnvs[0]?.id ?? '');
    setSuiteId((current) => current && projectSuites.some((suite) => suite.id === current) ? current : projectSuites[0]?.id ?? '');
  }, [projectId, projectEnvs, projectSuites]);

  useEffect(() => {
    if (queryAppliedRef.current || !projectId || projects.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    const queryEnvironment = params.get('environment');
    const querySuite = params.get('suite');
    const queryRun = params.get('run');

    if (queryEnvironment && projectEnvs.some((env) => env.id === queryEnvironment)) setEnvironmentId(queryEnvironment);
    if (querySuite && projectSuites.some((suite) => suite.id === querySuite)) setSuiteId(querySuite);
    if (queryRun) setSelectedRunId(queryRun);
    queryAppliedRef.current = true;
  }, [projectId, projectEnvs, projectSuites, projects.length]);

  useEffect(() => {
    if (!projectId || typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    params.set('project', projectId);
    if (environmentId) params.set('environment', environmentId);
    else params.delete('environment');
    if (suiteId) params.set('suite', suiteId);
    else params.delete('suite');
    if (selectedRunId) params.set('run', selectedRunId);
    else params.delete('run');

    const query = params.toString();
    const nextUrl = query ? `${window.location.pathname}?${query}` : window.location.pathname;
    const currentUrl = `${window.location.pathname}${window.location.search}`;
    if (nextUrl !== currentUrl) window.history.replaceState(null, '', nextUrl);
  }, [projectId, environmentId, suiteId, selectedRunId]);

  useEffect(() => {
    if (selectedRun?.reportPath) {
      api<RunReport>(`/api/runs/${selectedRun.id}/report`)
        .then(setReport)
        .catch(() => setReport(null));
    } else {
      setReport(null);
    }
  }, [selectedRun?.id, selectedRun?.reportPath]);

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

  async function loadSuite(suite: Suite) {
    await mutate(async () => {
      const loaded = await api<SuiteWithContent>(`/api/suites/${suite.id}`);
      setSuiteDraft({ id: loaded.id, name: loaded.name, type: loaded.type, specContent: loaded.specContent });
      setSuiteId(loaded.id);
      setSelectedRunId('');
      setTab('overview');
      setValidation(null);
    }, `Editando ${suite.name}.`);
  }

  function newSuiteDraft() {
    setSuiteDraft({ id: '', name: '', type: 'api', specContent: defaultSpec });
    setValidation(null);
  }

  async function validateSpec(showNotice = true): Promise<boolean> {
    if (!suiteDraft.specContent.trim()) {
      setValidation({ valid: false, error: 'YAML obrigatorio.' });
      return false;
    }
    try {
      const result = await api<ValidationResult>('/api/spec/validate', { method: 'POST', body: JSON.stringify({ specContent: suiteDraft.specContent }) });
      setValidation(result);
      if (showNotice && result.valid) setNotice('Spec valida.');
      return result.valid;
    } catch (nextError) {
      setValidation({ valid: false, error: messageOf(nextError) });
      return false;
    }
  }

  async function saveSuite() {
    if (!projectId) return;
    const valid = await validateSpec(false);
    if (!valid) return;
    const payload = { name: suiteDraft.name, type: suiteDraft.type, specContent: suiteDraft.specContent };
    await mutate(async () => {
      if (suiteDraft.id && approvedAiPatch) {
        await api('/api/ai/apply-test-fix', { method: 'POST', body: JSON.stringify({ suiteId: suiteDraft.id, approved: true, reason: 'Aprovado na UI', ...payload }) });
        setApprovedAiPatch(false);
      } else if (suiteDraft.id) {
        await api(`/api/suites/${suiteDraft.id}`, { method: 'PUT', body: JSON.stringify(payload) });
      } else {
        const suite = await api<Suite>('/api/suites', { method: 'POST', body: JSON.stringify({ projectId, ...payload }) });
        setSuiteDraft((current) => ({ ...current, id: suite.id }));
        setSuiteId(suite.id);
      }
    }, suiteDraft.id ? 'Suite atualizada.' : 'Suite criada.');
  }

  function editEnvironment(env: Environment) {
    setEnvDraft({
      id: env.id,
      name: env.name,
      baseUrl: env.baseUrl,
      variables: Object.entries(env.variables ?? {}).map(([key, value]) => `${key}=${value}`).join('\n'),
    });
    setEnvironmentId(env.id);
    setSelectedRunId('');
    setTab('overview');
  }

  function newEnvironmentDraft() {
    setEnvDraft({ id: '', name: '', baseUrl: '', variables: '' });
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
        const env = await api<Environment>('/api/environments', { method: 'POST', body: JSON.stringify({ projectId, ...payload }) });
        setEnvDraft((current) => ({ ...current, id: env.id }));
        setEnvironmentId(env.id);
      }
    }, envDraft.id ? 'Ambiente atualizado.' : 'Ambiente criado.');
  }

  async function archiveEnvironment(env: Environment) {
    if (!window.confirm(`Arquivar ambiente "${env.name}"? Runs vinculadas ficam ocultas.`)) return;
    await mutate(() => api(`/api/environments/${env.id}`, { method: 'DELETE' }), 'Ambiente arquivado.');
    if (envDraft.id === env.id) newEnvironmentDraft();
  }

  async function saveProject() {
    const payload = {
      name: projectDraft.name.trim(),
      description: projectDraft.description.trim() || undefined,
      retentionDays: Number(projectDraft.retentionDays) || undefined,
      cleanupArtifacts: projectDraft.cleanupArtifacts,
    };
    if (!payload.name) return;
    await mutate(async () => {
      if (projectDraft.id) {
        await api<Project>(`/api/projects/${projectDraft.id}`, { method: 'PUT', body: JSON.stringify(payload) });
      } else {
        const project = await api<Project>('/api/projects', { method: 'POST', body: JSON.stringify(payload) });
        setProjectId(project.id);
      }
    }, projectDraft.id ? 'Projeto atualizado.' : 'Projeto criado.');
  }

  async function archiveProject(project: Project) {
    if (!window.confirm(`Arquivar projeto "${project.name}"? Ambientes, suites e runs vinculadas ficam ocultas.`)) return;
    await mutate(() => api(`/api/projects/${project.id}`, { method: 'DELETE' }), 'Projeto arquivado.');
    if (project.id === projectId) {
      setProjectId('');
      setEnvironmentId('');
      setSuiteId('');
      setSelectedRunId('');
    }
  }

  async function importOpenApi() {
    if (!projectId || !openApiDraft.spec.trim()) return;
    await mutate(async () => {
      const parsed = JSON.parse(openApiDraft.spec);
      const suite = await api<Suite>('/api/import/openapi', {
        method: 'POST',
        body: JSON.stringify({
          projectId,
          name: openApiDraft.name || 'openapi-import',
          spec: parsed,
          baseUrl: openApiDraft.baseUrl || undefined,
          authTemplate: openApiDraft.authTemplate,
          headers: parseVars(openApiDraft.headers),
          tags: splitList(openApiDraft.tags),
          selectedOperations: splitList(openApiDraft.selectedOperations),
          includeBodyExamples: openApiDraft.includeBodyExamples,
        }),
      });
      setSuiteId(suite.id);
      setSelectedRunId('');
    }, 'OpenAPI importado.');
  }

  function editAiConnection(connection: AiConnection) {
    setAiDraft({
      id: connection.id,
      name: connection.name,
      provider: connection.provider,
      apiKey: '',
      model: connection.model,
      baseUrl: connection.baseUrl ?? '',
      enabled: connection.enabled,
    });
  }

  async function saveAiConnection() {
    await mutate(() => api('/api/ai/connections', {
      method: 'POST',
      body: JSON.stringify({
        id: aiDraft.id || undefined,
        name: aiDraft.name,
        provider: aiDraft.provider,
        apiKey: aiDraft.apiKey || undefined,
        model: aiDraft.model,
        baseUrl: aiDraft.baseUrl || undefined,
        enabled: aiDraft.enabled,
      }),
    }), aiDraft.id ? 'AI connection atualizada.' : 'AI connection criada.');
  }

  async function explainFailure(run?: Run) {
    await runAi('explain-failure', run, 'Analise IA gerada.');
  }

  async function runAi(kind: 'explain-failure' | 'suggest-test-fix' | 'suggest-test-cases', run?: Run, success = 'IA gerada.') {
    if (!run) return;
    setAiOutput('');
    await mutate(async () => {
      const result = await api<{ output?: string }>(`/api/ai/${kind}`, {
        method: 'POST',
        body: JSON.stringify({ context: { run, report, suite: selectedSuite, environment: selectedEnv } }),
      });
      setAiOutput(result.output ?? JSON.stringify(result, null, 2));
    }, success);
  }

  async function cleanupRuns() {
    await mutate(async () => {
      const result = await api<{ cutoffIso: string; archivedRuns: number; retainedArtifacts: boolean }>('/api/cleanup', {
        method: 'POST',
        body: JSON.stringify({ projectId: projectId || undefined, days: Number(cleanupDays), cleanupArtifacts: selectedProject?.cleanupArtifacts ?? false }),
      });
      setCleanupResult(`${result.archivedRuns} runs arquivadas antes de ${formatDate(result.cutoffIso)}.`);
    }, 'Cleanup executado.');
  }

  async function finishWizard() {
    await mutate(async () => {
      const project = await api<Project>('/api/projects', {
        method: 'POST',
        body: JSON.stringify({ name: wizardDraft.projectName, description: wizardDraft.projectDescription || undefined }),
      });
      const environment = await api<Environment>('/api/environments', {
        method: 'POST',
        body: JSON.stringify({
          projectId: project.id,
          name: wizardDraft.environmentName,
          baseUrl: wizardDraft.baseUrl,
          variables: parseVars(wizardDraft.variables),
        }),
      });
      const suite = await api<Suite>('/api/suites', {
        method: 'POST',
        body: JSON.stringify({
          projectId: project.id,
          name: wizardDraft.suiteName,
          type: wizardDraft.suiteType,
          specContent: wizardDraft.specContent,
        }),
      });
      setProjectId(project.id);
      setEnvironmentId(environment.id);
      setSuiteId(suite.id);
      setSelectedRunId('');
      setWizardOpen(false);
      setWizardStep(0);
    }, 'Workspace criado.');
  }

  const pageTitle = view === 'projects'
    ? 'Projetos'
    : view === 'suites'
      ? 'Suites'
      : view === 'settings'
        ? 'Sistema'
        : 'Run workspace';

  return (
    <main className="min-h-screen bg-[#f4f2eb] text-[#1f241f]">
      <div className="grid min-h-screen xl:grid-cols-[72px_minmax(0,1fr)]">
        <aside className="hidden border-r border-[#d8d3c5] bg-[#111611] xl:block">
          <div className="flex h-screen flex-col items-center justify-between py-5">
            <div className="grid gap-4">
              <div className="grid h-11 w-11 place-items-center rounded-lg bg-[#d7e35f] text-[#111611]">
                <TerminalSquare className="h-6 w-6" />
              </div>
              <RailLink icon={Play} active={view === 'run'} label="Run" href="/v2" />
              <RailLink icon={FolderKanban} active={view === 'projects'} label="Projetos" href={projectId ? `/projects?project=${projectId}` : '/projects'} />
              <RailLink icon={FileCode2} active={view === 'suites'} label="Suites" href={projectId ? `/suites?project=${projectId}` : '/suites'} />
              <RailLink icon={Settings2} active={view === 'settings'} label="Sistema" href="/settings" />
            </div>
            <Button asChild variant="outline" size="icon" className="rounded-lg border-white/15 bg-transparent text-[#f7f6f0] hover:bg-white/10">
              <Link href="/v2" aria-label="Ir para Run workspace">
                <ChevronRight className="h-4 w-4 rotate-180" />
              </Link>
            </Button>
          </div>
        </aside>

        <section className="grid min-h-screen grid-rows-[auto_minmax(0,1fr)]">
          <header className="border-b border-[#d8d3c5] bg-[#fbfaf6]/95 px-5 py-3 backdrop-blur md:px-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-[#66705f]">TestHub v2</p>
                {view === 'run' ? (
                  <Button className="mt-1 h-9 rounded-md px-3 text-base font-extrabold" onClick={() => setWizardOpen(true)}>
                    <WandSparkles className="h-4 w-4" />
                    Wizard
                  </Button>
                ) : (
                  <h1 className="text-2xl font-extrabold tracking-normal">{pageTitle}</h1>
                )}
              </div>
              <div className="flex flex-wrap items-end gap-2">
                {me ? (
                  <div className="grid min-w-44 rounded-md border border-[#d7d2c4] bg-white px-3 py-2 text-right">
                    <span className="truncate text-sm font-semibold">{me.user.name || me.user.email}</span>
                    <span className="truncate font-mono text-[10px] uppercase tracking-[0.16em] text-[#66705f]">{me.organization.name} · {role}</span>
                  </div>
                ) : null}
                <Field label="Projeto">
                  <Select value={projectId} onValueChange={(value) => {
                    setProjectId(value);
                    setEnvironmentId('');
                    setSuiteId('');
                    setSelectedRunId('');
                    setTab('overview');
                  }}>
                    <SelectTrigger className={darkSelectClass}><SelectValue placeholder="Projeto" /></SelectTrigger>
                    <SelectContent>{projects.map((project) => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
                <Field label="Ambiente">
                  <Select value={environmentId} onValueChange={(value) => {
                    setEnvironmentId(value);
                    setSelectedRunId('');
                    setTab('overview');
                  }}>
                    <SelectTrigger className={darkSelectClass}><SelectValue placeholder="Ambiente" /></SelectTrigger>
                    <SelectContent>{projectEnvs.map((env) => <SelectItem key={env.id} value={env.id}>{env.name}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
                <Field label="Suite">
                  <Select value={suiteId} onValueChange={(value) => {
                    setSuiteId(value);
                    setSelectedRunId('');
                    setTab('overview');
                  }}>
                    <SelectTrigger className={darkSelectClass}><SelectValue placeholder="Suite" /></SelectTrigger>
                    <SelectContent>{projectSuites.map((suite) => <SelectItem key={suite.id} value={suite.id}>{suite.name} ({suiteTypeLabel(suite.type)})</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
                <Button variant="outline" className="h-10 rounded-md border-[#d7d2c4] bg-white text-[#1f241f] hover:bg-[#eeece3]" onClick={() => setOpenSheet('evidence')}>
                  <ClipboardCheck className="h-4 w-4" />
                  Evidence
                </Button>
                <Button variant="outline" className="h-10 rounded-md border-[#d7d2c4] bg-white text-[#1f241f] hover:bg-[#eeece3]" onClick={logout} disabled={busy}>
                  <LogOut className="h-4 w-4" />
                  Sair
                </Button>
              </div>
            </div>
            {error || notice ? (
              <div className="mt-4 grid gap-2">
                {error ? <Signal tone="bad" text={error} /> : null}
                {notice ? <Signal tone="good" text={notice} /> : null}
              </div>
            ) : null}
            {security?.secrets.defaultKey ? (
              <div className="mt-4 flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                <ShieldAlert className="h-4 w-4 shrink-0" />
                <span>TESTHUB_SECRET_KEY default. Troque antes de producao; gravacao de secrets fica bloqueada em producao.</span>
              </div>
            ) : null}
          </header>

          <div className="grid min-h-0 content-start gap-4 p-4 md:p-5">
            {view === 'run' ? (
              <RunWorkspace
                selectedSuite={selectedSuite}
                selectedEnv={selectedEnv}
                selectedRun={selectedRun}
                stats={stats}
                runs={scopedRuns}
                latestRuns={projectRuns}
                selectedRunId={selectedRun?.id}
                busy={busy}
                canRun={Boolean(projectId && environmentId && suiteId && canWrite)}
                onRun={runSuite}
                onSelectRun={(run) => {
                  setSuiteId(run.suiteId);
                  setEnvironmentId(run.environmentId);
                  setSelectedRunId(run.id);
                  setTab('overview');
                }}
                onOpenSuites={() => window.location.assign(projectId ? `/suites?project=${projectId}` : '/suites')}
                onOpenEnvironments={() => window.location.assign(projectId ? `/projects?project=${projectId}` : '/projects')}
                onOpenEvidence={() => setOpenSheet('evidence')}
              />
            ) : view === 'projects' ? (
              <ProjectsWorkspace
                projects={projects}
                envs={projectEnvs}
                suites={projectSuites}
                runs={projectRuns}
                selectedProjectId={projectId}
                projectDraft={projectDraft}
                envDraft={envDraft}
                busy={busy}
                canWrite={canWrite}
                canAdmin={canAdmin}
                onSelectProject={(id) => {
                  setProjectId(id);
                  setEnvironmentId('');
                  setSuiteId('');
                  setSelectedRunId('');
                }}
                onProjectDraftChange={setProjectDraft}
                onSaveProject={saveProject}
                onNewProject={() => setProjectDraft({ id: '', name: '', description: '', retentionDays: String(security?.retention.days ?? 30), cleanupArtifacts: false })}
                onArchiveProject={archiveProject}
                onEnvDraftChange={setEnvDraft}
                onEditEnv={editEnvironment}
                onNewEnv={newEnvironmentDraft}
                onSaveEnv={saveEnvironment}
                onArchiveEnv={archiveEnvironment}
              />
            ) : view === 'suites' ? (
              <SuitesWorkspace
                suites={projectSuites}
                draft={suiteDraft}
                validation={validation}
                busy={busy}
                canWrite={canWrite}
                projectId={projectId}
                openApiDraft={openApiDraft}
                approvedAiPatch={approvedAiPatch}
                onDraftChange={setSuiteDraft}
                onLoadSuite={loadSuite}
                onNewSuite={newSuiteDraft}
                onValidate={() => validateSpec(true)}
                onSave={saveSuite}
                onOpenApiDraftChange={setOpenApiDraft}
                onApprovedAiPatchChange={setApprovedAiPatch}
                onImportOpenApi={importOpenApi}
              />
            ) : (
              <SettingsWorkspace
                aiConnections={aiConnections}
                aiDraft={aiDraft}
                security={security}
                audit={audit}
                cleanupDays={cleanupDays}
                cleanupResult={cleanupResult}
                busy={busy}
                canWrite={canWrite}
                canAdmin={canAdmin}
                onAiDraftChange={setAiDraft}
                onEditAiConnection={editAiConnection}
                onSaveAiConnection={saveAiConnection}
                onCleanupDaysChange={setCleanupDays}
                onCleanup={cleanupRuns}
              />
            )}
          </div>
          <Sheet open={openSheet === 'evidence'} onOpenChange={(open) => setOpenSheet(open ? 'evidence' : null)}>
            <SheetContent className="w-full overflow-hidden p-0 sm:max-w-xl md:max-w-2xl">
              <SheetHeader className="border-b px-5 py-4 pr-12">
                <SheetTitle className="text-lg">Evidence</SheetTitle>
                <SheetDescription>{selectedRun ? `${shortId(selectedRun.id)} · ${runSummary(selectedRun)}` : 'Selecione uma run para ver evidências.'}</SheetDescription>
              </SheetHeader>
              <EvidenceColumn
                runs={scopedRuns}
                selectedRun={selectedRun}
                selectedSuite={selectedSuite}
                selectedEnv={selectedEnv}
                report={report}
                stats={stats}
                tab={tab}
                setTab={setTab}
                videos={selectedSuite?.type === 'web' ? videos : []}
                payloads={payloads}
                artifacts={artifacts}
                onSelectRun={(run) => {
                  setSuiteId(run.suiteId);
                  setEnvironmentId(run.environmentId);
                  setSelectedRunId(run.id);
                  setTab('overview');
                }}
                onCancel={cancelRun}
                onExplain={explainFailure}
                onSuggestFix={(run) => runAi('suggest-test-fix', run, 'Sugestao de correcao gerada.')}
                onSuggestCases={(run) => runAi('suggest-test-cases', run, 'Sugestao de casos gerada.')}
                aiOutput={aiOutput}
              />
            </SheetContent>
          </Sheet>
          <WizardDialog
            open={wizardOpen}
            step={wizardStep}
            draft={wizardDraft}
            busy={busy}
            onOpenChange={setWizardOpen}
            onStepChange={setWizardStep}
            onDraftChange={setWizardDraft}
            onFinish={finishWizard}
          />
        </section>
      </div>
    </main>
  );
}

function RunWorkspace(props: {
  selectedSuite?: Suite;
  selectedEnv?: Environment;
  selectedRun?: Run;
  stats: ReturnType<typeof summarize>;
  runs: Run[];
  latestRuns: Run[];
  selectedRunId?: string;
  busy: boolean;
  canRun: boolean;
  onRun: () => Promise<void>;
  onSelectRun: (run: Run) => void;
  onOpenSuites: () => void;
  onOpenEnvironments: () => void;
  onOpenEvidence: () => void;
}) {
  return (
    <div className="grid min-h-0 content-start gap-4">
      <section className="self-start overflow-hidden rounded-xl border border-[#d8d3c5] bg-[#fbfaf6] shadow-sm">
        <div className="grid gap-3 p-3 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-stretch">
          <div className="grid gap-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-[#66705f]">Suite atual</p>
                <h2 className="mt-1 text-xl font-extrabold tracking-normal md:text-2xl">{props.selectedSuite?.name ?? 'Selecione uma suite'}</h2>
                <p className="mt-1 break-all font-mono text-xs text-[#66705f]">{props.selectedEnv?.baseUrl ?? 'Nenhum target selecionado'}</p>
              </div>
              {props.selectedRun ? <Status status={props.selectedRun.status} /> : <Badge variant="muted" className="h-7 font-mono uppercase">Sem run</Badge>}
            </div>

            <div className="grid gap-2 md:grid-cols-3">
              <RunFact label="Suite selecionada" value={props.selectedSuite ? `${suiteTypeLabel(props.selectedSuite.type)} · ${shortId(props.selectedSuite.id)}` : '-'} />
              <RunFact label="Target" value={props.selectedEnv?.name ?? '-'} />
              <RunFact label="Última run nesta seleção" value={props.selectedRun ? `${shortId(props.selectedRun.id)} · ${runSummary(props.selectedRun)}` : 'Sem histórico para esta suite/target'} />
            </div>
          </div>

          <div className="grid gap-2 rounded-lg border border-[#d8d3c5] bg-white p-3">
            <div className="grid grid-cols-4 overflow-hidden rounded-md border border-[#e1ddd1] bg-[#fbfaf6]">
              <Score label="Pass" value={props.stats.passed} tone="good" />
              <Score label="Fail" value={props.stats.failed} tone="bad" />
              <Score label="Error" value={props.stats.error} tone="bad" />
              <Score label="Live" value={props.stats.active} tone="warn" />
            </div>
            <Button onClick={props.onRun} disabled={props.busy || !props.canRun} className="h-10 rounded-md text-sm font-bold">
              {props.busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Play className="h-5 w-5" />}
              Run suite
            </Button>
            <div className="grid grid-cols-3 gap-2">
              <Button variant="outline" className="rounded-md border-[#d7d2c4] bg-white text-[#1f241f] hover:bg-[#eeece3]" onClick={props.onOpenSuites}>
                <FileCode2 className="h-4 w-4" />
                Suites
              </Button>
              <Button variant="outline" className="rounded-md border-[#d7d2c4] bg-white text-[#1f241f] hover:bg-[#eeece3]" onClick={props.onOpenEnvironments}>
                <Database className="h-4 w-4" />
                Ambientes
              </Button>
              <Button variant="outline" className="rounded-md border-[#d7d2c4] bg-white text-[#1f241f] hover:bg-[#eeece3]" onClick={props.onOpenEvidence}>
                <ClipboardCheck className="h-4 w-4" />
                Evidence
              </Button>
            </div>
          </div>
        </div>
      </section>

      <RecentRunsOverview runs={props.runs} selectedRunId={props.selectedRunId} onSelectRun={props.onSelectRun} onOpenSuites={props.onOpenSuites} onOpenEnvironments={props.onOpenEnvironments} onOpenEvidence={props.onOpenEvidence} />
      <LatestRunsOverview runs={props.latestRuns} selectedRunId={props.selectedRunId} onSelectRun={props.onSelectRun} onOpenEvidence={props.onOpenEvidence} />
    </div>
  );
}

function RecentRunsOverview({ runs, selectedRunId, onSelectRun, onOpenSuites, onOpenEnvironments, onOpenEvidence }: { runs: Run[]; selectedRunId?: string; onSelectRun: (run: Run) => void; onOpenSuites: () => void; onOpenEnvironments: () => void; onOpenEvidence: () => void }) {
  const recentRuns = runs.slice(0, 6);
  return (
    <RunsSection title="Runs desta seleção" description="Histórico filtrado pela suite e ambiente escolhidos no topo." count={recentRuns.length}>
      <div className="grid gap-3">
        {recentRuns.length > 0 ? (
          <div className="grid gap-2 md:grid-cols-2 2xl:grid-cols-3">
            {recentRuns.map((run) => (
              <button
                key={run.id}
                type="button"
                onClick={() => {
                  onSelectRun(run);
                  onOpenEvidence();
                }}
                className={cn('grid cursor-pointer gap-3 rounded-lg border bg-white p-3 text-left transition hover:border-[#9fb25a] hover:bg-[#f5f4ee]', selectedRunId === run.id ? 'border-[#9fb25a] bg-[#f2f6d8]' : 'border-[#e1ddd1]')}
              >
                <div className="flex items-center justify-between gap-3">
                  <Status status={run.status} />
                  <span className="font-mono text-xs text-[#66705f]">{formatDate(run.createdAt)}</span>
                </div>
                <p className="font-mono text-xs text-[#66705f]">{shortId(run.id)} · {runSummary(run)}</p>
              </button>
            ))}
          </div>
        ) : (
          <DarkEmpty text="Nenhuma run para esta suite neste ambiente." />
        )}
        <Separator />
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="rounded-md border-[#d7d2c4] bg-white text-[#1f241f] hover:bg-[#eeece3]" onClick={onOpenSuites}>
            <FileCode2 className="h-4 w-4" />
            Gerenciar suites
          </Button>
          <Button variant="outline" className="rounded-md border-[#d7d2c4] bg-white text-[#1f241f] hover:bg-[#eeece3]" onClick={onOpenEnvironments}>
            <Database className="h-4 w-4" />
            Gerenciar ambientes
          </Button>
        </div>
      </div>
    </RunsSection>
  );
}

function LatestRunsOverview({ runs, selectedRunId, onSelectRun, onOpenEvidence }: { runs: Run[]; selectedRunId?: string; onSelectRun: (run: Run) => void; onOpenEvidence: () => void }) {
  const latestRuns = runs.slice(0, 8);
  return (
    <RunsSection title="Últimas runs do projeto" description="Histórico geral recente, independente da suite selecionada." count={latestRuns.length} defaultOpen={false}>
        {latestRuns.length > 0 ? (
          <div className="grid gap-2 md:grid-cols-2 2xl:grid-cols-4">
            {latestRuns.map((run) => (
              <button
                key={run.id}
                type="button"
                onClick={() => {
                  onSelectRun(run);
                  onOpenEvidence();
                }}
                className={cn('grid cursor-pointer gap-3 rounded-lg border bg-white p-3 text-left transition hover:border-[#9fb25a] hover:bg-[#f5f4ee]', selectedRunId === run.id ? 'border-[#9fb25a] bg-[#f2f6d8]' : 'border-[#e1ddd1]')}
              >
                <div className="flex items-center justify-between gap-3">
                  <Status status={run.status} />
                  <span className="font-mono text-xs text-[#66705f]">{formatDate(run.createdAt)}</span>
                </div>
                <p className="font-mono text-xs text-[#66705f]">{shortId(run.id)} · {runSummary(run)}</p>
              </button>
            ))}
          </div>
        ) : (
          <DarkEmpty text="Nenhuma run no projeto." />
        )}
    </RunsSection>
  );
}

function RunsSection({ title, description, count, defaultOpen = true, children }: { title: string; description: string; count: number; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen} asChild>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <ClipboardCheck className="h-4 w-4 text-[#426b4d]" />
                <CardTitle className="font-mono text-[11px] uppercase tracking-[0.2em] text-[#66705f]">{title}</CardTitle>
                <Badge variant="outline">{count}</Badge>
              </div>
              <CardDescription>{description}</CardDescription>
            </div>
            <CollapsibleTrigger asChild>
              <Button variant="outline" size="sm" className="shrink-0">
                <ChevronDown data-icon="inline-start" className={cn('transition-transform', !open && '-rotate-90')} />
                {open ? 'Recolher' : 'Expandir'}
              </Button>
            </CollapsibleTrigger>
          </div>
        </CardHeader>
        <CollapsibleContent>
          <CardContent>{children}</CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

function RunFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[#e1ddd1] bg-white p-2.5">
      <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#66705f]">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold">{value}</p>
    </div>
  );
}

function ProjectsWorkspace(props: {
  projects: Project[];
  envs: Environment[];
  suites: Suite[];
  runs: Run[];
  selectedProjectId: string;
  projectDraft: { id: string; name: string; description: string; retentionDays: string; cleanupArtifacts: boolean };
  envDraft: { id: string; name: string; baseUrl: string; variables: string };
  busy: boolean;
  canWrite: boolean;
  canAdmin: boolean;
  onSelectProject: (id: string) => void;
  onProjectDraftChange: (draft: { id: string; name: string; description: string; retentionDays: string; cleanupArtifacts: boolean }) => void;
  onSaveProject: () => void;
  onNewProject: () => void;
  onArchiveProject: (project: Project) => void;
  onEnvDraftChange: (draft: { id: string; name: string; baseUrl: string; variables: string }) => void;
  onEditEnv: (env: Environment) => void;
  onNewEnv: () => void;
  onSaveEnv: () => void;
  onArchiveEnv: (env: Environment) => void;
}) {
  const selectedProject = props.projects.find((project) => project.id === props.selectedProjectId);
  return (
    <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
      <Card className="self-start">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle>Projetos</CardTitle>
              <CardDescription>{props.projects.length} ativos</CardDescription>
            </div>
            <Button size="sm" onClick={props.onNewProject} disabled={!props.canWrite}>Novo</Button>
          </div>
        </CardHeader>
        <CardContent className="grid gap-2">
          {props.projects.map((project) => (
            <button
              key={project.id}
              type="button"
              onClick={() => props.onSelectProject(project.id)}
              className={cn('grid gap-1 rounded-lg border bg-white p-3 text-left transition hover:border-[#9fb25a]', project.id === props.selectedProjectId ? 'border-[#9fb25a] bg-[#f2f6d8]' : 'border-[#e1ddd1]')}
            >
              <span className="break-words font-semibold">{project.name}</span>
              <span className="font-mono text-xs text-[#66705f]">{shortId(project.id)}</span>
            </button>
          ))}
          {props.projects.length === 0 ? <DarkEmpty text="Nenhum projeto." /> : null}
        </CardContent>
      </Card>

      <div className="grid gap-4">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle>{props.projectDraft.id ? 'Editar projeto' : 'Criar projeto'}</CardTitle>
                <CardDescription>{selectedProject ? `${props.envs.length} ambientes · ${props.suites.length} suites · ${props.runs.length} runs` : 'Selecione ou crie um projeto.'}</CardDescription>
              </div>
              {selectedProject && props.canAdmin ? <Button variant="destructive" size="sm" onClick={() => props.onArchiveProject(selectedProject)}><Trash2 data-icon="inline-start" />Arquivar</Button> : null}
            </div>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_120px_120px_auto] md:items-end">
            <Field label="Nome"><Input value={props.projectDraft.name} onChange={(event) => props.onProjectDraftChange({ ...props.projectDraft, name: event.target.value })} /></Field>
            <Field label="Descricao"><Input value={props.projectDraft.description} onChange={(event) => props.onProjectDraftChange({ ...props.projectDraft, description: event.target.value })} /></Field>
            <Field label="Retention"><Input type="number" min={1} value={props.projectDraft.retentionDays} onChange={(event) => props.onProjectDraftChange({ ...props.projectDraft, retentionDays: event.target.value })} /></Field>
            <label className="flex h-10 items-center gap-2 rounded-md border border-[#d7d2c4] bg-white px-3 text-sm">
              <input type="checkbox" checked={props.projectDraft.cleanupArtifacts} onChange={(event) => props.onProjectDraftChange({ ...props.projectDraft, cleanupArtifacts: event.target.checked })} />
              Artifacts
            </label>
            <Button onClick={props.onSaveProject} disabled={props.busy || !props.canWrite || !props.projectDraft.name.trim()}>Salvar projeto</Button>
          </CardContent>
        </Card>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Ambientes do projeto</CardTitle>
              <CardDescription>Targets ficam aqui, dentro do projeto.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2">
              {props.envs.map((env) => (
                <div key={env.id} className={cn('grid gap-3 rounded-lg border bg-white p-3', props.envDraft.id === env.id ? 'border-[#9fb25a] bg-[#f2f6d8]' : 'border-[#e1ddd1]')}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold">{env.name}</p>
                      <p className="break-all font-mono text-xs text-[#66705f]">{env.baseUrl}</p>
                    </div>
                    <Badge variant="outline">{Object.keys(env.variables ?? {}).length} vars</Badge>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={() => props.onEditEnv(env)} disabled={!props.canWrite}>Editar</Button>
                    <Button variant="destructive" size="sm" onClick={() => props.onArchiveEnv(env)} disabled={!props.canAdmin}>Arquivar</Button>
                  </div>
                </div>
              ))}
              {props.envs.length === 0 ? <DarkEmpty text="Nenhum ambiente neste projeto." /> : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle>{props.envDraft.id ? 'Editar ambiente' : 'Novo ambiente'}</CardTitle>
                  <CardDescription>{props.envDraft.id ? shortId(props.envDraft.id) : 'Target do projeto.'}</CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={props.onNewEnv} disabled={!props.canWrite}>Novo</Button>
              </div>
            </CardHeader>
            <CardContent className="grid gap-3">
              <Field label="Nome"><Input value={props.envDraft.name} onChange={(event) => props.onEnvDraftChange({ ...props.envDraft, name: event.target.value })} placeholder="hml" /></Field>
              <Field label="Base URL"><Input value={props.envDraft.baseUrl} onChange={(event) => props.onEnvDraftChange({ ...props.envDraft, baseUrl: event.target.value })} placeholder="https://app.local" /></Field>
              <Field label="Variaveis"><Textarea className="min-h-36 font-mono text-xs" value={props.envDraft.variables} onChange={(event) => props.onEnvDraftChange({ ...props.envDraft, variables: event.target.value })} placeholder="TOKEN=abc" /></Field>
              <Button onClick={props.onSaveEnv} disabled={props.busy || !props.canWrite || !props.selectedProjectId || !props.envDraft.name.trim() || !props.envDraft.baseUrl.trim()}>Salvar ambiente</Button>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Suites vinculadas</CardTitle>
            <CardDescription>Listagem simples. Edicao fica na tela de suites.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {props.suites.map((suite) => (
              <div key={suite.id} className="grid gap-3 rounded-lg border border-[#e1ddd1] bg-white p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="break-words font-semibold">{suite.name}</p>
                    <p className="font-mono text-xs text-[#66705f]">{shortId(suite.id)}</p>
                  </div>
                  <Badge variant={suite.type === 'api' ? 'secondary' : 'outline'}>{suiteTypeLabel(suite.type)}</Badge>
                </div>
                <Button asChild variant="outline" size="sm">
                  <Link href={`/suites?project=${suite.projectId}&suite=${suite.id}`}>Alterar</Link>
                </Button>
              </div>
            ))}
            {props.suites.length === 0 ? <DarkEmpty text="Nenhuma suite neste projeto." /> : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function SuitesWorkspace(props: {
  suites: Suite[];
  draft: { id: string; name: string; type: 'api' | 'web'; specContent: string };
  validation: ValidationResult | null;
  busy: boolean;
  canWrite: boolean;
  projectId: string;
  openApiDraft: OpenApiDraft;
  approvedAiPatch: boolean;
  onDraftChange: (draft: { id: string; name: string; type: 'api' | 'web'; specContent: string }) => void;
  onLoadSuite: (suite: Suite) => void;
  onNewSuite: () => void;
  onValidate: () => void;
  onSave: () => void;
  onOpenApiDraftChange: (draft: OpenApiDraft) => void;
  onApprovedAiPatchChange: (value: boolean) => void;
  onImportOpenApi: () => void;
}) {
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <SuiteMenu {...props} />
        <Card className="self-start">
          <CardHeader className="pb-3">
            <CardTitle>Import OpenAPI</CardTitle>
            <CardDescription>Cria suite API no projeto selecionado.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <Field label="Nome"><Input value={props.openApiDraft.name} onChange={(event) => props.onOpenApiDraftChange({ ...props.openApiDraft, name: event.target.value })} /></Field>
            <Field label="Base URL"><Input value={props.openApiDraft.baseUrl} onChange={(event) => props.onOpenApiDraftChange({ ...props.openApiDraft, baseUrl: event.target.value })} placeholder="https://api.local" /></Field>
            <Field label="Auth">
              <Select value={props.openApiDraft.authTemplate} onValueChange={(value) => props.onOpenApiDraftChange({ ...props.openApiDraft, authTemplate: value as OpenApiDraft['authTemplate'] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem auth</SelectItem>
                  <SelectItem value="bearer">Bearer API_TOKEN</SelectItem>
                  <SelectItem value="apiKey">x-api-key</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Headers"><Textarea className="min-h-20 font-mono text-xs" value={props.openApiDraft.headers} onChange={(event) => props.onOpenApiDraftChange({ ...props.openApiDraft, headers: event.target.value })} placeholder="x-tenant=demo" /></Field>
            <Field label="Tags"><Input value={props.openApiDraft.tags} onChange={(event) => props.onOpenApiDraftChange({ ...props.openApiDraft, tags: event.target.value })} placeholder="billing, smoke" /></Field>
            <Field label="Endpoints"><Textarea className="min-h-20 font-mono text-xs" value={props.openApiDraft.selectedOperations} onChange={(event) => props.onOpenApiDraftChange({ ...props.openApiDraft, selectedOperations: event.target.value })} placeholder="GET /health&#10;createUser" /></Field>
            <Field label="OpenAPI JSON"><Textarea className="min-h-52 font-mono text-xs" value={props.openApiDraft.spec} onChange={(event) => props.onOpenApiDraftChange({ ...props.openApiDraft, spec: event.target.value })} placeholder='{"openapi":"3.0.0","paths":{}}' /></Field>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={props.openApiDraft.includeBodyExamples} onChange={(event) => props.onOpenApiDraftChange({ ...props.openApiDraft, includeBodyExamples: event.target.checked })} /> Incluir body examples</label>
            <Button onClick={props.onImportOpenApi} disabled={props.busy || !props.canWrite || !props.projectId || !props.openApiDraft.spec.trim()}><Upload data-icon="inline-start" />Importar</Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function SettingsWorkspace(props: {
  aiConnections: AiConnection[];
  aiDraft: { id: string; name: string; provider: AiConnection['provider']; apiKey: string; model: string; baseUrl: string; enabled: boolean };
  security: SecurityStatus | null;
  audit: AuditEntry[];
  cleanupDays: string;
  cleanupResult: string;
  busy: boolean;
  canWrite: boolean;
  canAdmin: boolean;
  onAiDraftChange: (draft: { id: string; name: string; provider: AiConnection['provider']; apiKey: string; model: string; baseUrl: string; enabled: boolean }) => void;
  onEditAiConnection: (connection: AiConnection) => void;
  onSaveAiConnection: () => void;
  onCleanupDaysChange: (value: string) => void;
  onCleanup: () => void;
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
      <div className="grid gap-4">
        <Card>
          <CardHeader className="pb-3"><CardTitle>Seguranca empresa</CardTitle><CardDescription>OIDC, RBAC, allowlist, secrets e retention.</CardDescription></CardHeader>
          <CardContent className="grid gap-2 md:grid-cols-2">
            <SecurityLine label="OIDC/Auth.js" ok={Boolean(props.security?.oidc.configured)} value={props.security?.oidc.issuer ?? 'nao configurado'} />
            <SecurityLine label="API token" ok={Boolean(props.security?.auth.apiTokenEnabled)} value={props.security?.auth.apiTokenEnabled ? 'ativo' : 'desligado'} />
            <SecurityLine label="RBAC" ok value={props.security?.auth.rbacRole ?? 'viewer'} />
            <SecurityLine label="TESTHUB_SECRET_KEY" ok={!props.security?.secrets.defaultKey} value={props.security?.secrets.defaultKey ? 'default, trocar antes de producao' : 'custom'} />
            <SecurityLine label="Allowlist hosts" ok={Boolean(props.security && !props.security.network.allowAllWhenEmpty)} value={props.security?.network.allowedHosts.join(', ') || 'vazia, permite tudo'} />
            <SecurityLine label="Retention" ok value={`${props.security?.retention.days ?? props.cleanupDays} dias`} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle>Sessao local</CardTitle><CardDescription>Token bearer/OIDC usado pela UI quando auth estiver ligada.</CardDescription></CardHeader>
          <CardContent><ApiTokenControl /></CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle>Audit log</CardTitle><CardDescription>Mutacoes recentes na API.</CardDescription></CardHeader>
          <CardContent className="grid gap-2">
            <div className="flex justify-end">
              <Button asChild variant="outline" size="sm">
                <a href={`${apiBase}/api/audit/export`} target="_blank">Export CSV</a>
              </Button>
            </div>
            {props.audit.map((entry) => (
              <div key={entry.id} className="grid gap-1 rounded-lg border border-[#e1ddd1] bg-white p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-xs font-bold">{entry.action}</span>
                  <Badge variant={entry.status === 'ok' ? 'success' : entry.status === 'blocked' ? 'warning' : 'destructive'}>{entry.status}</Badge>
                </div>
                <p className="font-mono text-xs text-[#66705f]">{formatDate(entry.createdAt)} · {entry.actor}{entry.target ? ` · ${entry.target}` : ''}</p>
              </div>
            ))}
            {props.audit.length === 0 ? <DarkEmpty text="Audit vazio." /> : null}
          </CardContent>
        </Card>
      </div>

      <div className="grid content-start gap-4">
        <Card>
          <CardHeader className="pb-3"><CardTitle>AI connections</CardTitle><CardDescription>{props.aiConnections.length} configuradas.</CardDescription></CardHeader>
          <CardContent className="grid gap-2">
            {props.aiConnections.map((connection) => (
              <button key={connection.id} type="button" onClick={() => props.onEditAiConnection(connection)} className="grid gap-2 rounded-lg border border-[#e1ddd1] bg-white p-3 text-left hover:border-[#9fb25a]">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold">{connection.name}</span>
                  <Badge variant={connection.enabled ? 'success' : 'muted'}>{connection.enabled ? 'ativa' : 'off'}</Badge>
                </div>
                <p className="font-mono text-xs text-[#66705f]">{connection.provider} · {connection.model}</p>
              </button>
            ))}
            {props.aiConnections.length === 0 ? <DarkEmpty text="Nenhuma AI connection." /> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle>{props.aiDraft.id ? 'Editar AI' : 'Nova AI'}</CardTitle><CardDescription>Usada no explain failure.</CardDescription></CardHeader>
          <CardContent className="grid gap-3">
            <Field label="Nome"><Input value={props.aiDraft.name} onChange={(event) => props.onAiDraftChange({ ...props.aiDraft, name: event.target.value })} /></Field>
            <Field label="Provider">
              <Select value={props.aiDraft.provider} onValueChange={(value) => props.onAiDraftChange({ ...props.aiDraft, provider: value as AiConnection['provider'] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="openrouter">OpenRouter</SelectItem>
                  <SelectItem value="openai">OpenAI</SelectItem>
                  <SelectItem value="anthropic">Anthropic</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Modelo"><Input value={props.aiDraft.model} onChange={(event) => props.onAiDraftChange({ ...props.aiDraft, model: event.target.value })} /></Field>
            <Field label="Base URL"><Input value={props.aiDraft.baseUrl} onChange={(event) => props.onAiDraftChange({ ...props.aiDraft, baseUrl: event.target.value })} /></Field>
            <Field label="API key"><Input type="password" value={props.aiDraft.apiKey} onChange={(event) => props.onAiDraftChange({ ...props.aiDraft, apiKey: event.target.value })} placeholder={props.aiDraft.id ? '[REDACTED]' : 'sk-...'} /></Field>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={props.aiDraft.enabled} onChange={(event) => props.onAiDraftChange({ ...props.aiDraft, enabled: event.target.checked })} /> Ativa</label>
            <Button onClick={props.onSaveAiConnection} disabled={props.busy || !props.canAdmin || !props.aiDraft.name || !props.aiDraft.model}>Salvar AI</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle>Cleanup</CardTitle><CardDescription>Aplica politica de retention.</CardDescription></CardHeader>
          <CardContent className="grid gap-3">
            <Field label="Dias"><Input type="number" min={1} value={props.cleanupDays} onChange={(event) => props.onCleanupDaysChange(event.target.value)} /></Field>
            <Button variant="destructive" onClick={props.onCleanup} disabled={props.busy || !props.canAdmin || Number(props.cleanupDays) < 1}>Executar cleanup</Button>
            {props.cleanupResult ? <Signal tone="good" text={props.cleanupResult} /> : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ApiTokenControl() {
  const [token, setToken] = useState('');
  useEffect(() => {
    setToken(window.localStorage.getItem('testhub.token') ?? '');
  }, []);
  return (
    <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto_auto]">
      <Input type="password" value={token} onChange={(event) => setToken(event.target.value)} placeholder="Bearer token / OIDC access token" />
      <Button onClick={() => window.localStorage.setItem('testhub.token', token)}>Salvar token</Button>
      <Button variant="outline" onClick={() => { window.localStorage.removeItem('testhub.token'); setToken(''); }}>Limpar</Button>
    </div>
  );
}

function SystemMenu(props: {
  projects: Project[];
  selectedProjectId: string;
  projectDraft: { id: string; name: string; description: string };
  openApiDraft: { name: string; spec: string };
  aiConnections: AiConnection[];
  aiDraft: { id: string; name: string; provider: AiConnection['provider']; apiKey: string; model: string; baseUrl: string; enabled: boolean };
  security: SecurityStatus | null;
  audit: AuditEntry[];
  cleanupDays: string;
  cleanupResult: string;
  busy: boolean;
  onSelectProject: (id: string) => void;
  onProjectDraftChange: (draft: { id: string; name: string; description: string }) => void;
  onSaveProject: () => void;
  onNewProject: () => void;
  onArchiveProject: (project: Project) => void;
  onOpenApiDraftChange: (draft: { name: string; spec: string }) => void;
  onImportOpenApi: () => void;
  onAiDraftChange: (draft: { id: string; name: string; provider: AiConnection['provider']; apiKey: string; model: string; baseUrl: string; enabled: boolean }) => void;
  onEditAiConnection: (connection: AiConnection) => void;
  onSaveAiConnection: () => void;
  onCleanupDaysChange: (value: string) => void;
  onCleanup: () => void;
}) {
  return (
    <Tabs defaultValue="projects" className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] px-5 pb-5">
      <TabsList className="mt-4 grid h-auto grid-cols-2 md:grid-cols-5">
        <TabsTrigger value="projects">Projetos</TabsTrigger>
        <TabsTrigger value="openapi">OpenAPI</TabsTrigger>
        <TabsTrigger value="ai">AI</TabsTrigger>
        <TabsTrigger value="security">Seguranca</TabsTrigger>
        <TabsTrigger value="audit">Audit</TabsTrigger>
      </TabsList>

      <ScrollArea className="min-h-0 pr-3">
        <TabsContent value="projects">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle>Projetos</CardTitle>
                <CardDescription>{props.projects.length} projetos ativos.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-2">
                {props.projects.map((project) => (
                  <div key={project.id} className={cn('grid gap-3 rounded-lg border bg-white p-3', project.id === props.selectedProjectId ? 'border-[#9fb25a] bg-[#f2f6d8]' : 'border-[#e1ddd1]')}>
                    <button type="button" className="min-w-0 text-left" onClick={() => props.onSelectProject(project.id)}>
                      <p className="break-words font-semibold">{project.name}</p>
                      <p className="font-mono text-xs text-[#66705f]">{shortId(project.id)}</p>
                      {project.description ? <p className="mt-1 text-sm text-[#66705f]">{project.description}</p> : null}
                    </button>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => props.onProjectDraftChange({ id: project.id, name: project.name, description: project.description ?? '' })}>Editar</Button>
                      <Button variant="destructive" size="sm" onClick={() => props.onArchiveProject(project)}><Trash2 data-icon="inline-start" />Arquivar</Button>
                    </div>
                  </div>
                ))}
                {props.projects.length === 0 ? <DarkEmpty text="Nenhum projeto." /> : null}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle>{props.projectDraft.id ? 'Editar projeto' : 'Novo projeto'}</CardTitle>
                    <CardDescription>{props.projectDraft.id ? shortId(props.projectDraft.id) : 'Container principal do workspace.'}</CardDescription>
                  </div>
                  <Button variant="outline" size="sm" onClick={props.onNewProject}>Novo</Button>
                </div>
              </CardHeader>
              <CardContent className="grid gap-3">
                <Field label="Nome"><Input value={props.projectDraft.name} onChange={(event) => props.onProjectDraftChange({ ...props.projectDraft, name: event.target.value })} placeholder="Coziva Local" /></Field>
                <Field label="Descricao"><Textarea value={props.projectDraft.description} onChange={(event) => props.onProjectDraftChange({ ...props.projectDraft, description: event.target.value })} placeholder="Escopo, app ou squad." /></Field>
                <Button onClick={props.onSaveProject} disabled={props.busy || !props.projectDraft.name.trim()}>Salvar projeto</Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="openapi">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Import OpenAPI</CardTitle>
              <CardDescription>Converte paths HTTP em suite API do projeto selecionado.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              <Field label="Nome da suite"><Input value={props.openApiDraft.name} onChange={(event) => props.onOpenApiDraftChange({ ...props.openApiDraft, name: event.target.value })} /></Field>
              <Field label="OpenAPI JSON">
                <Textarea className="min-h-80 font-mono text-xs" value={props.openApiDraft.spec} onChange={(event) => props.onOpenApiDraftChange({ ...props.openApiDraft, spec: event.target.value })} placeholder='{"openapi":"3.0.0","paths":{"/health":{"get":{"responses":{"200":{"description":"ok"}}}}}}' />
              </Field>
              <Button onClick={props.onImportOpenApi} disabled={props.busy || !props.selectedProjectId || !props.openApiDraft.spec.trim()}><Upload data-icon="inline-start" />Importar OpenAPI</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ai">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle>Connections</CardTitle>
                <CardDescription>{props.aiConnections.length} conexoes configuradas.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-2">
                {props.aiConnections.map((connection) => (
                  <button key={connection.id} type="button" onClick={() => props.onEditAiConnection(connection)} className="grid gap-2 rounded-lg border border-[#e1ddd1] bg-white p-3 text-left hover:border-[#9fb25a]">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-semibold">{connection.name}</span>
                      <Badge variant={connection.enabled ? 'success' : 'muted'}>{connection.enabled ? 'ativa' : 'off'}</Badge>
                    </div>
                    <p className="font-mono text-xs text-[#66705f]">{connection.provider} · {connection.model}</p>
                  </button>
                ))}
                {props.aiConnections.length === 0 ? <DarkEmpty text="Nenhuma AI connection." /> : null}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle>{props.aiDraft.id ? 'Editar AI' : 'Nova AI'}</CardTitle>
                <CardDescription>Usada por explain failure.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
                <Field label="Nome"><Input value={props.aiDraft.name} onChange={(event) => props.onAiDraftChange({ ...props.aiDraft, name: event.target.value })} /></Field>
                <Field label="Provider">
                  <Select value={props.aiDraft.provider} onValueChange={(value) => props.onAiDraftChange({ ...props.aiDraft, provider: value as AiConnection['provider'] })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="openrouter">OpenRouter</SelectItem>
                      <SelectItem value="openai">OpenAI</SelectItem>
                      <SelectItem value="anthropic">Anthropic</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Modelo"><Input value={props.aiDraft.model} onChange={(event) => props.onAiDraftChange({ ...props.aiDraft, model: event.target.value })} /></Field>
                <Field label="Base URL"><Input value={props.aiDraft.baseUrl} onChange={(event) => props.onAiDraftChange({ ...props.aiDraft, baseUrl: event.target.value })} /></Field>
                <Field label="API key"><Input type="password" value={props.aiDraft.apiKey} onChange={(event) => props.onAiDraftChange({ ...props.aiDraft, apiKey: event.target.value })} placeholder={props.aiDraft.id ? '[REDACTED]' : 'sk-...'} /></Field>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={props.aiDraft.enabled} onChange={(event) => props.onAiDraftChange({ ...props.aiDraft, enabled: event.target.checked })} /> Ativa</label>
                <Button onClick={props.onSaveAiConnection} disabled={props.busy || !props.aiDraft.name || !props.aiDraft.model}><WandSparkles data-icon="inline-start" />Salvar AI</Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="security">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-3"><CardTitle>Seguranca empresa</CardTitle><CardDescription>Estado atual vindo da API.</CardDescription></CardHeader>
              <CardContent className="grid gap-2">
                <SecurityLine label="OIDC/Auth.js" ok={Boolean(props.security?.oidc.configured)} value={props.security?.oidc.issuer ?? 'nao configurado'} />
                <SecurityLine label="API token" ok={Boolean(props.security?.auth.apiTokenEnabled)} value={props.security?.auth.apiTokenEnabled ? 'ativo' : 'desligado'} />
                <SecurityLine label="RBAC" ok value={props.security?.auth.rbacRole ?? 'viewer'} />
                <SecurityLine label="TESTHUB_SECRET_KEY" ok={!props.security?.secrets.defaultKey} value={props.security?.secrets.defaultKey ? 'default, trocar antes de producao' : 'custom'} />
                <SecurityLine label="Allowlist hosts" ok={Boolean(props.security && !props.security.network.allowAllWhenEmpty)} value={props.security?.network.allowedHosts.join(', ') || 'vazia, permite tudo'} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3"><CardTitle>Retention</CardTitle><CardDescription>Politica visivel + cleanup manual.</CardDescription></CardHeader>
              <CardContent className="grid gap-3">
                <Field label="Dias"><Input type="number" min={1} value={props.cleanupDays} onChange={(event) => props.onCleanupDaysChange(event.target.value)} /></Field>
                <Button variant="destructive" onClick={props.onCleanup} disabled={props.busy || Number(props.cleanupDays) < 1}>Executar cleanup</Button>
                {props.cleanupResult ? <Signal tone="good" text={props.cleanupResult} /> : null}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="audit">
          <Card>
            <CardHeader className="pb-3"><CardTitle>Audit log</CardTitle><CardDescription>Mutacoes recentes na API.</CardDescription></CardHeader>
            <CardContent className="grid gap-2">
              {props.audit.map((entry) => (
                <div key={entry.id} className="grid gap-1 rounded-lg border border-[#e1ddd1] bg-white p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-xs font-bold">{entry.action}</span>
                    <Badge variant={entry.status === 'ok' ? 'success' : entry.status === 'blocked' ? 'warning' : 'destructive'}>{entry.status}</Badge>
                  </div>
                  <p className="font-mono text-xs text-[#66705f]">{formatDate(entry.createdAt)} · {entry.actor}{entry.target ? ` · ${entry.target}` : ''}</p>
                </div>
              ))}
              {props.audit.length === 0 ? <DarkEmpty text="Audit vazio." /> : null}
            </CardContent>
          </Card>
        </TabsContent>
      </ScrollArea>
    </Tabs>
  );
}

function SecurityLine({ label, ok, value }: { label: string; ok: boolean; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-[#e1ddd1] bg-white p-3">
      <div className="min-w-0">
        <p className="font-semibold">{label}</p>
        <p className="break-words font-mono text-xs text-[#66705f]">{value}</p>
      </div>
      <Badge variant={ok ? 'success' : 'warning'}>{ok ? 'ok' : 'acao'}</Badge>
    </div>
  );
}

function SuiteMenu(props: {
  suites: Suite[];
  draft: { id: string; name: string; type: 'api' | 'web'; specContent: string };
  validation: ValidationResult | null;
  busy: boolean;
  canWrite?: boolean;
  approvedAiPatch?: boolean;
  onDraftChange: (draft: { id: string; name: string; type: 'api' | 'web'; specContent: string }) => void;
  onLoadSuite: (suite: Suite) => void;
  onNewSuite: () => void;
  onValidate: () => void;
  onSave: () => void;
  onApprovedAiPatchChange?: (value: boolean) => void;
}) {
  return (
    <div className="grid min-h-0 flex-1 gap-4 px-5 pb-5 md:grid-cols-[340px_minmax(0,1fr)]">
      <Card className="min-h-0">
        <CardHeader className="pb-3">
          <CardTitle>Biblioteca</CardTitle>
          <CardDescription>{props.suites.length} suites no projeto.</CardDescription>
        </CardHeader>
        <CardContent className="min-h-0">
          <ScrollArea className="h-[calc(100vh-220px)] pr-3">
            <div className="grid gap-2">
              <Button variant="outline" onClick={props.onNewSuite} disabled={!props.canWrite}>Nova suite</Button>
              {props.suites.map((suite) => (
                <button
                  key={suite.id}
                  type="button"
                  onClick={() => props.onLoadSuite(suite)}
                  className={cn('grid cursor-pointer gap-3 rounded-lg border bg-white p-3 text-left transition hover:border-[#9fb25a] hover:bg-[#f5f4ee]', props.draft.id === suite.id ? 'border-[#9fb25a] bg-[#f2f6d8]' : 'border-[#e1ddd1]')}
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="min-w-0 break-words font-semibold leading-snug">{suite.name}</span>
                    <Badge variant={suite.type === 'api' ? 'secondary' : 'outline'}>{suiteTypeLabel(suite.type)}</Badge>
                  </div>
                  <span className="font-mono text-xs text-[#66705f]">{shortId(suite.id)}</span>
                </button>
              ))}
              {props.suites.length === 0 ? <DarkEmpty text="Nenhuma suite." /> : null}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      <Card className="min-h-0">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>{props.draft.id ? 'Editar suite' : 'Nova suite'}</CardTitle>
              <CardDescription>{props.draft.id ? shortId(props.draft.id) : 'YAML versionavel da suite.'}</CardDescription>
            </div>
            {props.validation ? <Badge variant={props.validation.valid ? 'success' : 'destructive'}>{props.validation.valid ? `${props.validation.tests} tests` : 'invalida'}</Badge> : null}
          </div>
        </CardHeader>
        <CardContent className="grid min-h-0 gap-3">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_150px]">
            <div className="grid gap-1.5">
              <Label>Nome</Label>
              <Input value={props.draft.name} onChange={(event) => props.onDraftChange({ ...props.draft, name: event.target.value })} placeholder="login-smoke" />
            </div>
            <div className="grid gap-1.5">
              <Label>Tipo</Label>
              <Select value={props.draft.type} onValueChange={(value) => props.onDraftChange({ ...props.draft, type: value as 'api' | 'web' })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="api">API</SelectItem>
                  <SelectItem value="web">Frontend</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>YAML</Label>
            <YamlEditor value={props.draft.specContent} onChange={(value) => props.onDraftChange({ ...props.draft, specContent: value })} />
          </div>
          {props.validation && !props.validation.valid ? <Signal tone="bad" text={props.validation.error} /> : null}
          {props.draft.id ? (
            <label className="flex items-center gap-2 rounded-md border border-[#e1ddd1] bg-white px-3 py-2 text-sm">
              <input type="checkbox" checked={Boolean(props.approvedAiPatch)} onChange={(event) => props.onApprovedAiPatchChange?.(event.target.checked)} />
              Aplicar como patch aprovado por humano
            </label>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={props.onValidate} disabled={props.busy}>Validar</Button>
            <Button onClick={props.onSave} disabled={props.busy || !props.canWrite || !props.draft.name.trim() || !props.draft.specContent.trim()}>
              {props.busy ? <Loader2 data-icon="inline-start" className="animate-spin" /> : null}
              Salvar
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function EnvironmentMenu(props: {
  envs: Environment[];
  draft: { id: string; name: string; baseUrl: string; variables: string };
  busy: boolean;
  onDraftChange: (draft: { id: string; name: string; baseUrl: string; variables: string }) => void;
  onEdit: (env: Environment) => void;
  onNew: () => void;
  onSave: () => void;
  onArchive: (env: Environment) => void;
}) {
  return (
    <div className="grid min-h-0 flex-1 gap-4 px-5 pb-5 md:grid-cols-[minmax(0,1fr)_340px]">
      <Card className="min-h-0">
        <CardHeader className="pb-3">
          <CardTitle>Targets</CardTitle>
          <CardDescription>{props.envs.length} ambientes ativos.</CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[calc(100vh-220px)] pr-3">
            <div className="grid gap-2">
              {props.envs.map((env) => (
                <div key={env.id} className={cn('grid gap-3 rounded-lg border bg-white p-3', props.draft.id === env.id ? 'border-[#9fb25a] bg-[#f2f6d8]' : 'border-[#e1ddd1]')}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{env.name}</p>
                      <p className="break-all font-mono text-xs text-[#66705f]">{env.baseUrl}</p>
                    </div>
                    <Badge variant="outline">{Object.keys(env.variables ?? {}).length} vars</Badge>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={() => props.onEdit(env)}>Editar</Button>
                    <Button variant="destructive" size="sm" onClick={() => props.onArchive(env)}>Arquivar</Button>
                  </div>
                </div>
              ))}
              {props.envs.length === 0 ? <DarkEmpty text="Nenhum ambiente." /> : null}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle>{props.draft.id ? 'Editar ambiente' : 'Novo ambiente'}</CardTitle>
              <CardDescription>{props.draft.id ? shortId(props.draft.id) : 'Destino onde a suite roda.'}</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={props.onNew}>Novo</Button>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>Nome</Label>
            <Input value={props.draft.name} onChange={(event) => props.onDraftChange({ ...props.draft, name: event.target.value })} placeholder="hml" />
          </div>
          <div className="grid gap-1.5">
            <Label>Base URL</Label>
            <Input value={props.draft.baseUrl} onChange={(event) => props.onDraftChange({ ...props.draft, baseUrl: event.target.value })} placeholder="https://app.local" />
          </div>
          <div className="grid gap-1.5">
            <Label>Variaveis</Label>
            <Textarea className="min-h-44 font-mono text-xs" value={props.draft.variables} onChange={(event) => props.onDraftChange({ ...props.draft, variables: event.target.value })} placeholder="TOKEN=abc" />
          </div>
          <Button onClick={props.onSave} disabled={props.busy || !props.draft.name.trim() || !props.draft.baseUrl.trim()}>
            {props.busy ? <Loader2 data-icon="inline-start" className="animate-spin" /> : null}
            Salvar ambiente
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function YamlEditor({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const monacoRef = useRef<any>(null);
  const editorRef = useRef<any>(null);
  useEffect(() => {
    const monaco = monacoRef.current;
    const editor = editorRef.current;
    const model = editor?.getModel?.();
    if (!monaco || !model) return;
    monaco.editor.setModelMarkers(model, 'testhub-yaml', yamlDiagnostics(value, monaco));
  }, [value]);

  return (
    <div className="min-h-[calc(100vh-410px)] overflow-hidden rounded-md border border-input bg-[#0b100c]">
      <MonacoEditor
        height="calc(100vh - 410px)"
        defaultLanguage="yaml"
        value={value}
        onChange={(nextValue) => onChange(nextValue ?? '')}
        beforeMount={(monaco) => {
          monacoRef.current = monaco;
          monaco.languages.registerCompletionItemProvider('yaml', {
            provideCompletionItems: () => ({
              suggestions: [
                { label: 'version', kind: monaco.languages.CompletionItemKind.Property, insertText: 'version: 1', range: undefined as never },
                { label: 'type api', kind: monaco.languages.CompletionItemKind.Snippet, insertText: 'type: api', range: undefined as never },
                { label: 'type frontend', kind: monaco.languages.CompletionItemKind.Snippet, insertText: 'type: web', range: undefined as never },
                { label: 'api test', kind: monaco.languages.CompletionItemKind.Snippet, insertText: 'tests:\\n  - name: ${1:health}\\n    request:\\n      method: GET\\n      path: /health\\n    expect:\\n      status: 200', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, range: undefined as never },
                { label: 'frontend test', kind: monaco.languages.CompletionItemKind.Snippet, insertText: 'tests:\\n  - name: ${1:login}\\n    steps:\\n      - goto: /\\n      - expectVisible: ${2:text}', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, range: undefined as never },
              ],
            }),
          });
        }}
        onMount={(editor, monaco) => {
          editorRef.current = editor;
          monacoRef.current = monaco;
          const model = editor.getModel();
          if (model) monaco.editor.setModelMarkers(model, 'testhub-yaml', yamlDiagnostics(value, monaco));
        }}
        options={{
          minimap: { enabled: false },
          fontFamily: 'IBM Plex Mono, monospace',
          fontSize: 12,
          lineNumbersMinChars: 3,
          scrollBeyondLastLine: false,
          tabSize: 2,
          wordWrap: 'on',
          automaticLayout: true,
          glyphMargin: true,
          quickSuggestions: true,
        }}
        theme="vs-dark"
      />
    </div>
  );
}

function yamlDiagnostics(source: string, monaco: any) {
  const markers: Array<ReturnType<typeof marker>> = [];
  const lines = source.split('\n');
  let parsed: any = null;
  try {
    const doc = YAML.parseDocument(source);
    for (const error of doc.errors) {
      const line = lineFromOffset(source, error.pos?.[0] ?? 0);
      markers.push(marker(monaco, line, error.message, monaco.MarkerSeverity.Error));
    }
    parsed = doc.toJSON();
  } catch (error) {
    markers.push(marker(monaco, 1, messageOf(error), monaco.MarkerSeverity.Error));
  }
  if (!parsed || typeof parsed !== 'object') return markers;
  if (parsed.version !== 1) markers.push(marker(monaco, Math.max(1, findLine(lines, 'version')), 'version: 1 obrigatorio.', monaco.MarkerSeverity.Error));
  if (parsed.type !== 'api' && parsed.type !== 'web') markers.push(marker(monaco, Math.max(1, findLine(lines, 'type')), 'type deve ser api ou web/frontend.', monaco.MarkerSeverity.Error));
  if (!parsed.name) markers.push(marker(monaco, Math.max(1, findLine(lines, 'name')), 'name obrigatorio.'));
  if (!Array.isArray(parsed.tests) || parsed.tests.length === 0) markers.push(marker(monaco, Math.max(1, findLine(lines, 'tests')), 'tests deve ter pelo menos 1 item.', monaco.MarkerSeverity.Error));
  if (Array.isArray(parsed.tests)) {
    parsed.tests.forEach((test: any, index: number) => {
      const line = findLine(lines, `- name: ${test?.name ?? ''}`) || findLine(lines, 'tests');
      if (!test?.name) markers.push(marker(monaco, line, `tests[${index}].name obrigatorio.`));
      if (parsed.type === 'api' && !test?.request) markers.push(marker(monaco, line, `tests[${index}].request obrigatorio para API.`));
      if (parsed.type === 'web' && (!Array.isArray(test?.steps) || test.steps.length === 0)) markers.push(marker(monaco, line, `tests[${index}].steps obrigatorio para Frontend.`));
    });
  }
  return markers;
}

function marker(monaco: any, line: number, message: string, severity = monaco.MarkerSeverity.Warning) {
  return {
    severity,
    message,
    startLineNumber: line,
    startColumn: 1,
    endLineNumber: line,
    endColumn: 120,
  };
}

function lineFromOffset(source: string, offset: number): number {
  return source.slice(0, offset).split('\n').length;
}

function findLine(lines: string[], token: string): number {
  const index = lines.findIndex((line) => line.includes(token));
  return index >= 0 ? index + 1 : 1;
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
  onExplain: (run?: Run) => Promise<void>;
  onSuggestFix: (run?: Run) => Promise<void>;
  onSuggestCases: (run?: Run) => Promise<void>;
  aiOutput: string;
}) {
  return (
    <div className="grid min-h-0 flex-1 grid-rows-[auto_auto_minmax(0,1fr)] gap-4 px-5 pb-5">
      <div className="grid grid-cols-4 overflow-hidden rounded-lg border bg-card shadow-sm">
        <Score label="Pass" value={props.stats.passed} tone="good" />
        <Score label="Fail" value={props.stats.failed} tone="bad" />
        <Score label="Error" value={props.stats.error} tone="bad" />
        <Score label="Live" value={props.stats.active} tone="warn" />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              {props.selectedRun ? <Status status={props.selectedRun.status} /> : <Badge variant="muted" className="h-7 font-mono uppercase">Sem run</Badge>}
              <CardTitle className="mt-3 truncate text-2xl font-extrabold">{props.selectedSuite?.name ?? 'Sem run'}</CardTitle>
              <CardDescription className="break-all font-mono">{props.selectedEnv?.baseUrl ?? 'target ausente'}</CardDescription>
            </div>
            {props.selectedRun && ['queued', 'running'].includes(props.selectedRun.status) ? (
              <Button variant="destructive" size="sm" onClick={() => props.onCancel(props.selectedRun!)}>
                <Square data-icon="inline-start" />
                Cancelar
              </Button>
            ) : null}
            {props.selectedRun && ['failed', 'error'].includes(props.selectedRun.status) ? (
              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => props.onExplain(props.selectedRun)}>
                  <Bot data-icon="inline-start" />
                  Explicar
                </Button>
                <Button variant="outline" size="sm" onClick={() => props.onSuggestFix(props.selectedRun)}>
                  <WandSparkles data-icon="inline-start" />
                  Corrigir teste
                </Button>
                <Button variant="outline" size="sm" onClick={() => props.onSuggestCases(props.selectedRun)}>
                  <FileCode2 data-icon="inline-start" />
                  Novos casos
                </Button>
              </div>
            ) : null}
          </div>
        </CardHeader>
      </Card>

      <Tabs value={props.tab} onValueChange={(value) => props.setTab(value as EvidenceTab)} className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-4">
        <TabsList className="grid h-auto w-full grid-cols-2 sm:grid-cols-4">
          <TabsTrigger value="overview" className="min-w-0">Overview</TabsTrigger>
          <TabsTrigger value="timeline" className="min-w-0">Timeline</TabsTrigger>
          <TabsTrigger value="artifacts" className="min-w-0">Artifacts</TabsTrigger>
          <TabsTrigger value="payload" className="min-w-0">Payload</TabsTrigger>
        </TabsList>

        <ScrollArea className="min-h-0 pr-3">
          <TabsContent value="overview" className="m-0">
            <EvidenceTabContent>
              <OverviewEvidence run={props.selectedRun} report={props.report} videos={props.videos} />
              {props.aiOutput ? (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="font-mono text-[11px] uppercase tracking-[0.2em] text-[#66705f]">AI review</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-lg bg-[#0b100c] p-3 font-mono text-xs leading-5 text-[#f7f6f0]">{props.aiOutput}</pre>
                  </CardContent>
                </Card>
              ) : null}
              <OtherRuns runs={props.runs} selectedRun={props.selectedRun} onSelectRun={props.onSelectRun} />
            </EvidenceTabContent>
          </TabsContent>
          <TabsContent value="timeline" className="m-0">
            <EvidenceTabContent>
              <TimelineEvidence report={props.report} />
            </EvidenceTabContent>
          </TabsContent>
          <TabsContent value="artifacts" className="m-0">
            <EvidenceTabContent>
              <ArtifactEvidence run={props.selectedRun} artifacts={props.artifacts} />
            </EvidenceTabContent>
          </TabsContent>
          <TabsContent value="payload" className="m-0">
            <EvidenceTabContent>
              <PayloadEvidence artifacts={props.payloads} />
            </EvidenceTabContent>
          </TabsContent>
        </ScrollArea>
      </Tabs>
    </div>
  );
}

function EvidenceTabContent({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-4">{children}</div>;
}

function OtherRuns({ runs, selectedRun, onSelectRun }: { runs: Run[]; selectedRun?: Run; onSelectRun: (run: Run) => void }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="font-mono text-[11px] uppercase tracking-[0.2em] text-[#66705f]">Outras runs desta seleção</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-2">
          {runs.slice(0, 5).map((run) => (
            <button
              key={run.id}
              type="button"
              onClick={() => onSelectRun(run)}
              className={cn('grid cursor-pointer gap-2 rounded-lg border p-3 text-left transition', selectedRun?.id === run.id ? 'border-[#9fb25a] bg-[#f2f6d8]' : 'border-[#e1ddd1] bg-white hover:border-[#9fb25a] hover:bg-[#f5f4ee]')}
            >
              <div className="flex items-center justify-between gap-3">
                <Status status={run.status} />
                <span className="font-mono text-xs text-[#66705f]">{formatDate(run.createdAt)}</span>
              </div>
              <p className="font-mono text-xs text-[#66705f]">{shortId(run.id)} · {runSummary(run)}</p>
            </button>
          ))}
          {runs.length === 0 ? <DarkEmpty text="Nenhuma run para esta suite neste ambiente." /> : null}
        </div>
      </CardContent>
    </Card>
  );
}

function OverviewEvidence({ run, report, videos }: { run?: Run; report: RunReport | null; videos: Artifact[] }) {
  if (!run) return <DarkEmpty text="Selecione uma run." />;
  return (
    <div className="grid gap-4">
      <div className="rounded-lg border border-[#e1ddd1] bg-white p-4">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-[#66705f]">Run</p>
        <p className="mt-3 text-lg font-extrabold">{run.status.toUpperCase()}</p>
        <p className="mt-2 text-sm text-[#66705f]">{runSummary(run)}</p>
        {run.error ? <pre className="mt-3 overflow-auto rounded-lg bg-[#0b100c] p-3 font-mono text-xs text-[#ffb4a8]">{run.error}</pre> : null}
      </div>
      {videos[0] ? (
        <div className="overflow-hidden rounded-xl bg-black shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08),0_18px_38px_rgba(0,0,0,0.22)]">
          <video className="aspect-video w-full bg-black" src={artifactUrl(videos[0].path)} controls preload="metadata" />
        </div>
      ) : null}
      <div className="grid gap-2">
        {(report?.results ?? []).slice(0, 4).map((result) => (
          <div key={result.name} className="flex items-center justify-between gap-3 rounded-lg border border-[#e1ddd1] bg-white p-3">
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
        <div key={result.name} className="rounded-lg border border-[#e1ddd1] bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-bold">{result.name}</h3>
            <Status status={result.status} />
          </div>
          {result.error ? <pre className="mt-3 overflow-auto rounded-lg bg-[#0b100c] p-3 font-mono text-xs text-[#ffb4a8]">{result.error}</pre> : null}
          <div className="mt-3 grid gap-2">
            {(result.steps ?? []).map((step) => (
              <div key={`${result.name}:${step.index}`} className="grid gap-2 rounded-md border border-[#e1ddd1] bg-[#fbfaf6] p-2 md:grid-cols-[84px_minmax(0,1fr)_70px]">
                <Status status={step.status} />
                <span className="break-words font-mono text-xs text-[#1f241f]">{step.name}</span>
                <span className="font-mono text-xs text-[#66705f] md:text-right">{step.durationMs ?? 0}ms</span>
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
  const uniqueArtifacts = dedupeArtifacts(artifacts).filter((artifact) => artifact.path !== run?.reportHtmlPath);
  const payloadGroups = groupHttpArtifacts(uniqueArtifacts);
  const otherArtifacts = uniqueArtifacts.filter((artifact) => artifact.type !== 'request' && artifact.type !== 'response');
  if (!run?.reportHtmlPath && uniqueArtifacts.length === 0) return <DarkEmpty text="Artifacts indisponiveis." />;
  return (
    <div className="grid gap-3">
      {run?.reportHtmlPath ? <ArtifactLink label="HTML report" path={run.reportHtmlPath} type="html" /> : null}
      {otherArtifacts.map((artifact) => <ArtifactLink key={`${artifact.type}:${artifact.path}`} label={artifact.label ?? shortPath(artifact.path)} path={artifact.path} type={artifact.type} />)}
      {payloadGroups.map((group, index) => <HttpArtifactGroup key={`${group.request?.path ?? ''}:${group.response?.path ?? ''}:${index}`} group={group} index={index} />)}
    </div>
  );
}

function HttpArtifactGroup({ group, index }: { group: { request?: Artifact; response?: Artifact }; index: number }) {
  const title = `HTTP payload ${index + 1}`;
  return (
    <div className="grid gap-3 rounded-lg border border-[#e1ddd1] bg-white p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="font-semibold">{title}</span>
        <Badge variant="outline">request / response</Badge>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {group.request ? <ArtifactLink label="Request" path={group.request.path} type="request" compact /> : null}
        {group.response ? <ArtifactLink label="Response" path={group.response.path} type="response" compact /> : null}
      </div>
    </div>
  );
}

function PayloadEvidence({ artifacts }: { artifacts: Artifact[] }) {
  if (artifacts.length === 0) return <DarkEmpty text="Payload indisponivel para runs frontend." />;
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
    <div className="rounded-lg border border-[#e1ddd1] bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="font-bold">{artifact.label ?? artifact.type}</span>
        <Badge variant={artifact.type === 'response' ? 'secondary' : 'outline'}>{artifact.type}</Badge>
      </div>
      {error ? <p className="mt-3 text-sm text-[#ffb4a8]">{error}</p> : null}
      <pre className="mt-3 max-h-96 overflow-auto rounded-lg bg-[#0b100c] p-3 font-mono text-xs leading-5 text-[#f7f6f0]">{payload ? JSON.stringify(payload, null, 2) : 'loading...'}</pre>
    </div>
  );
}

function WizardDialog(props: {
  open: boolean;
  step: number;
  draft: WizardDraft;
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  onStepChange: (step: number) => void;
  onDraftChange: (draft: WizardDraft) => void;
  onFinish: () => Promise<void>;
}) {
  const labels = ['Projeto', 'Ambiente', 'Suite', 'Revisao'];
  const canNext = props.step === 0
    ? props.draft.projectName.trim()
    : props.step === 1
      ? props.draft.environmentName.trim() && props.draft.baseUrl.trim()
      : props.step === 2
        ? props.draft.suiteName.trim() && props.draft.specContent.trim()
        : true;
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent
        className="max-w-5xl"
        onEscapeKeyDown={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Wizard de configuracao</DialogTitle>
          <DialogDescription>Crie projeto, ambiente e primeira suite em fluxo unico.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid grid-cols-4 gap-2">
            {labels.map((label, index) => (
              <button
                key={label}
                type="button"
                onClick={() => props.onStepChange(index)}
                className={cn('rounded-lg border px-3 py-2 text-left text-sm font-semibold', props.step === index ? 'border-[#9fb25a] bg-[#f2f6d8]' : 'border-[#e1ddd1] bg-white')}
              >
                <span className="font-mono text-[10px] text-[#66705f]">Passo {index + 1}</span>
                <span className="block">{label}</span>
              </button>
            ))}
          </div>

          {props.step === 0 ? (
            <div className="grid gap-3">
              <Field label="Nome do projeto"><Input autoFocus value={props.draft.projectName} onChange={(event) => props.onDraftChange({ ...props.draft, projectName: event.target.value })} placeholder="Checkout SaaS" /></Field>
              <Field label="Descricao"><Textarea value={props.draft.projectDescription} onChange={(event) => props.onDraftChange({ ...props.draft, projectDescription: event.target.value })} placeholder="Escopo, squad, produto ou modulo." /></Field>
            </div>
          ) : null}

          {props.step === 1 ? (
            <div className="grid gap-3">
              <Field label="Nome do ambiente"><Input value={props.draft.environmentName} onChange={(event) => props.onDraftChange({ ...props.draft, environmentName: event.target.value })} placeholder="hml" /></Field>
              <Field label="Base URL"><Input value={props.draft.baseUrl} onChange={(event) => props.onDraftChange({ ...props.draft, baseUrl: event.target.value })} placeholder="https://app.local" /></Field>
              <Field label="Variaveis"><Textarea className="min-h-36 font-mono text-xs" value={props.draft.variables} onChange={(event) => props.onDraftChange({ ...props.draft, variables: event.target.value })} placeholder="TOKEN=abc" /></Field>
            </div>
          ) : null}

          {props.step === 2 ? (
            <div className="grid gap-3">
              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px]">
                <Field label="Nome da suite"><Input value={props.draft.suiteName} onChange={(event) => props.onDraftChange({ ...props.draft, suiteName: event.target.value })} /></Field>
                <Field label="Tipo">
                  <Select value={props.draft.suiteType} onValueChange={(value) => props.onDraftChange({ ...props.draft, suiteType: value as Suite['type'] })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="api">API</SelectItem>
                      <SelectItem value="web">Frontend</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              <Field label="YAML"><YamlEditor value={props.draft.specContent} onChange={(value) => props.onDraftChange({ ...props.draft, specContent: value })} /></Field>
            </div>
          ) : null}

          {props.step === 3 ? (
            <div className="grid gap-3 md:grid-cols-3">
              <RunFact label="Projeto" value={props.draft.projectName || '-'} />
              <RunFact label="Ambiente" value={props.draft.environmentName || '-'} />
              <RunFact label="Suite" value={`${props.draft.suiteName || '-'} · ${suiteTypeLabel(props.draft.suiteType)}`} />
            </div>
          ) : null}

          <div className="flex flex-wrap justify-between gap-2 border-t pt-4">
            <Button variant="outline" onClick={() => props.onOpenChange(false)}>Fechar</Button>
            <div className="flex gap-2">
              <Button variant="outline" disabled={props.step === 0} onClick={() => props.onStepChange(Math.max(0, props.step - 1))}>Voltar</Button>
              {props.step < 3 ? (
                <Button disabled={!canNext} onClick={() => props.onStepChange(Math.min(3, props.step + 1))}>Continuar</Button>
              ) : (
                <Button disabled={props.busy || !canNext} onClick={props.onFinish}>{props.busy ? <Loader2 data-icon="inline-start" className="animate-spin" /> : null}Criar workspace</Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1">
      <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#66705f]">{label}</span>
      {children}
    </label>
  );
}

function Status({ status }: { status: RunStatus }) {
  const passed = status === 'passed';
  const failed = status === 'failed' || status === 'error';
  const active = status === 'queued' || status === 'running';
  const variant = passed ? 'success' : failed ? 'destructive' : active ? 'warning' : 'muted';
  return (
    <Badge variant={variant} className="h-7 gap-2 font-mono uppercase">
      {passed ? <CheckCircle2 data-icon="inline-start" /> : failed ? <XCircle data-icon="inline-start" /> : active ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <Square data-icon="inline-start" />}
      {status}
    </Badge>
  );
}

function Score({ label, value, tone }: { label: string; value: number; tone: 'good' | 'bad' | 'warn' }) {
  return (
    <div className="border-r border-[#e1ddd1] p-2.5 last:border-r-0">
      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#66705f]">{label}</p>
      <p className={cn('mt-1 text-lg font-extrabold', tone === 'good' && 'text-[#1f7a50]', tone === 'bad' && 'text-[#b43c2e]', tone === 'warn' && 'text-[#8a6417]')}>{value}</p>
    </div>
  );
}

function Signal({ tone, text }: { tone: 'good' | 'bad'; text: string }) {
  return <div className={cn('rounded-lg border px-3 py-2 font-mono text-xs', tone === 'good' ? 'border-[#1d4f3a]/50 bg-[#e9f4d0] text-[#1d4f3a]' : 'border-[#b42318]/50 bg-[#fff0ed] text-[#9f1f16]')}>{text}</div>;
}

function ArtifactLink({ label, path, type, compact }: { label: string; path: string; type: string; compact?: boolean }) {
  return (
    <a className={cn('flex items-center justify-between gap-3 rounded-lg border border-[#e1ddd1] bg-white text-sm transition hover:border-[#9fb25a] hover:bg-[#f5f4ee]', compact ? 'p-2' : 'p-3')} href={artifactUrl(path)} target="_blank">
      <span className="min-w-0 truncate font-semibold">{label}</span>
      <Badge variant="outline">{type}</Badge>
    </a>
  );
}

function RailIcon({ icon: Icon, active, label, onClick }: { icon: LucideIcon; active?: boolean; label: string; onClick: () => void }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          onClick={onClick}
          className={cn('grid h-10 w-10 cursor-pointer place-items-center rounded-lg transition hover:bg-white/10 hover:text-[#d7e35f]', active ? 'bg-white/10 text-[#d7e35f]' : 'text-[#9da596] ring-1 ring-white/10')}
        >
          <Icon className="h-5 w-5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={10}>{label}</TooltipContent>
    </Tooltip>
  );
}

function RailLink({ icon: Icon, active, label, href }: { icon: LucideIcon; active?: boolean; label: string; href: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          aria-label={label}
          href={href}
          className={cn('grid h-10 w-10 cursor-pointer place-items-center rounded-lg transition hover:bg-white/10 hover:text-[#d7e35f]', active ? 'bg-white/10 text-[#d7e35f]' : 'text-[#9da596] ring-1 ring-white/10')}
        >
          <Icon className="h-5 w-5" />
        </Link>
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={10}>{label}</TooltipContent>
    </Tooltip>
  );
}

function DarkEmpty({ text }: { text: string }) {
  return <div className="rounded-lg border border-dashed border-[#cfc9ba] bg-white p-6 text-center text-sm text-[#66705f]">{text}</div>;
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
  return dedupeArtifacts([
    ...(report?.artifacts ?? []),
    ...((report?.results ?? []).flatMap((result) => result.artifacts ?? [])),
  ]);
}

function dedupeArtifacts(artifacts: Artifact[]): Artifact[] {
  const seen = new Set<string>();
  return artifacts.filter((artifact) => {
    const key = `${artifact.type}:${artifact.path}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function groupHttpArtifacts(artifacts: Artifact[]): Array<{ request?: Artifact; response?: Artifact }> {
  const groups: Array<{ request?: Artifact; response?: Artifact }> = [];
  for (const artifact of artifacts) {
    if (artifact.type === 'request') {
      groups.push({ request: artifact });
      continue;
    }
    if (artifact.type === 'response') {
      let openGroup: { request?: Artifact; response?: Artifact } | undefined;
      for (let index = groups.length - 1; index >= 0; index -= 1) {
        if (groups[index].request && !groups[index].response) {
          openGroup = groups[index];
          break;
        }
      }
      if (openGroup) {
        openGroup.response = artifact;
      } else {
        groups.push({ response: artifact });
      }
    }
  }
  return groups;
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

function suiteTypeLabel(type: Suite['type']): string {
  return type === 'web' ? 'Frontend' : 'API';
}

function artifactUrl(path: string): string {
  return `${apiBase}/artifacts?path=${encodeURIComponent(path)}`;
}

function parseVars(input: string): Record<string, string> {
  return Object.fromEntries(input.split('\n').filter(Boolean).map((line) => {
    const index = line.indexOf('=');
    if (index === -1) return [line.trim(), ''];
    return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
  }));
}

function splitList(input: string): string[] {
  return input.split(/[\n,]/).map((item) => item.trim()).filter(Boolean);
}

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
