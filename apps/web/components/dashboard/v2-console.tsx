'use client';

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import type React from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { BookOpen, Bot, CheckCircle2, ChevronDown, ClipboardCheck, Copy, Database, FileCode2, Film, FolderKanban, GitBranch, Loader2, LogOut, Play, Settings2, ShieldAlert, Square, TerminalSquare, Trash2, Upload, WandSparkles, XCircle, type LucideIcon } from 'lucide-react';
import YAML from 'yaml';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { api, apiBase, authHeaders } from '@/lib/api';
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
type Role = 'admin' | 'editor' | 'viewer';
type Organization = { id: string; name: string; slug?: string; status?: string; createdAt?: string; updatedAt?: string };
type AuthMe = { user: { id?: string; email: string; name?: string; status?: string }; organization: { id: string; name: string; slug?: string; status?: string }; membership: { id?: string; role: Role }; organizations: Organization[] };
type OrganizationMember = {
  user: { id: string; email: string; name?: string };
  membership: { id: string; role: Role };
};
type UserManagementItem = {
  user: { id: string; email: string; name?: string; status: string; createdAt: string; updatedAt: string };
  memberships: Array<{ id: string; userId: string; organizationId: string; role: Role; createdAt: string; updatedAt: string }>;
  organizations: Organization[];
};
type PersonalAccessToken = {
  id: string;
  userId: string;
  name: string;
  token: string;
  tokenPreview: string;
  tokenMasked: string;
  organizationIds?: string[];
  defaultOrganizationId: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  lastUsedAt?: string;
};
type FlowLibraryItem = {
  id: string;
  organizationId: string;
  namespace: string;
  name: string;
  displayName?: string;
  description?: string;
  projectIds?: string[];
  params?: Record<string, string | number | boolean>;
  steps: unknown[];
  status: 'active' | 'inactive';
  createdAt: string;
  updatedAt: string;
};
type FlowDraft = { id: string; namespace: string; name: string; displayName: string; description: string; projectIds: string[]; params: string; steps: string };
type AuditEntry = { id: string; action: string; actor: string; status: 'ok' | 'blocked' | 'error'; target?: string; createdAt: string; detail?: Record<string, unknown> };
type RunStatus = 'queued' | 'running' | 'passed' | 'failed' | 'error' | 'canceled' | 'deleted';
type RunProgress = {
  phase: 'queued' | 'starting' | 'running' | 'test' | 'step' | 'artifacts' | 'finished' | 'failed' | 'skipped' | 'error';
  totalTests: number;
  completedTests: number;
  currentTest?: string;
  currentStep?: string;
  passed: number;
  failed: number;
  error: number;
  updatedAt: string;
};
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
  progress?: RunProgress | null;
  heartbeatAt?: string | null;
};
type Artifact = { type: string; path: string; label?: string };
type RunReport = {
  artifacts?: Artifact[];
  results?: Array<{
    name: string;
    status: RunStatus;
    startedAt?: string;
    durationMs?: number;
    error?: string;
    artifacts?: Artifact[];
    steps?: Array<{ index?: number; name: string; status: RunStatus; error?: string; startedAt?: string; durationMs?: number; artifacts?: Artifact[] }>;
  }>;
};
type EvidenceTab = 'overview' | 'timeline' | 'artifacts' | 'payload';
type MenuSheet = 'evidence' | null;
type V2View = 'run' | 'projects' | 'suites' | 'flows' | 'settings' | 'docs';
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
type MembershipEdit = Record<string, Record<string, Role | ''>>;

const controlClass = 'h-10 border-[#d7d2c4] bg-white text-[#1f241f] shadow-none placeholder:text-[#8a877c] focus-visible:ring-[#426b4d]';
const darkSelectClass = `min-w-52 ${controlClass}`;
const roles: Role[] = ['admin', 'editor', 'viewer'];
const MonacoEditor = dynamic(() => import('@monaco-editor/react'), { ssr: false });
const defaultFlowDraft: FlowDraft = {
  id: '',
  namespace: 'auth',
  name: 'login',
  displayName: 'Login padrão',
  description: 'Login padrão reutilizável',
  projectIds: [],
  params: 'email: ${USER_EMAIL}\npassword: ${USER_PASSWORD}',
  steps: [
    '- goto: /login',
    '- fill:',
    '    by: label',
    '    target: Email',
    '    value: ${email}',
    '- fill:',
    '    by: label',
    '    target: Senha',
    '    value: ${password}',
    '- click:',
    '    by: role',
    '    role: button',
    '    name: Entrar',
  ].join('\n'),
};
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
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [managedUsers, setManagedUsers] = useState<UserManagementItem[]>([]);
  const [personalTokens, setPersonalTokens] = useState<PersonalAccessToken[]>([]);
  const [flowLibrary, setFlowLibrary] = useState<FlowLibraryItem[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [projectId, setProjectId] = useState('');
  const [environmentId, setEnvironmentId] = useState('');
  const [suiteId, setSuiteId] = useState('');
  const [selectedRunId, setSelectedRunId] = useState('');
  const [suiteSearch, setSuiteSearch] = useState('');
  const [suiteTypeFilter, setSuiteTypeFilter] = useState<'all' | Suite['type']>('all');
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
  const [memberDraft, setMemberDraft] = useState({ email: '', name: '', role: 'viewer' as OrganizationMember['membership']['role'], temporaryPassword: '' });
  const [profileDraft, setProfileDraft] = useState({ name: '', email: '', currentPassword: '', newPassword: '' });
  const [orgDraft, setOrgDraft] = useState({ name: '' });
  const [membershipEdit, setMembershipEdit] = useState<MembershipEdit>({});
  const [tokenDraft, setTokenDraft] = useState({ name: 'mcp-local', scope: 'all' as 'all' | 'selected', organizationIds: [] as string[] });
  const [flowDraft, setFlowDraft] = useState<FlowDraft>(defaultFlowDraft);
  const [aiOutput, setAiOutput] = useState('');
  const [cleanupDays, setCleanupDays] = useState('30');
  const [cleanupResult, setCleanupResult] = useState('');
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [approvedAiPatch, setApprovedAiPatch] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [suitePreviewOpen, setSuitePreviewOpen] = useState(false);
  const [suitePreview, setSuitePreview] = useState<SuiteWithContent | null>(null);
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
      const [nextMe, nextMembers, nextTokens, nextFlows, nextProjects, nextEnvs, nextSuites, nextRuns, nextConnections, nextSecurity, nextAudit] = await Promise.all([
        api<AuthMe>('/api/auth/me', { redirectOnUnauthorized: false }).catch(() => null),
        api<OrganizationMember[]>('/api/organizations/current/members', { redirectOnUnauthorized: false }).catch(() => []),
        api<PersonalAccessToken[]>('/api/users/me/tokens', { redirectOnUnauthorized: false }).catch(() => []),
        api<FlowLibraryItem[]>('/api/flows', { redirectOnUnauthorized: false }).catch(() => []),
        api<Project[]>('/api/projects'),
        api<Environment[]>('/api/environments'),
        api<Suite[]>('/api/suites'),
        api<Run[]>('/api/runs'),
        api<AiConnection[]>('/api/ai/connections').catch(() => []),
        api<SecurityStatus>('/api/system/security').catch(() => null),
        api<AuditEntry[]>('/api/audit?limit=40').catch(() => []),
      ]);
      setMe(nextMe);
      setMembers(nextMembers);
      setPersonalTokens(nextTokens);
      setFlowLibrary(nextFlows);
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
      if (nextMe?.membership.role === 'admin') {
        const [nextOrganizations, nextManagedUsers] = await Promise.all([
          api<Organization[]>('/api/organizations', { redirectOnUnauthorized: false }).catch(() => []),
          api<UserManagementItem[]>('/api/users', { redirectOnUnauthorized: false }).catch(() => []),
        ]);
        setOrganizations(nextOrganizations);
        setManagedUsers(nextManagedUsers);
        setMembershipEdit((current) => mergeMembershipEdit(current, nextManagedUsers, nextOrganizations));
      } else {
        setOrganizations(nextMe?.organizations ?? []);
        setManagedUsers([]);
        setMembershipEdit({});
      }
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
    setProfileDraft((current) => ({
      name: current.name === '' || current.name === me?.user.name ? (me?.user.name ?? '') : current.name,
      email: current.email === '' || current.email === me?.user.email ? (me?.user.email ?? '') : current.email,
      currentPassword: current.currentPassword,
      newPassword: current.newPassword,
    }));
  }, [me?.user.email, me?.user.name]);

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
      if (success) setNotice((current) => current || success);
    } catch (nextError) {
      setError(messageOf(nextError));
    } finally {
      setBusy(false);
    }
  }

  async function runSuite() {
    if (!projectId || !environmentId || !suiteId) {
      setError('Projeto, ambiente e suite obrigatórios.');
      return;
    }
    await runSuiteFor({ projectId, environmentId, suiteId });
  }

  async function runSuiteFor(input: { projectId: string; environmentId: string; suiteId: string }) {
    await mutate(async () => {
      const run = await api<Run>('/api/runs', {
        method: 'POST',
        body: JSON.stringify(input),
      });
      setSuiteId(run.suiteId);
      setEnvironmentId(run.environmentId);
      setSelectedRunId(run.id);
      setTab('overview');
    }, 'Execução enviada.');
  }

  function selectSuite(suite: Suite, nextEnvironmentId = environmentId) {
    setSuiteId(suite.id);
    if (nextEnvironmentId) setEnvironmentId(nextEnvironmentId);
    const run = latestRun(projectRuns, { suiteId: suite.id, environmentId: nextEnvironmentId || undefined });
    setSelectedRunId(run?.id ?? '');
    setTab('overview');
  }

  async function cancelRun(run: Run) {
    await mutate(() => api(`/api/runs/${run.id}/cancel`, { method: 'POST', body: '{}' }), 'Execução cancelada.');
  }

  async function deleteRun(run: Run) {
    if (!window.confirm(`Excluir run ${shortId(run.id)}? Esta ação oculta a execução desta seleção.`)) return;
    await mutate(async () => {
      await api(`/api/runs/${run.id}`, { method: 'DELETE' });
      setSelectedRunId((current) => current === run.id ? '' : current);
    }, 'Run excluída.');
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

  async function openSuitePreview() {
    if (!selectedSuite) {
      setError('Selecione uma suite para visualizar.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const loaded = await api<SuiteWithContent>(`/api/suites/${selectedSuite.id}`);
      setSuitePreview(loaded);
      setSuitePreviewOpen(true);
    } catch (nextError) {
      setError(messageOf(nextError));
    } finally {
      setBusy(false);
    }
  }

  function newSuiteDraft() {
    setSuiteDraft({ id: '', name: '', type: 'api', specContent: defaultSpec });
    setValidation(null);
  }

  async function validateSpec(showNotice = true): Promise<boolean> {
    if (!suiteDraft.specContent.trim()) {
      setValidation({ valid: false, error: 'YAML obrigatório.' });
      return false;
    }
    try {
      const result = await api<ValidationResult>('/api/spec/validate', { method: 'POST', body: JSON.stringify({ specContent: suiteDraft.specContent, projectId: projectId || undefined }) });
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

  async function createMember() {
    await mutate(async () => {
      const response = await api<{ temporaryPassword?: string }>('/api/organizations/current/members', {
        method: 'POST',
        body: JSON.stringify({
          email: memberDraft.email,
          name: memberDraft.name || undefined,
          role: memberDraft.role,
          temporaryPassword: memberDraft.temporaryPassword || undefined,
        }),
      });
      if (response.temporaryPassword) setNotice(`Usuário criado. Senha temporária: ${response.temporaryPassword}`);
      setMemberDraft({ email: '', name: '', role: 'viewer', temporaryPassword: '' });
    }, 'Membro criado.');
  }

  async function saveProfile() {
    await mutate(async () => {
      const result = await api<{ user: AuthMe['user'] }>('/api/users/me', {
        method: 'PUT',
        body: JSON.stringify({
          name: profileDraft.name.trim() || undefined,
          email: profileDraft.email.trim() || undefined,
          currentPassword: profileDraft.currentPassword || undefined,
          newPassword: profileDraft.newPassword || undefined,
        }),
      });
      setMe((current) => current ? { ...current, user: { ...current.user, ...result.user } } : current);
      setProfileDraft((current) => ({ ...current, currentPassword: '', newPassword: '' }));
    }, 'Perfil atualizado.');
  }

  async function createOrganization() {
    const name = orgDraft.name.trim();
    if (!name) return;
    await mutate(async () => {
      await api<Organization>('/api/organizations', { method: 'POST', body: JSON.stringify({ name }) });
      setOrgDraft({ name: '' });
    }, 'Organização criada.');
  }

  async function switchOrganization(organizationId: string) {
    await mutate(async () => {
      const result = await api<{ user: AuthMe['user']; organization: AuthMe['organization']; membership: AuthMe['membership']; organizations: Organization[]; token?: string }>('/api/auth/switch-organization', {
        method: 'POST',
        body: JSON.stringify({ organizationId }),
      });
      if (result.token) window.localStorage.setItem('testhub.token', result.token);
      setMe({ user: result.user, organization: result.organization, membership: result.membership, organizations: result.organizations });
    }, 'Organização alterada.');
  }

  function setEditedMembership(userId: string, organizationId: string, roleValue: Role | '') {
    setMembershipEdit((current) => ({
      ...current,
      [userId]: {
        ...(current[userId] ?? {}),
        [organizationId]: roleValue,
      },
    }));
  }

  async function saveUserMemberships(userId: string) {
    const userMemberships = membershipEdit[userId] ?? {};
    await mutate(() => api(`/api/users/${userId}/memberships`, {
      method: 'PATCH',
      body: JSON.stringify({
        memberships: Object.entries(userMemberships)
          .filter((entry): entry is [string, Role] => Boolean(entry[1]))
          .map(([organizationId, membershipRole]) => ({ organizationId, role: membershipRole })),
      }),
    }), 'Memberships atualizadas.');
  }

  async function createPersonalToken() {
    const name = tokenDraft.name.trim();
    if (!name) return;
    await mutate(async () => {
      const token = await api<PersonalAccessToken>('/api/users/me/tokens', {
        method: 'POST',
        body: JSON.stringify({
          name,
          organizationIds: tokenDraft.scope === 'selected' ? tokenDraft.organizationIds : undefined,
          defaultOrganizationId: tokenDraft.scope === 'selected' ? tokenDraft.organizationIds[0] : me?.organization.id,
        }),
      });
      setPersonalTokens((current) => [token, ...current.filter((item) => item.id !== token.id)]);
      setTokenDraft({ name: 'mcp-local', scope: 'all', organizationIds: [] });
    }, 'Token criado.');
  }

  async function revokePersonalToken(tokenId: string) {
    await mutate(async () => {
      await api(`/api/users/me/tokens/${tokenId}`, { method: 'DELETE' });
      setPersonalTokens((current) => current.filter((token) => token.id !== tokenId));
    }, 'Token revogado.');
  }

  function editFlow(flow: FlowLibraryItem) {
    setFlowDraft({
      id: flow.id,
      namespace: flow.namespace,
      name: flow.name,
      displayName: flow.displayName ?? flow.name,
      description: flow.description ?? '',
      projectIds: flow.projectIds ?? [],
      params: flow.params ? YAML.stringify(flow.params).trim() : '',
      steps: YAML.stringify(flow.steps).trim(),
    });
  }

  async function saveFlow() {
    const namespace = flowDraft.namespace.trim();
    const name = flowDraft.name.trim();
    const displayName = flowDraft.displayName.trim();
    if (!namespace || !name || !displayName) return;
    await mutate(async () => {
      const params = flowDraft.params.trim() ? YAML.parse(flowDraft.params) : undefined;
      const steps = YAML.parse(flowDraft.steps);
      if (!Array.isArray(steps)) throw new Error('Passos deve ser uma lista YAML.');
      const payload = {
        namespace,
        name,
        displayName,
        description: flowDraft.description.trim() || undefined,
        projectIds: flowDraft.projectIds.length > 0 ? flowDraft.projectIds : undefined,
        params,
        steps,
      };
      await api(flowDraft.id ? `/api/flows/${flowDraft.id}` : '/api/flows', {
        method: flowDraft.id ? 'PUT' : 'POST',
        body: JSON.stringify(payload),
      });
      setFlowDraft(defaultFlowDraft);
    }, flowDraft.id ? 'Flow atualizado.' : 'Flow criado.');
  }

  async function archiveFlow(flowId: string) {
    await mutate(async () => {
      await api(`/api/flows/${flowId}`, { method: 'DELETE' });
      setFlowLibrary((current) => current.filter((flow) => flow.id !== flowId));
      setFlowDraft((current) => current.id === flowId ? defaultFlowDraft : current);
    }, 'Flow arquivado.');
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
      : view === 'flows'
        ? 'Flows'
      : view === 'settings'
        ? 'Sistema'
        : view === 'docs'
          ? 'Documentação'
          : 'Execuções';

  return (
    <main className="min-h-screen bg-[#f4f2eb] text-[#1f241f]">
      <div className="grid min-h-screen xl:grid-cols-[72px_minmax(0,1fr)]">
        <aside className="hidden border-r border-[#d8d3c5] bg-[#111611] xl:block">
          <div className="flex h-screen flex-col items-center justify-between py-5">
            <div className="grid gap-4">
              <div className="grid h-11 w-11 place-items-center rounded-lg bg-[#d7e35f] text-[#111611]">
                <TerminalSquare className="h-6 w-6" />
              </div>
              <RailLink icon={Play} active={view === 'run'} label="Execuções" href="/v2" />
              <RailLink icon={FolderKanban} active={view === 'projects'} label="Projetos" href={projectId ? `/projects?project=${projectId}` : '/projects'} />
              <RailLink icon={FileCode2} active={view === 'suites'} label="Suites" href={projectId ? `/suites?project=${projectId}` : '/suites'} />
              <RailLink icon={GitBranch} active={view === 'flows'} label="Flows" href="/flows" />
              <RailLink icon={BookOpen} active={view === 'docs'} label="Docs" href="/docs" />
              <RailLink icon={Settings2} active={view === 'settings'} label="Sistema" href="/settings" />
            </div>
            <UserSidebarMenu me={me} role={role} busy={busy} onLogout={logout} />
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
                <span>TESTHUB_SECRET_KEY default. Troque antes de produção; gravação de secrets fica bloqueada em produção.</span>
              </div>
            ) : null}
          </header>

          <div className="grid min-h-0 content-start gap-4 p-4 md:p-5">
            {view === 'run' ? (
              <RunWorkspace
                selectedSuite={selectedSuite}
                selectedEnv={selectedEnv}
                suites={projectSuites}
                envs={projectEnvs}
                selectedRun={selectedRun}
                stats={stats}
                runs={scopedRuns}
                latestRuns={projectRuns}
                selectedRunId={selectedRun?.id}
                projectId={projectId}
                projectName={selectedProject?.name}
                suiteSearch={suiteSearch}
                suiteTypeFilter={suiteTypeFilter}
                busy={busy}
                canRun={Boolean(projectId && environmentId && suiteId && canWrite)}
                canManageRuns={canWrite}
                report={report}
                onSuiteSearchChange={setSuiteSearch}
                onSuiteTypeFilterChange={setSuiteTypeFilter}
                onRun={runSuite}
                onRunSuite={(suite, env) => runSuiteFor({ projectId, suiteId: suite.id, environmentId: env?.id ?? environmentId })}
                onSelectSuite={selectSuite}
                onSelectRun={(run) => {
                  setSuiteId(run.suiteId);
                  setEnvironmentId(run.environmentId);
                  setSelectedRunId(run.id);
                  setTab('overview');
                }}
                onDeleteRun={deleteRun}
                onCancelRun={cancelRun}
                onOpenSuites={openSuitePreview}
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
            ) : view === 'settings' ? (
              <SettingsWorkspace
                me={me}
                members={members}
                organizations={organizations}
                managedUsers={managedUsers}
                memberDraft={memberDraft}
                profileDraft={profileDraft}
                orgDraft={orgDraft}
                membershipEdit={membershipEdit}
                personalTokens={personalTokens}
                tokenDraft={tokenDraft}
                aiConnections={aiConnections}
                aiDraft={aiDraft}
                security={security}
                audit={audit}
                cleanupDays={cleanupDays}
                cleanupResult={cleanupResult}
                busy={busy}
                canWrite={canWrite}
                canAdmin={canAdmin}
                onMemberDraftChange={setMemberDraft}
                onCreateMember={createMember}
                onProfileDraftChange={setProfileDraft}
                onSaveProfile={saveProfile}
                onOrgDraftChange={setOrgDraft}
                onCreateOrganization={createOrganization}
                onSwitchOrganization={switchOrganization}
                onMembershipEditChange={setEditedMembership}
                onSaveUserMemberships={saveUserMemberships}
                onTokenDraftChange={setTokenDraft}
                onCreatePersonalToken={createPersonalToken}
                onRevokePersonalToken={revokePersonalToken}
                onAiDraftChange={setAiDraft}
                onEditAiConnection={editAiConnection}
                onSaveAiConnection={saveAiConnection}
                onCleanupDaysChange={setCleanupDays}
                onCleanup={cleanupRuns}
              />
            ) : view === 'flows' ? (
              <FlowLibraryWorkspace
                flowLibrary={flowLibrary}
                flowDraft={flowDraft}
                projects={projects}
                currentProjectId={projectId}
                busy={busy}
                canWrite={canWrite}
                onFlowDraftChange={setFlowDraft}
                onNewFlow={() => setFlowDraft(defaultFlowDraft)}
                onEditFlow={editFlow}
                onSaveFlow={saveFlow}
                onArchiveFlow={archiveFlow}
              />
            ) : (
              <DocumentationWorkspace />
            )}
          </div>
          <Sheet open={openSheet === 'evidence'} onOpenChange={(open) => setOpenSheet(open ? 'evidence' : null)}>
            <SheetContent className="w-full overflow-hidden p-0 sm:max-w-2xl md:max-w-3xl lg:max-w-5xl">
              <SheetHeader className="border-b px-5 py-4 pr-12">
                <SheetTitle className="text-lg">Evidências</SheetTitle>
                <SheetDescription>{selectedRun ? `${shortId(selectedRun.id)} · ${runSummary(selectedRun)}` : 'Selecione uma execução para ver evidências.'}</SheetDescription>
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
                onSuggestFix={(run) => runAi('suggest-test-fix', run, 'Sugestão de correção gerada.')}
                onSuggestCases={(run) => runAi('suggest-test-cases', run, 'Sugestão de casos gerada.')}
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
          <SuitePreviewDialog
            open={suitePreviewOpen}
            suite={suitePreview}
            projectId={projectId}
            onOpenChange={setSuitePreviewOpen}
          />
        </section>
      </div>
    </main>
  );
}

function RunWorkspace(props: {
  projectId: string;
  projectName?: string;
  selectedSuite?: Suite;
  selectedEnv?: Environment;
  suites: Suite[];
  envs: Environment[];
  selectedRun?: Run;
  stats: ReturnType<typeof summarize>;
  runs: Run[];
  latestRuns: Run[];
  selectedRunId?: string;
  suiteSearch: string;
  suiteTypeFilter: 'all' | Suite['type'];
  busy: boolean;
  canRun: boolean;
  canManageRuns: boolean;
  report: RunReport | null;
  onSuiteSearchChange: (value: string) => void;
  onSuiteTypeFilterChange: (value: 'all' | Suite['type']) => void;
  onRun: () => Promise<void>;
  onRunSuite: (suite: Suite, env?: Environment) => Promise<void>;
  onSelectSuite: (suite: Suite, environmentId?: string) => void;
  onSelectRun: (run: Run) => void;
  onDeleteRun: (run: Run) => Promise<void>;
  onCancelRun: (run: Run) => Promise<void>;
  onOpenSuites: () => void;
  onOpenEnvironments: () => void;
  onOpenEvidence: () => void;
}) {
  const filteredSuites = props.suites.filter((suite) => {
    const matchesType = props.suiteTypeFilter === 'all' || suite.type === props.suiteTypeFilter;
    const query = props.suiteSearch.trim().toLowerCase();
    const matchesSearch = !query || suite.name.toLowerCase().includes(query);
    return matchesType && matchesSearch;
  });
  const projectStats = summarize(props.latestRuns);
  const selectedSuiteRuns = props.selectedSuite ? props.latestRuns.filter((run) => run.suiteId === props.selectedSuite!.id) : [];
  const selectedEnvRuns = props.selectedSuite ? selectedSuiteRuns.filter((run) => run.environmentId === props.selectedEnv?.id) : [];
  const failureRuns = props.latestRuns.filter((run) => run.status === 'failed' || run.status === 'error').slice(0, 8);
  return (
    <div className="grid min-h-0 content-start gap-4">
      <section className="rounded-xl border border-[#d8d3c5] bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-[#66705f]">Execuções</p>
            <h1 className="mt-1 truncate text-2xl font-black tracking-normal">{props.projectName ?? 'Projeto'}</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <MetricPill label="Ok" value={projectStats.passed} tone="good" />
            <MetricPill label="Falhas" value={projectStats.failed + projectStats.error} tone="bad" />
            <MetricPill label="Rodando" value={projectStats.active} tone="warn" />
          </div>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[390px_minmax(0,1fr)]">
        <SuiteBoard
          suites={filteredSuites}
          allSuites={props.suites}
          env={props.selectedEnv}
          runs={props.latestRuns}
          selectedSuiteId={props.selectedSuite?.id}
          search={props.suiteSearch}
          typeFilter={props.suiteTypeFilter}
          busy={props.busy}
          canRun={Boolean(props.projectId && props.selectedEnv && props.canManageRuns)}
          onSearchChange={props.onSuiteSearchChange}
          onTypeFilterChange={props.onSuiteTypeFilterChange}
          onSelectSuite={props.onSelectSuite}
          onRunSuite={props.onRunSuite}
        />

        <SuiteDetailPanel
          suite={props.selectedSuite}
          env={props.selectedEnv}
          suites={props.suites}
          envs={props.envs}
          runs={selectedEnvRuns}
          projectRuns={props.latestRuns}
          failureRuns={failureRuns}
          allSuiteRuns={selectedSuiteRuns}
          selectedRun={props.selectedRun}
          selectedRunId={props.selectedRunId}
          report={props.report}
          busy={props.busy}
          canRun={props.canRun}
          canManageRuns={props.canManageRuns}
          onRun={props.onRun}
          onSelectRun={props.onSelectRun}
          onDeleteRun={props.onDeleteRun}
          onCancelRun={props.onCancelRun}
          onOpenSuites={props.onOpenSuites}
          onOpenEnvironments={props.onOpenEnvironments}
          onOpenEvidence={props.onOpenEvidence}
          onSelectMatrixCell={(suite, env, run) => {
            props.onSelectSuite(suite, env.id);
            if (run) props.onSelectRun(run);
          }}
        />
      </div>
    </div>
  );
}

function SuiteBoard(props: {
  suites: Suite[];
  allSuites: Suite[];
  env?: Environment;
  runs: Run[];
  selectedSuiteId?: string;
  search: string;
  typeFilter: 'all' | Suite['type'];
  busy: boolean;
  canRun: boolean;
  onSearchChange: (value: string) => void;
  onTypeFilterChange: (value: 'all' | Suite['type']) => void;
  onSelectSuite: (suite: Suite) => void;
  onRunSuite: (suite: Suite, env?: Environment) => Promise<void>;
}) {
  return (
    <Card className="overflow-hidden xl:sticky xl:top-4 xl:max-h-[calc(100vh-9rem)]">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Suites do projeto</CardTitle>
            <CardDescription>{props.allSuites.length} suites · {props.env?.name ?? 'sem ambiente'}</CardDescription>
          </div>
          <Badge variant="outline">{props.suites.length} visíveis</Badge>
        </div>
        <div className="grid gap-2 pt-2 sm:grid-cols-[minmax(0,1fr)_160px]">
          <Input value={props.search} onChange={(event) => props.onSearchChange(event.target.value)} placeholder="Buscar suite" className={controlClass} />
          <Select value={props.typeFilter} onValueChange={(value) => props.onTypeFilterChange(value as 'all' | Suite['type'])}>
            <SelectTrigger className={controlClass}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              <SelectItem value="api">API</SelectItem>
              <SelectItem value="web">Frontend</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="max-h-[calc(100vh-17rem)] overflow-auto pr-3">
        <div className="grid gap-2">
          {props.suites.map((suite) => (
            <SuiteCard
              key={suite.id}
              suite={suite}
              latestRun={latestRun(props.runs, { suiteId: suite.id, environmentId: props.env?.id })}
              selected={suite.id === props.selectedSuiteId}
              busy={props.busy}
              canRun={props.canRun}
              onSelect={() => props.onSelectSuite(suite)}
              onRun={() => props.onRunSuite(suite, props.env)}
            />
          ))}
          {props.suites.length === 0 ? <DarkEmpty text="Nenhuma suite encontrada para este filtro." /> : null}
        </div>
      </CardContent>
    </Card>
  );
}

function SuiteCard({ suite, latestRun, selected, busy, canRun, onSelect, onRun }: { suite: Suite; latestRun?: Run; selected: boolean; busy: boolean; canRun: boolean; onSelect: () => void; onRun: () => void }) {
  const owner = inferredOwner(suite);
  const criticality = inferredCriticality(suite);
  return (
    <article className={cn('grid gap-2 rounded-lg border bg-white p-3 transition', selected ? 'border-[#151915] shadow-[inset_4px_0_0_#c7d957]' : 'border-[#e1ddd1] hover:border-[#9fb25a]')}>
      <div className="flex items-start justify-between gap-3">
        <button type="button" className="grid min-w-0 gap-1 text-left" onClick={onSelect}>
          <div className="min-w-0">
            <h2 className="truncate text-base font-extrabold" title={suite.name}>{suite.name}</h2>
            <p className="truncate font-mono text-xs text-[#66705f]">{suiteTypeLabel(suite.type)} · {owner} · {criticality}</p>
          </div>
        </button>
        <StatusDot status={latestRun?.status} />
      </div>
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-xs text-[#66705f]">{latestRun ? runSummary(latestRun) : 'Sem execução recente'}</p>
        <Button size="icon" aria-label={`Executar ${suite.name}`} onClick={onRun} disabled={busy || !canRun} className="h-8 w-8 shrink-0">
          {busy ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <Play data-icon="inline-start" />}
        </Button>
      </div>
    </article>
  );
}

function SuiteDetailPanel(props: {
  suite?: Suite;
  env?: Environment;
  suites: Suite[];
  envs: Environment[];
  runs: Run[];
  projectRuns: Run[];
  failureRuns: Run[];
  allSuiteRuns: Run[];
  selectedRun?: Run;
  selectedRunId?: string;
  report: RunReport | null;
  busy: boolean;
  canRun: boolean;
  canManageRuns: boolean;
  onRun: () => Promise<void>;
  onSelectRun: (run: Run) => void;
  onDeleteRun: (run: Run) => Promise<void>;
  onCancelRun: (run: Run) => Promise<void>;
  onOpenSuites: () => void;
  onOpenEnvironments: () => void;
  onOpenEvidence: () => void;
  onSelectMatrixCell: (suite: Suite, env: Environment, run?: Run) => void;
}) {
  if (!props.suite) {
    return <Card className="min-h-[520px]"><CardContent className="p-6"><DarkEmpty text="Selecione uma suite no painel para abrir detalhes." /></CardContent></Card>;
  }
  const stats = summarize(props.runs);
  const selectedRun = props.selectedRun ?? props.runs[0];
  return (
    <section className="min-w-0">
      <Card className="overflow-hidden">
        <CardHeader className="border-b bg-white">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-[#66705f]">Detalhe da suite</p>
              <CardTitle className="mt-1 truncate text-2xl font-black md:text-3xl" title={props.suite.name}>{props.suite.name}</CardTitle>
              <CardDescription>{suiteTypeLabel(props.suite.type)} · {props.env ? `${props.env.name} · ${props.env.baseUrl}` : 'ambiente ausente'}</CardDescription>
            </div>
            {selectedRun ? <Status status={selectedRun.status} /> : <Badge variant="muted">Sem execução</Badge>}
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#e1ddd1] bg-[#fbfaf6] p-3">
            <div className="flex flex-wrap gap-2">
              <MetricPill label="Ok" value={stats.passed} tone="good" />
              <MetricPill label="Falhas" value={stats.failed + stats.error} tone="bad" />
              <MetricPill label="Runs" value={props.runs.length} tone="neutral" />
            </div>
            <div className="flex flex-wrap gap-1">
              <Badge variant="outline">Dono: {inferredOwner(props.suite)}</Badge>
              <Badge variant={inferredCriticality(props.suite) === 'bloqueante' ? 'destructive' : inferredCriticality(props.suite) === 'alta' ? 'warning' : 'muted'}>{inferredCriticality(props.suite)}</Badge>
            </div>
          </div>
          {selectedRun && ['queued', 'running'].includes(selectedRun.status) ? <LiveProgress run={selectedRun} /> : null}
          <div className="flex flex-wrap gap-2">
            <Button onClick={props.onRun} disabled={props.busy || !props.canRun}>
              {props.busy ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <Play data-icon="inline-start" />}
              Executar suite
            </Button>
            <Button variant="outline" onClick={props.onOpenSuites}><FileCode2 data-icon="inline-start" />Ver YAML</Button>
            <Button variant="outline" onClick={props.onOpenEnvironments}><Database data-icon="inline-start" />Ambientes</Button>
            <Button variant="outline" onClick={props.onOpenEvidence} disabled={!selectedRun}><ClipboardCheck data-icon="inline-start" />Evidências brutas</Button>
            {selectedRun && ['queued', 'running'].includes(selectedRun.status) ? <Button variant="destructive" onClick={() => props.onCancelRun(selectedRun)}><Square data-icon="inline-start" />Cancelar</Button> : null}
          </div>
          <Tabs defaultValue="report" className="grid gap-4">
            <TabsList className="grid h-auto grid-cols-2 lg:grid-cols-5">
              <TabsTrigger value="report">Relatório</TabsTrigger>
              <TabsTrigger value="timeline">Passos</TabsTrigger>
              <TabsTrigger value="history">Histórico</TabsTrigger>
              <TabsTrigger value="health">Saúde</TabsTrigger>
              <TabsTrigger value="failures">Falhas</TabsTrigger>
            </TabsList>
            <TabsContent value="report" className="m-0"><RunReportOverview suite={props.suite} env={props.env} run={selectedRun} report={props.report} /></TabsContent>
            <TabsContent value="timeline" className="m-0"><RunTimelinePanel run={selectedRun} report={props.report} /></TabsContent>
            <TabsContent value="history" className="m-0"><SuiteRunHistory runs={props.runs} suite={props.suite} env={props.env} selectedRunId={props.selectedRunId} canManageRuns={props.canManageRuns} busy={props.busy} onSelectRun={props.onSelectRun} onDeleteRun={props.onDeleteRun} /></TabsContent>
            <TabsContent value="health" className="m-0"><HealthMatrix suites={props.suites} envs={props.envs} runs={props.projectRuns} selectedSuiteId={props.suite.id} selectedEnvId={props.env?.id} onSelectCell={props.onSelectMatrixCell} /></TabsContent>
            <TabsContent value="failures" className="m-0"><FailureInbox runs={props.failureRuns} suites={props.suites} envs={props.envs} onSelectRun={props.onSelectRun} /></TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </section>
  );
}

function RunTimelinePanel({ run, report }: { run?: Run; report: RunReport | null }) {
  const steps = timelineRows(report, run);
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle>Passos da execução</CardTitle>
        <CardDescription>{run ? `${shortId(run.id)} · ${runSummary(run)}` : 'Sem run selecionada.'}</CardDescription>
      </CardHeader>
      <CardContent>
        {steps.length > 0 ? (
          <ol className="grid gap-3">
            {steps.map((step, index) => (
              <li key={`${step.name}-${index}`} className="grid grid-cols-[28px_minmax(0,1fr)] gap-3">
                <span className={cn('mt-1 h-7 w-7 rounded-full border text-center font-mono text-xs leading-7', step.status === 'passed' ? 'border-[#1f7a50] bg-[#e8f5da] text-[#1f7a50]' : step.status === 'failed' || step.status === 'error' ? 'border-[#b43c2e] bg-[#fff0ed] text-[#b43c2e]' : 'border-[#d7d2c4] bg-white text-[#66705f]')}>{index + 1}</span>
                <div className="rounded-lg border border-[#e1ddd1] bg-white p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold">{redactStepText(step.name)}</p>
                    <div className="flex gap-2">
                      <Status status={step.status} />
                      {step.startedAt ? <Badge variant="outline">{formatDate(step.startedAt)}</Badge> : null}
                      {step.durationMs !== undefined ? <Badge variant="outline">{step.durationMs}ms</Badge> : null}
                    </div>
                  </div>
                  {step.error ? <p className="mt-2 text-sm text-[#9f1f16]">{step.error}</p> : null}
                  {step.artifacts.length > 0 ? <div className="mt-2 grid gap-2 md:grid-cols-2">{step.artifacts.slice(0, 4).map((artifact) => <ArtifactLink key={`${artifact.type}-${artifact.path}`} label={artifact.label ?? shortPath(artifact.path)} path={artifact.path} type={artifact.type} compact />)}</div> : null}
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <DarkEmpty text={run ? 'Timeline indisponível enquanto o relatório final não existe.' : 'Selecione uma run para ver o passo a passo.'} />
        )}
      </CardContent>
    </Card>
  );
}

function RunReportOverview({ suite, env, run, report }: { suite: Suite; env?: Environment; run?: Run; report: RunReport | null }) {
  const artifacts = collectArtifacts(report);
  const videos = artifacts.filter((artifact) => artifact.type === 'video');
  const steps = timelineRows(report, run);
  const failingSteps = steps.filter((step) => step.status === 'failed' || step.status === 'error');
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
      <div className="grid gap-4">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle>Relatório da execução</CardTitle>
                <CardDescription>{run ? `${shortId(run.id)} · ${runSummary(run)}` : 'Selecione uma run para gerar relatório.'}</CardDescription>
              </div>
              {run ? <Status status={run.status} /> : <Badge variant="muted">Sem execução</Badge>}
            </div>
          </CardHeader>
          <CardContent className="grid gap-3">
            <div className="grid gap-2 md:grid-cols-4">
              <InfoLine label="Suite" value={suite.name} />
              <InfoLine label="Ambiente" value={env?.name ?? '-'} />
              <InfoLine label="Início" value={formatDate(run?.startedAt ?? run?.createdAt)} />
              <InfoLine label="Duração" value={run?.finishedAt && (run.startedAt || run.createdAt) ? `${Math.max(0, new Date(run.finishedAt).getTime() - new Date(run.startedAt ?? run.createdAt!).getTime())}ms` : '-'} />
            </div>
            {failingSteps.length > 0 ? (
              <div className="rounded-lg border border-[#f0c5bd] bg-[#fff7f4] p-3">
                <p className="text-sm font-bold text-[#9f1f16]">Falhas para investigar</p>
                <div className="mt-2 grid gap-2">
                  {failingSteps.slice(0, 3).map((step, index) => (
                    <p key={`${step.name}-${index}`} className="truncate text-sm text-[#5a201b]">{redactStepText(step.name)}: {step.error ?? statusLabel(step.status)}</p>
                  ))}
                </div>
              </div>
            ) : <div className="rounded-lg border border-[#d9e7b8] bg-[#f4f8df] p-3 text-sm font-semibold text-[#1f7a50]">Sem falhas nesta execução.</div>}
          </CardContent>
        </Card>
        <MarkdownReportBlock suite={suite} env={env} run={run} report={report} />
      </div>
      <Card className="self-start overflow-hidden">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2"><Film data-icon="inline-start" />Vídeos</CardTitle>
          <CardDescription>{videos.length ? `${videos.length} evidência(s) em vídeo` : 'Sem vídeo para esta run.'}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {videos[0] ? (
            <div className="overflow-hidden rounded-lg bg-black shadow-[0_18px_40px_rgba(0,0,0,0.2)]">
              <video className="aspect-video w-full bg-black" src={artifactUrl(videos[0].path)} controls preload="metadata" />
            </div>
          ) : <DarkEmpty text="Vídeo indisponível para esta execução." />}
          {videos.slice(1, 5).map((artifact) => <ArtifactLink key={artifact.path} label={artifact.label ?? 'Video'} path={artifact.path} type={artifact.type} compact />)}
        </CardContent>
      </Card>
    </div>
  );
}

function MarkdownReportBlock({ suite, env, run, report }: { suite: Suite; env?: Environment; run?: Run; report: RunReport | null }) {
  const [copied, setCopied] = useState(false);
  const markdown = buildRunMarkdown({ suite, env, run, report });
  async function copyMarkdown() {
    await navigator.clipboard.writeText(markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Relatório markdown</CardTitle>
            <CardDescription>Resumo auditável da execução selecionada.</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={copyMarkdown} disabled={!run}><Copy data-icon="inline-start" />{copied ? 'Copiado' : 'Copiar MD'}</Button>
        </div>
      </CardHeader>
      <CardContent>
        <Textarea value={markdown} readOnly className="min-h-52 font-mono text-xs" />
      </CardContent>
    </Card>
  );
}

function SuiteRunHistory(props: { runs: Run[]; suite: Suite; env?: Environment; selectedRunId?: string; canManageRuns: boolean; busy: boolean; onSelectRun: (run: Run) => void; onDeleteRun: (run: Run) => Promise<void> }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle>Histórico da suite</CardTitle>
        <CardDescription>{props.env ? `Runs de ${props.suite.name} em ${props.env.name}` : 'Selecione ambiente para filtrar.'}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-2 md:grid-cols-2">
          {props.runs.slice(0, 8).map((run) => (
            <RunHistoryCard key={run.id} run={run} suite={props.suite} env={props.env} selected={props.selectedRunId === run.id} busy={props.busy} canDelete={props.canManageRuns} onClick={() => props.onSelectRun(run)} onDelete={() => props.onDeleteRun(run)} />
          ))}
          {props.runs.length === 0 ? <DarkEmpty text="Nenhuma run para esta suite neste ambiente." /> : null}
        </div>
      </CardContent>
    </Card>
  );
}

function AllEnvironmentRuns({ runs, selectedRunId, onSelectRun }: { runs: Run[]; selectedRunId?: string; onSelectRun: (run: Run) => void }) {
  const otherRuns = runs.filter((run) => run.id !== selectedRunId).slice(0, 6);
  if (otherRuns.length === 0) return null;
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle>Outros ambientes</CardTitle>
        <CardDescription>Últimas execuções desta suite fora do filtro atual.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2 md:grid-cols-2">
        {otherRuns.map((run) => (
          <button key={run.id} type="button" onClick={() => onSelectRun(run)} className="rounded-lg border border-[#e1ddd1] bg-white p-3 text-left transition hover:border-[#9fb25a] hover:bg-[#f5f4ee]">
            <div className="flex items-center justify-between gap-3"><Status status={run.status} /><span className="font-mono text-xs text-[#66705f]">{formatDate(run.createdAt)}</span></div>
            <p className="mt-2 truncate font-mono text-xs text-[#66705f]">{shortId(run.id)} · {runSummary(run)}</p>
          </button>
        ))}
      </CardContent>
    </Card>
  );
}

function HealthMatrix({ suites, envs, runs, selectedSuiteId, selectedEnvId, onSelectCell }: { suites: Suite[]; envs: Environment[]; runs: Run[]; selectedSuiteId?: string; selectedEnvId?: string; onSelectCell: (suite: Suite, env: Environment, run?: Run) => void }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle>Matriz de saúde</CardTitle>
        <CardDescription>Último status por suite e ambiente.</CardDescription>
      </CardHeader>
      <CardContent>
        {suites.length > 0 && envs.length > 0 ? (
          <div className="overflow-x-auto">
            <div className="grid min-w-[520px] gap-1" style={{ gridTemplateColumns: `minmax(180px,1fr) repeat(${envs.length}, minmax(96px, 0.55fr))` }}>
              <div className="p-2 font-mono text-[10px] uppercase tracking-[0.18em] text-[#66705f]">Suite</div>
              {envs.map((env) => <div key={env.id} className="truncate p-2 text-center font-mono text-[10px] uppercase tracking-[0.18em] text-[#66705f]" title={env.name}>{env.name}</div>)}
              {suites.slice(0, 10).map((suite) => (
                <Fragment key={suite.id}>
                  <button type="button" onClick={() => onSelectCell(suite, envs[0], latestRun(runs, { suiteId: suite.id, environmentId: envs[0]?.id }))} className={cn('truncate rounded-md border p-2 text-left text-xs font-semibold', selectedSuiteId === suite.id ? 'border-[#151915] bg-[#f2f6d8]' : 'border-[#e1ddd1] bg-white')} title={suite.name}>{suite.name}</button>
                  {envs.map((env) => {
                    const run = latestRun(runs, { suiteId: suite.id, environmentId: env.id });
                    return (
                      <button key={env.id} type="button" onClick={() => onSelectCell(suite, env, run)} className={cn('rounded-md border p-2 text-center text-xs transition hover:border-[#9fb25a]', selectedSuiteId === suite.id && selectedEnvId === env.id ? 'border-[#151915] bg-[#f2f6d8]' : 'border-[#e1ddd1] bg-white')}>
                        {run ? <span className={cn('inline-block h-2.5 w-2.5 rounded-full', statusDotClass(run.status))} /> : <span className="text-[#8a877c]">-</span>}
                      </button>
                    );
                  })}
                </Fragment>
              ))}
            </div>
          </div>
        ) : <DarkEmpty text="Crie suites e ambientes para formar a matriz." />}
      </CardContent>
    </Card>
  );
}

function FailureInbox({ runs, suites, envs, onSelectRun }: { runs: Run[]; suites: Suite[]; envs: Environment[]; onSelectRun: (run: Run) => void }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle>Failure inbox</CardTitle>
        <CardDescription>Falhas abertas, agrupadas para investigação rápida.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2">
        {runs.map((run) => {
          const suite = suites.find((item) => item.id === run.suiteId);
          const env = envs.find((item) => item.id === run.environmentId);
          return (
            <button key={run.id} type="button" onClick={() => onSelectRun(run)} className="grid gap-2 rounded-lg border border-[#e1ddd1] bg-white p-3 text-left transition hover:border-[#b43c2e] hover:bg-[#fff8f6]">
              <div className="flex items-center justify-between gap-2"><Status status={run.status} /><span className="font-mono text-xs text-[#66705f]">{formatDate(run.createdAt)}</span></div>
              <p className="truncate text-sm font-bold">{suite?.name ?? 'Suite removida'}</p>
              <p className="truncate text-xs text-[#66705f]">{env?.name ?? 'Ambiente removido'} · {run.error ?? runSummary(run)}</p>
            </button>
          );
        })}
        {runs.length === 0 ? <DarkEmpty text="Nenhuma falha aberta no projeto." /> : null}
      </CardContent>
    </Card>
  );
}

function RecentRunsOverview({ runs, suites, envs, selectedRunId, busy, canManageRuns, onSelectRun, onDeleteRun, onOpenSuites, onOpenEnvironments, onOpenEvidence }: { runs: Run[]; suites: Suite[]; envs: Environment[]; selectedRunId?: string; busy: boolean; canManageRuns: boolean; onSelectRun: (run: Run) => void; onDeleteRun: (run: Run) => Promise<void>; onOpenSuites: () => void; onOpenEnvironments: () => void; onOpenEvidence: () => void }) {
  const recentRuns = runs.slice(0, 6);
  return (
    <RunsSection title="Execuções desta seleção" description="Histórico da suite e ambiente escolhidos no topo." count={recentRuns.length}>
      <div className="grid gap-3">
        {recentRuns.length > 0 ? (
          <div className="grid gap-2 md:grid-cols-2 2xl:grid-cols-3">
            {recentRuns.map((run) => (
              <RunHistoryCard
                key={run.id}
                run={run}
                suite={suites.find((suite) => suite.id === run.suiteId)}
                env={envs.find((env) => env.id === run.environmentId)}
                selected={selectedRunId === run.id}
                busy={busy}
                canDelete={canManageRuns}
                onClick={() => {
                  onSelectRun(run);
                  onOpenEvidence();
                }}
                onDelete={() => onDeleteRun(run)}
              />
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

function LatestRunsOverview({ runs, suites, envs, selectedRunId, onSelectRun, onOpenEvidence }: { runs: Run[]; suites: Suite[]; envs: Environment[]; selectedRunId?: string; onSelectRun: (run: Run) => void; onOpenEvidence: () => void }) {
  const latestRuns = runs.slice(0, 8);
  return (
    <RunsSection title="Últimas execuções do projeto" description="Histórico geral recente, independente da suite selecionada." count={latestRuns.length} defaultOpen={false}>
        {latestRuns.length > 0 ? (
          <div className="grid gap-2 md:grid-cols-2 2xl:grid-cols-4">
            {latestRuns.map((run) => (
              <RunHistoryCard
                key={run.id}
                run={run}
                suite={suites.find((suite) => suite.id === run.suiteId)}
                env={envs.find((env) => env.id === run.environmentId)}
                selected={selectedRunId === run.id}
                onClick={() => {
                  onSelectRun(run);
                  onOpenEvidence();
                }}
              />
            ))}
          </div>
        ) : (
          <DarkEmpty text="Nenhuma run no projeto." />
        )}
    </RunsSection>
  );
}

function RunHistoryCard({ run, suite, env, selected, busy = false, canDelete = false, onClick, onDelete }: { run: Run; suite?: Suite; env?: Environment; selected: boolean; busy?: boolean; canDelete?: boolean; onClick: () => void; onDelete?: () => void }) {
  return (
    <div className={cn('grid gap-3 rounded-lg border bg-white p-3 text-left transition hover:border-[#9fb25a] hover:bg-[#f5f4ee]', selected ? 'border-[#9fb25a] bg-[#f2f6d8]' : 'border-[#e1ddd1]')}>
      <div className="flex items-center justify-between gap-3">
        <button type="button" onClick={onClick} className="min-w-0 text-left">
          <Status status={run.status} />
        </button>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-xs text-[#66705f]">{formatDate(run.createdAt)}</span>
          {canDelete && onDelete ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Excluir run ${shortId(run.id)}`}
                  className="h-8 w-8 rounded-md text-[#8a3a32] hover:bg-[#f8e7e4] hover:text-[#8a2f27]"
                  disabled={busy}
                  onClick={onDelete}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Excluir run</TooltipContent>
            </Tooltip>
          ) : null}
        </div>
      </div>
      <button type="button" onClick={onClick} className="min-w-0 text-left">
        <p className="truncate text-sm font-bold" title={suite?.name ?? run.suiteId}>{suite?.name ?? 'Suite removida'}</p>
        <p className="truncate text-xs text-[#66705f]" title={env?.name ?? run.environmentId}>{env?.name ?? 'Ambiente removido'}</p>
      </button>
      <button type="button" onClick={onClick} className="grid grid-cols-3 gap-2 rounded-md bg-[#fbfaf6] p-2 text-center text-xs">
        <RunMiniStat label="Ok" value={run.summary?.passed ?? 0} tone="good" />
        <RunMiniStat label="Falhas" value={run.summary?.failed ?? 0} tone="bad" />
        <RunMiniStat label="Erros" value={run.summary?.error ?? 0} tone="bad" />
      </button>
      <button type="button" onClick={onClick} className="truncate text-left text-xs text-[#66705f]" title={run.error ?? `Execução ${run.id}`}>{run.error ? run.error : `ID ${shortId(run.id)}`}</button>
    </div>
  );
}

function RunMiniStat({ label, value, tone }: { label: string; value: number; tone: 'good' | 'bad' }) {
  return (
    <span>
      <strong className={cn('block text-sm', tone === 'good' ? 'text-[#1f7a50]' : 'text-[#b43c2e]')}>{value}</strong>
      <span className="text-[#66705f]">{label}</span>
    </span>
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

function LiveProgress({ run }: { run: Run }) {
  const progress = run.progress;
  if (!progress) {
    return (
      <div className="rounded-lg border border-[#e1ddd1] bg-white p-3">
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#66705f]">Progresso ao vivo</p>
        <p className="mt-1 text-sm font-semibold">Aguardando worker...</p>
      </div>
    );
  }
  const percent = progress.totalTests > 0 ? Math.round((progress.completedTests / progress.totalTests) * 100) : 0;
  return (
    <div className="grid gap-2 rounded-lg border border-[#e1ddd1] bg-white p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#66705f]">Progresso ao vivo</p>
          <p className="mt-1 truncate text-sm font-semibold" title={progress.currentTest ?? progress.phase}>{progress.currentTest ?? progress.phase}</p>
          <p className="truncate font-mono text-xs text-[#66705f]" title={progress.currentStep ?? 'sem step atual'}>{progress.currentStep ?? 'sem step atual'}</p>
        </div>
        <Badge variant="warning">{progress.completedTests}/{progress.totalTests}</Badge>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-[#e9e5d9]">
        <div className="h-full bg-[#c9df4f] transition-all" style={{ width: `${Math.min(100, percent)}%` }} />
      </div>
      <p className="text-xs text-[#66705f]">{progress.passed} ok · {progress.failed} falha(s) · {progress.error} erro(s) · última atualização {formatDate(run.heartbeatAt ?? progress.updatedAt)}</p>
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
            <Field label="Descrição"><Input value={props.projectDraft.description} onChange={(event) => props.onProjectDraftChange({ ...props.projectDraft, description: event.target.value })} /></Field>
            <Field label="Retention"><Input type="number" min={1} value={props.projectDraft.retentionDays} onChange={(event) => props.onProjectDraftChange({ ...props.projectDraft, retentionDays: event.target.value })} /></Field>
            <label className="flex h-10 items-center gap-2 rounded-md border border-[#d7d2c4] bg-white px-3 text-sm">
              <input type="checkbox" checked={props.projectDraft.cleanupArtifacts} onChange={(event) => props.onProjectDraftChange({ ...props.projectDraft, cleanupArtifacts: event.target.checked })} />
              Artefatos
            </label>
            <Button onClick={props.onSaveProject} disabled={props.busy || !props.canWrite || !props.projectDraft.name.trim()}>Salvar projeto</Button>
          </CardContent>
        </Card>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Ambientes do projeto</CardTitle>
              <CardDescription>Ambientes e URLs ficam aqui, dentro do projeto.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2">
              {props.envs.map((env) => (
                <div key={env.id} className={cn('grid gap-3 rounded-lg border bg-white p-3', props.envDraft.id === env.id ? 'border-[#9fb25a] bg-[#f2f6d8]' : 'border-[#e1ddd1]')}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold">{env.name}</p>
                      <p className="break-all font-mono text-xs text-[#66705f]">{env.baseUrl}</p>
                    </div>
                    <Badge variant="outline">{Object.keys(env.variables ?? {}).length} variáveis</Badge>
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
                  <CardDescription>{props.envDraft.id ? shortId(props.envDraft.id) : 'Ambiente do projeto.'}</CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={props.onNewEnv} disabled={!props.canWrite}>Novo</Button>
              </div>
            </CardHeader>
            <CardContent className="grid gap-3">
              <Field label="Nome"><Input value={props.envDraft.name} onChange={(event) => props.onEnvDraftChange({ ...props.envDraft, name: event.target.value })} placeholder="hml" /></Field>
              <Field label="Base URL"><Input value={props.envDraft.baseUrl} onChange={(event) => props.onEnvDraftChange({ ...props.envDraft, baseUrl: event.target.value })} placeholder="https://app.local" /></Field>
              <Field label="Variáveis"><Textarea className="min-h-36 font-mono text-xs" value={props.envDraft.variables} onChange={(event) => props.onEnvDraftChange({ ...props.envDraft, variables: event.target.value })} placeholder="TOKEN=abc" /></Field>
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
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Suites do projeto</CardTitle>
              <CardDescription>Editor YAML e importação ficam separados para evitar ruído.</CardDescription>
            </div>
            <div className="flex gap-2">
              <MetricPill label="Suites" value={props.suites.length} tone="neutral" />
              <MetricPill label="Validação" value={props.validation?.valid ? 1 : 0} tone={props.validation?.valid ? 'good' : 'neutral'} />
            </div>
          </div>
        </CardHeader>
      </Card>
      <Tabs defaultValue="editor" className="grid gap-4">
        <TabsList className="grid h-auto grid-cols-2 md:w-[420px]">
          <TabsTrigger value="editor">Editor</TabsTrigger>
          <TabsTrigger value="import">Import OpenAPI</TabsTrigger>
        </TabsList>
        <TabsContent value="editor" className="m-0"><SuiteMenu {...props} /></TabsContent>
        <TabsContent value="import" className="m-0">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Import OpenAPI</CardTitle>
              <CardDescription>Cria suite API no projeto selecionado.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
              <div className="grid gap-3 self-start">
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
                <Field label="Headers"><Textarea className="min-h-24 font-mono text-xs" value={props.openApiDraft.headers} onChange={(event) => props.onOpenApiDraftChange({ ...props.openApiDraft, headers: event.target.value })} placeholder="x-tenant=demo" /></Field>
                <Field label="Tags"><Input value={props.openApiDraft.tags} onChange={(event) => props.onOpenApiDraftChange({ ...props.openApiDraft, tags: event.target.value })} placeholder="billing, smoke" /></Field>
                <Field label="Endpoints"><Textarea className="min-h-24 font-mono text-xs" value={props.openApiDraft.selectedOperations} onChange={(event) => props.onOpenApiDraftChange({ ...props.openApiDraft, selectedOperations: event.target.value })} placeholder="GET /health&#10;createUser" /></Field>
              </div>
              <div className="grid gap-3">
                <Field label="OpenAPI JSON"><Textarea className="min-h-[420px] font-mono text-xs" value={props.openApiDraft.spec} onChange={(event) => props.onOpenApiDraftChange({ ...props.openApiDraft, spec: event.target.value })} placeholder='{"openapi":"3.0.0","paths":{}}' /></Field>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={props.openApiDraft.includeBodyExamples} onChange={(event) => props.onOpenApiDraftChange({ ...props.openApiDraft, includeBodyExamples: event.target.checked })} /> Incluir body examples</label>
                  <Button onClick={props.onImportOpenApi} disabled={props.busy || !props.canWrite || !props.projectId || !props.openApiDraft.spec.trim()}><Upload data-icon="inline-start" />Importar</Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function FlowLibraryWorkspace(props: {
  flowLibrary: FlowLibraryItem[];
  flowDraft: FlowDraft;
  projects: Project[];
  currentProjectId: string;
  busy: boolean;
  canWrite: boolean;
  onFlowDraftChange: (draft: FlowDraft) => void;
  onNewFlow: () => void;
  onEditFlow: (flow: FlowLibraryItem) => void;
  onSaveFlow: () => void;
  onArchiveFlow: (flowId: string) => void;
}) {
  const [search, setSearch] = useState('');
  const [scopeDialogOpen, setScopeDialogOpen] = useState(false);
  const currentProjectFlows = props.currentProjectId
    ? props.flowLibrary.filter((flow) => !flow.projectIds?.length || flow.projectIds.includes(props.currentProjectId))
    : props.flowLibrary;
  const visibleFlows = props.flowLibrary.filter((flow) => {
    const query = search.trim().toLowerCase();
    if (!query) return true;
    return [flow.displayName, flow.name, flow.namespace, flow.description]
      .filter(Boolean)
      .some((value) => value!.toLowerCase().includes(query));
  });
  const flowDraftAllProjects = props.flowDraft.projectIds.length === 0;
  const toggleProject = (projectId: string, checked: boolean) => {
    const next = checked
      ? [...new Set([...props.flowDraft.projectIds, projectId])]
      : props.flowDraft.projectIds.filter((id) => id !== projectId);
    props.onFlowDraftChange({ ...props.flowDraft, projectIds: next });
  };
  const selectedFlow = props.flowLibrary.find((flow) => flow.id === props.flowDraft.id);
  const draftReference = flowUseReference(props.flowDraft.namespace, props.flowDraft.name);
  const draftStepCount = roughYamlListCount(props.flowDraft.steps);
  const draftParamCount = roughYamlListCount(props.flowDraft.params);
  const canSaveFlow = !props.busy && props.canWrite && Boolean(props.flowDraft.displayName.trim() && props.flowDraft.namespace.trim() && props.flowDraft.name.trim() && props.flowDraft.steps.trim());
  const requestSaveFlow = () => {
    if (!canSaveFlow) return;
    setScopeDialogOpen(true);
  };
  const confirmSaveFlow = () => {
    setScopeDialogOpen(false);
    props.onSaveFlow();
  };
  return (
    <div className="grid min-h-0 content-start gap-4">
      <section className="rounded-xl border border-[#e8e6dc] bg-[#faf9f5] p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-[#788c5d]">Mesa de flows</p>
            <h1 className="mt-1 truncate text-2xl font-black tracking-normal text-[#141413]">{props.flowDraft.id ? props.flowDraft.displayName || 'Flow selecionado' : 'Novo flow reutilizável'}</h1>
            <p className="mt-1 text-sm text-[#66705f]">Escolha um flow, ajuste propriedades e mantenha o YAML na área principal.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <MetricPill label="Total" value={props.flowLibrary.length} tone="neutral" />
            <MetricPill label="Projeto" value={currentProjectFlows.length} tone="good" />
            <MetricPill label="Steps" value={draftStepCount || selectedFlow?.steps.length || 0} tone={draftStepCount > 0 || selectedFlow ? 'good' : 'warn'} />
          </div>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
        <Card className="overflow-hidden xl:sticky xl:top-4 xl:max-h-[calc(100vh-9rem)]">
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle>Biblioteca</CardTitle>
                <CardDescription>{visibleFlows.length} visíveis · {currentProjectFlows.length} compatíveis</CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={props.onNewFlow}>Novo</Button>
            </div>
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar flow" className={cn(controlClass, 'mt-2')} />
          </CardHeader>
          <CardContent className="max-h-[calc(100vh-17rem)] overflow-auto pr-3">
            <div className="grid gap-2">
              {visibleFlows.map((flow) => {
                const outOfProject = Boolean(props.currentProjectId && flow.projectIds?.length && !flow.projectIds.includes(props.currentProjectId));
                return (
                  <article key={flow.id} className={cn('grid gap-2 rounded-lg border bg-white p-3 transition', props.flowDraft.id === flow.id ? 'border-[#151915] shadow-[inset_4px_0_0_#c7d957]' : 'border-[#e1ddd1] hover:border-[#9fb25a]')}>
                    <button type="button" className="grid min-w-0 gap-1 text-left" onClick={() => props.onEditFlow(flow)}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h2 className="truncate text-base font-extrabold" title={flow.displayName || flow.name}>{flow.displayName || flow.name}</h2>
                          <p className="truncate font-mono text-xs text-[#66705f]">use: {flow.namespace}.{flow.name}</p>
                        </div>
                        <Badge variant={outOfProject ? 'muted' : 'success'}>{flowProjectLabel(flow, props.projects)}</Badge>
                      </div>
                      <p className="line-clamp-2 text-xs text-[#66705f]">{flow.description || `${flow.steps.length} passo(s)`}</p>
                    </button>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-[#66705f]">{flow.steps.length} passo(s)</span>
                      <span className="flex shrink-0 gap-2">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="outline" size="icon" aria-label="Copiar referência" onClick={() => navigator.clipboard?.writeText(`use: ${flow.namespace}.${flow.name}`)}>
                              <Copy className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Copiar use</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="outline" size="icon" aria-label="Arquivar flow" onClick={() => props.onArchiveFlow(flow.id)} disabled={props.busy || !props.canWrite}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Arquivar</TooltipContent>
                        </Tooltip>
                      </span>
                    </div>
                  </article>
                );
              })}
              {visibleFlows.length === 0 ? <DarkEmpty text="Nenhum flow encontrado." /> : null}
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader className="border-b border-[#e8e6dc] bg-[#faf9f5] pb-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#788c5d]">{props.flowDraft.id ? 'Flow selecionado' : 'Novo flow'}</p>
                <CardTitle className="mt-1 truncate text-2xl text-[#141413]">{props.flowDraft.displayName || 'Sem nome'}</CardTitle>
                <CardDescription className="mt-1">{props.flowDraft.description || 'Propriedades à esquerda. YAML à direita.'}</CardDescription>
                <div className="mt-3 flex flex-wrap gap-2">
                  {flowDraftAllProjects ? (
                    <Badge variant="success">todos os projetos</Badge>
                  ) : props.flowDraft.projectIds.length > 0 ? (
                    props.flowDraft.projectIds.map((projectId) => (
                      <Badge key={projectId} variant="outline">{props.projects.find((project) => project.id === projectId)?.name ?? 'Projeto'}</Badge>
                    ))
                  ) : (
                    <Badge variant="warning">sem escopo selecionado</Badge>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <code className="rounded-md border border-[#e8e6dc] bg-white px-3 py-2 font-mono text-sm font-bold text-[#141413]">use: {draftReference}</code>
                <Button variant="outline" onClick={props.onNewFlow}>Limpar</Button>
                <Button onClick={requestSaveFlow} disabled={!canSaveFlow}>{props.busy ? <Loader2 data-icon="inline-start" className="animate-spin" /> : null}Salvar flow</Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="grid min-h-[720px] lg:grid-cols-[340px_minmax(0,1fr)]">
              <aside className="grid content-start gap-5 border-b border-[#e8e6dc] bg-[#faf9f5] p-4 lg:border-b-0 lg:border-r">
                <section className="grid gap-3">
                  <FlowStepHeader index={1} title="Identidade" description="Nome e referência técnica." />
                  <Field label="Nome do flow"><Input value={props.flowDraft.displayName} onChange={(event) => props.onFlowDraftChange({ ...props.flowDraft, displayName: event.target.value })} placeholder="Login com senha" /></Field>
                  <Field label="Namespace"><Input value={props.flowDraft.namespace} onChange={(event) => props.onFlowDraftChange({ ...props.flowDraft, namespace: event.target.value })} placeholder="auth" /></Field>
                  <Field label="Chave YAML"><Input value={props.flowDraft.name} onChange={(event) => props.onFlowDraftChange({ ...props.flowDraft, name: event.target.value })} placeholder="login" /></Field>
                  <Field label="Descrição"><Input value={props.flowDraft.description} onChange={(event) => props.onFlowDraftChange({ ...props.flowDraft, description: event.target.value })} placeholder="Opcional" /></Field>
                </section>

                <Separator />

                <section className="grid gap-3">
                  <FlowStepHeader index={2} title="Resumo" description="Antes de salvar." />
                  <div className="rounded-lg border border-[#e8e6dc] bg-white p-3">
                    <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#66705f]">use</p>
                    <code className="mt-1 block truncate font-mono text-sm font-bold">use: {draftReference}</code>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <MetricPill label="Params" value={draftParamCount} tone="neutral" />
                    <MetricPill label="Steps" value={draftStepCount} tone={draftStepCount > 0 ? 'good' : 'warn'} />
                  </div>
                </section>
              </aside>

              <section className="grid content-start gap-4 bg-white p-4">
                <div className="rounded-lg border border-[#e8e6dc] bg-[#141413] p-4 text-[#faf9f5]">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#b0aea5]">Contrato do flow</p>
                      <p className="mt-1 text-lg font-black">{props.flowDraft.displayName || 'Sem nome'}</p>
                    </div>
                    <div className="flex gap-2">
                      <Badge variant="outline" className="border-[#b0aea5] text-[#faf9f5]">{draftParamCount} params</Badge>
                      <Badge variant="outline" className="border-[#b0aea5] text-[#faf9f5]">{draftStepCount} steps</Badge>
                    </div>
                  </div>
                  <code className="mt-3 block truncate rounded-md bg-black/30 px-3 py-2 font-mono text-sm text-[#faf9f5]">use: {draftReference}</code>
                </div>

                <Field label="Params YAML">
                  <YamlEditor value={props.flowDraft.params} onChange={(value) => props.onFlowDraftChange({ ...props.flowDraft, params: value })} validateSpec={false} height="150px" />
                </Field>
                <Field label="Steps YAML">
                  <YamlEditor value={props.flowDraft.steps} onChange={(value) => props.onFlowDraftChange({ ...props.flowDraft, steps: value })} validateSpec={false} height="520px" />
                </Field>
              </section>
            </div>
          </CardContent>
        </Card>
      </div>
      <Dialog open={scopeDialogOpen} onOpenChange={setScopeDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Definir escopo do flow</DialogTitle>
            <DialogDescription>Escolha onde este flow vai aparecer antes de salvar.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <button
              type="button"
              onClick={() => props.onFlowDraftChange({ ...props.flowDraft, projectIds: [] })}
              className={cn('rounded-lg border p-3 text-left transition', flowDraftAllProjects ? 'border-[#788c5d] bg-[#eef2dd] shadow-[inset_4px_0_0_#788c5d]' : 'border-[#e8e6dc] bg-white hover:border-[#788c5d]')}
            >
              <p className="font-semibold">Todos os projetos</p>
              <p className="mt-1 text-sm text-[#66705f]">Disponível para qualquer suite da organização.</p>
            </button>
            <div className="grid gap-2 rounded-lg border border-[#e8e6dc] bg-[#faf9f5] p-3">
              <div>
                <p className="font-semibold">Projetos selecionados</p>
                <p className="mt-1 text-sm text-[#66705f]">{props.flowDraft.projectIds.length} projeto(s) vinculados.</p>
              </div>
              {props.projects.map((project) => (
                <label key={project.id} className={cn('flex min-h-11 items-center gap-2 rounded-md border p-2.5 text-sm', props.flowDraft.projectIds.includes(project.id) ? 'border-[#788c5d] bg-[#eef2dd]' : 'border-[#e8e6dc] bg-white')}>
                  <input
                    type="checkbox"
                    checked={props.flowDraft.projectIds.includes(project.id)}
                    onChange={(event) => toggleProject(project.id, event.target.checked)}
                  />
                  <span className="truncate">{project.name}</span>
                </label>
              ))}
              {props.projects.length === 0 ? <DarkEmpty text="Nenhum projeto disponível para restringir." /> : null}
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="outline" onClick={() => setScopeDialogOpen(false)}>Cancelar</Button>
              <Button onClick={confirmSaveFlow} disabled={!canSaveFlow}>{props.busy ? <Loader2 data-icon="inline-start" className="animate-spin" /> : null}Salvar flow</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FlowStepHeader({ index, title, description }: { index: number; title: string; description: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-[#e8e6dc] bg-white text-sm font-black text-[#141413]">{index}</span>
      <div className="min-w-0">
        <h2 className="text-base font-extrabold text-[#141413]">{title}</h2>
        <p className="text-sm text-[#66705f]">{description}</p>
      </div>
    </div>
  );
}

function SettingsWorkspace(props: {
  me: AuthMe | null;
  members: OrganizationMember[];
  organizations: Organization[];
  managedUsers: UserManagementItem[];
  memberDraft: { email: string; name: string; role: OrganizationMember['membership']['role']; temporaryPassword: string };
  profileDraft: { name: string; email: string; currentPassword: string; newPassword: string };
  orgDraft: { name: string };
  membershipEdit: MembershipEdit;
  personalTokens: PersonalAccessToken[];
  tokenDraft: { name: string; scope: 'all' | 'selected'; organizationIds: string[] };
  aiConnections: AiConnection[];
  aiDraft: { id: string; name: string; provider: AiConnection['provider']; apiKey: string; model: string; baseUrl: string; enabled: boolean };
  security: SecurityStatus | null;
  audit: AuditEntry[];
  cleanupDays: string;
  cleanupResult: string;
  busy: boolean;
  canWrite: boolean;
  canAdmin: boolean;
  onMemberDraftChange: (draft: { email: string; name: string; role: OrganizationMember['membership']['role']; temporaryPassword: string }) => void;
  onCreateMember: () => void;
  onProfileDraftChange: (draft: { name: string; email: string; currentPassword: string; newPassword: string }) => void;
  onSaveProfile: () => void;
  onOrgDraftChange: (draft: { name: string }) => void;
  onCreateOrganization: () => void;
  onSwitchOrganization: (organizationId: string) => void;
  onMembershipEditChange: (userId: string, organizationId: string, roleValue: Role | '') => void;
  onSaveUserMemberships: (userId: string) => void;
  onTokenDraftChange: (draft: { name: string; scope: 'all' | 'selected'; organizationIds: string[] }) => void;
  onCreatePersonalToken: () => void;
  onRevokePersonalToken: (tokenId: string) => void;
  onAiDraftChange: (draft: { id: string; name: string; provider: AiConnection['provider']; apiKey: string; model: string; baseUrl: string; enabled: boolean }) => void;
  onEditAiConnection: (connection: AiConnection) => void;
  onSaveAiConnection: () => void;
  onCleanupDaysChange: (value: string) => void;
  onCleanup: () => void;
}) {
  return (
    <Tabs defaultValue="profile" className="grid gap-4">
      <TabsList className="grid h-auto grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
        <TabsTrigger value="profile">Perfil</TabsTrigger>
        <TabsTrigger value="organizations">Organizações</TabsTrigger>
        <TabsTrigger value="users">Usuários</TabsTrigger>
        <TabsTrigger value="security">Segurança /MCP</TabsTrigger>
        <TabsTrigger value="ai">AI</TabsTrigger>
        <TabsTrigger value="audit">Audit</TabsTrigger>
      </TabsList>

      <TabsContent value="profile" className="m-0">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Perfil</CardTitle>
            <CardDescription>{props.me?.user.email ?? 'Sessão não carregada'}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-2 rounded-lg border border-[#e1ddd1] bg-white p-3 md:grid-cols-3">
              <InfoLine label="Usuário" value={props.me?.user.email ?? 'sem sessão'} />
              <InfoLine label="Organização" value={props.me?.organization.name ?? 'não carregado'} />
              <InfoLine label="Role" value={props.me?.membership.role ?? 'viewer'} />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Nome"><Input value={props.profileDraft.name} onChange={(event) => props.onProfileDraftChange({ ...props.profileDraft, name: event.target.value })} /></Field>
              <Field label="Email"><Input type="email" value={props.profileDraft.email} onChange={(event) => props.onProfileDraftChange({ ...props.profileDraft, email: event.target.value })} /></Field>
              <Field label="Senha atual"><Input type="password" value={props.profileDraft.currentPassword} onChange={(event) => props.onProfileDraftChange({ ...props.profileDraft, currentPassword: event.target.value })} placeholder="Obrigatória para trocar senha" /></Field>
              <Field label="Nova senha"><Input type="password" value={props.profileDraft.newPassword} onChange={(event) => props.onProfileDraftChange({ ...props.profileDraft, newPassword: event.target.value })} /></Field>
            </div>
            <Button className="w-fit" onClick={props.onSaveProfile} disabled={props.busy || !props.profileDraft.email.trim() || Boolean(props.profileDraft.newPassword && !props.profileDraft.currentPassword)}>Salvar perfil</Button>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="organizations" className="m-0">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="grid gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle>Organizações</CardTitle>
                <CardDescription>{props.me?.organization.name ?? 'Organização atual'} · {props.organizations.length} disponíveis</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-2 md:grid-cols-2">
                {props.organizations.map((organization) => (
                  <div key={organization.id} className={cn('grid gap-3 rounded-lg border bg-white p-3', organization.id === props.me?.organization.id ? 'border-[#9fb25a] bg-[#f2f6d8]' : 'border-[#e1ddd1]')}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{organization.name}</p>
                        <p className="font-mono text-xs text-[#66705f]">{organization.slug || shortId(organization.id)}</p>
                      </div>
                      <Badge variant={organization.status === 'active' ? 'success' : 'outline'}>{organization.status ?? 'ativa'}</Badge>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => props.onSwitchOrganization(organization.id)} disabled={props.busy || organization.id === props.me?.organization.id}>Usar</Button>
                  </div>
                ))}
                {props.organizations.length === 0 ? <DarkEmpty text="Nenhuma organização." /> : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3"><CardTitle>Membros da organização atual</CardTitle><CardDescription>{props.members.length} membros carregados.</CardDescription></CardHeader>
              <CardContent className="grid gap-2 md:grid-cols-2">
                {props.members.map((member) => (
                  <div key={member.membership.id} className="flex items-center justify-between gap-3 rounded-lg border border-[#e1ddd1] bg-white p-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{member.user.email}</p>
                      {member.user.name ? <p className="truncate text-xs text-[#66705f]">{member.user.name}</p> : null}
                    </div>
                    <Badge variant={member.membership.role === 'admin' ? 'success' : member.membership.role === 'editor' ? 'secondary' : 'outline'}>{member.membership.role}</Badge>
                  </div>
                ))}
                {props.members.length === 0 ? <DarkEmpty text="Nenhum membro carregado." /> : null}
              </CardContent>
            </Card>
          </div>

          {props.canAdmin ? (
            <Card>
              <CardHeader className="pb-3"><CardTitle>Nova organização</CardTitle><CardDescription>Cria time/workspace compartilhado.</CardDescription></CardHeader>
              <CardContent className="grid gap-3">
                <Field label="Nome"><Input value={props.orgDraft.name} onChange={(event) => props.onOrgDraftChange({ name: event.target.value })} placeholder="Nome" /></Field>
                <Button onClick={props.onCreateOrganization} disabled={props.busy || !props.orgDraft.name.trim()}>Criar org</Button>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </TabsContent>

      <TabsContent value="users" className="m-0">
        <div className="grid gap-4">
          {props.canAdmin ? (
            <Card>
              <CardHeader className="pb-3"><CardTitle>Novo membro</CardTitle><CardDescription>Cria usuário na organização atual.</CardDescription></CardHeader>
              <CardContent className="grid gap-3">
                <div className="grid gap-3 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_160px]">
                  <Field label="Email"><Input type="email" value={props.memberDraft.email} onChange={(event) => props.onMemberDraftChange({ ...props.memberDraft, email: event.target.value })} placeholder="user@empresa.com" /></Field>
                  <Field label="Nome"><Input value={props.memberDraft.name} onChange={(event) => props.onMemberDraftChange({ ...props.memberDraft, name: event.target.value })} placeholder="Opcional" /></Field>
                  <Field label="Role">
                    <Select value={props.memberDraft.role} onValueChange={(value) => props.onMemberDraftChange({ ...props.memberDraft, role: value as OrganizationMember['membership']['role'] })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">admin</SelectItem>
                        <SelectItem value="editor">editor</SelectItem>
                        <SelectItem value="viewer">viewer</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
                  <Field label="Senha temporária"><Input type="password" value={props.memberDraft.temporaryPassword} onChange={(event) => props.onMemberDraftChange({ ...props.memberDraft, temporaryPassword: event.target.value })} placeholder="Opcional" /></Field>
                  <Button className="self-end" onClick={props.onCreateMember} disabled={props.busy || !props.canAdmin || !props.memberDraft.email.trim()}>Criar membro</Button>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {props.canAdmin ? (
            <Card>
              <CardHeader className="pb-3"><CardTitle>Gestão de acessos</CardTitle><CardDescription>Organizações e roles por usuário.</CardDescription></CardHeader>
              <CardContent className="grid gap-3">
                {props.managedUsers.map((item) => (
                  <div key={item.user.id} className="grid gap-3 rounded-lg border border-[#e1ddd1] bg-white p-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{item.user.email}</p>
                        <p className="truncate text-xs text-[#66705f]">{item.user.name || 'Sem nome'} · {item.user.status}</p>
                      </div>
                      <Button size="sm" onClick={() => props.onSaveUserMemberships(item.user.id)} disabled={props.busy}>Salvar acessos</Button>
                    </div>
                    <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                      {props.organizations.map((organization) => {
                        const value = props.membershipEdit[item.user.id]?.[organization.id] ?? '';
                        return (
                          <div key={`${item.user.id}:${organization.id}`} className="grid gap-2 rounded-md border border-[#e1ddd1] bg-[#fbfaf6] p-2">
                            <label className="flex min-w-0 items-center gap-2 text-sm">
                              <input
                                type="checkbox"
                                checked={Boolean(value)}
                                onChange={(event) => props.onMembershipEditChange(item.user.id, organization.id, event.target.checked ? 'viewer' : '')}
                              />
                              <span className="truncate font-semibold">{organization.name}</span>
                            </label>
                            <Select value={value || 'viewer'} onValueChange={(nextRole) => props.onMembershipEditChange(item.user.id, organization.id, nextRole as Role)} disabled={!value}>
                              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {roles.map((membershipRole) => <SelectItem key={membershipRole} value={membershipRole}>{membershipRole}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
                {props.managedUsers.length === 0 ? <DarkEmpty text="Nenhum usuário carregado." /> : null}
              </CardContent>
            </Card>
          ) : null}
        </div>
      </TabsContent>

      <TabsContent value="security" className="m-0">
        <div className="grid gap-4">
          <Card>
            <CardHeader className="pb-3"><CardTitle>Segurança empresa</CardTitle><CardDescription>OIDC, RBAC, allowlist, secrets e retention.</CardDescription></CardHeader>
            <CardContent className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              <SecurityLine label="OIDC/Auth.js" ok={Boolean(props.security?.oidc.configured)} value={props.security?.oidc.issuer ?? 'não configurado'} />
              <SecurityLine label="API token" ok={Boolean(props.security?.auth.apiTokenEnabled)} value={props.security?.auth.apiTokenEnabled ? 'ativo' : 'desligado'} />
              <SecurityLine label="RBAC" ok value={props.security?.auth.rbacRole ?? 'viewer'} />
              <SecurityLine label="TESTHUB_SECRET_KEY" ok={!props.security?.secrets.defaultKey} value={props.security?.secrets.defaultKey ? 'default, trocar antes de produção' : 'custom'} />
              <SecurityLine label="Allowlist hosts" ok={Boolean(props.security && !props.security.network.allowAllWhenEmpty)} value={props.security?.network.allowedHosts.join(', ') || 'vazia, permite tudo'} />
              <SecurityLine label="Retention" ok value={`${props.security?.retention.days ?? props.cleanupDays} dias`} />
            </CardContent>
          </Card>
          <ProductionReadiness security={props.security} />
          <Card>
            <CardHeader className="pb-3"><CardTitle>Tokens CLI/MCP</CardTitle><CardDescription>Bearer tokens pessoais para CLI, MCP e automações.</CardDescription></CardHeader>
            <CardContent>
              <PersonalTokenControl
                tokens={props.personalTokens}
                organizations={props.me?.organizations ?? props.organizations}
                draft={props.tokenDraft}
                busy={props.busy}
                onDraftChange={props.onTokenDraftChange}
                onCreate={props.onCreatePersonalToken}
                onRevoke={props.onRevokePersonalToken}
              />
            </CardContent>
          </Card>
        </div>
      </TabsContent>

      <TabsContent value="ai" className="m-0">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
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
        </div>
      </TabsContent>

      <TabsContent value="audit" className="m-0">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
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
          <Card>
            <CardHeader className="pb-3"><CardTitle>Cleanup</CardTitle><CardDescription>Aplica política de retention.</CardDescription></CardHeader>
            <CardContent className="grid gap-3">
              <Field label="Dias"><Input type="number" min={1} value={props.cleanupDays} onChange={(event) => props.onCleanupDaysChange(event.target.value)} /></Field>
              <Button variant="destructive" onClick={props.onCleanup} disabled={props.busy || !props.canAdmin || Number(props.cleanupDays) < 1}>Executar cleanup</Button>
              {props.cleanupResult ? <Signal tone="good" text={props.cleanupResult} /> : null}
            </CardContent>
          </Card>
        </div>
      </TabsContent>
    </Tabs>
  );
}

function PersonalTokenControl(props: {
  tokens: PersonalAccessToken[];
  organizations: Organization[];
  draft: { name: string; scope: 'all' | 'selected'; organizationIds: string[] };
  busy: boolean;
  onDraftChange: (draft: { name: string; scope: 'all' | 'selected'; organizationIds: string[] }) => void;
  onCreate: () => void;
  onRevoke: (tokenId: string) => void;
}) {
  const selectedOrganizations = props.organizations.filter((organization) => props.draft.organizationIds.includes(organization.id));
  const canCreate = props.draft.name.trim() && (props.draft.scope === 'all' || props.draft.organizationIds.length > 0);
  return (
    <div className="grid gap-4">
      <div className="grid gap-3 rounded-lg border border-[#e1ddd1] bg-[#fbfaf6] p-3">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px]">
          <Field label="Nome"><Input value={props.draft.name} onChange={(event) => props.onDraftChange({ ...props.draft, name: event.target.value })} placeholder="mcp-local" /></Field>
          <Field label="Escopo">
            <Select value={props.draft.scope} onValueChange={(value) => props.onDraftChange({ ...props.draft, scope: value as 'all' | 'selected', organizationIds: value === 'all' ? [] : props.draft.organizationIds })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas minhas orgs</SelectItem>
                <SelectItem value="selected">Orgs especificas</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>
        {props.draft.scope === 'selected' ? (
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {props.organizations.map((organization) => (
              <label key={organization.id} className="flex min-w-0 items-center gap-2 rounded-md border border-[#e1ddd1] bg-white p-2 text-sm">
                <input
                  type="checkbox"
                  checked={props.draft.organizationIds.includes(organization.id)}
                  onChange={(event) => props.onDraftChange({
                    ...props.draft,
                    organizationIds: event.target.checked
                      ? [...props.draft.organizationIds, organization.id]
                      : props.draft.organizationIds.filter((id) => id !== organization.id),
                  })}
                />
                <span className="truncate font-semibold">{organization.name}</span>
              </label>
            ))}
          </div>
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-[#66705f]">{props.draft.scope === 'all' ? 'Token acompanha todas organizações que voce tem acesso.' : `${selectedOrganizations.length} org(s) selecionada(s).`}</p>
          <Button onClick={props.onCreate} disabled={props.busy || !canCreate}>Criar token</Button>
        </div>
      </div>

      <div className="grid gap-2">
        {props.tokens.map((token) => (
          <div key={token.id} className="grid gap-3 rounded-lg border border-[#e1ddd1] bg-white p-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-semibold">{token.name}</p>
                <p className="font-mono text-xs text-[#66705f]">{token.tokenPreview}</p>
              </div>
              <Badge variant={token.organizationIds?.length ? 'secondary' : 'success'}>{token.organizationIds?.length ? `${token.organizationIds.length} orgs` : 'todas orgs'}</Badge>
            </div>
            <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto_auto]">
              <Input readOnly type="password" value={token.token} />
              <Button variant="outline" onClick={() => navigator.clipboard.writeText(token.token)}>Copiar</Button>
              <Button variant="destructive" onClick={() => props.onRevoke(token.id)} disabled={props.busy}>Revogar</Button>
            </div>
            <p className="text-xs text-[#66705f]">Criado {formatDate(token.createdAt)}{token.lastUsedAt ? ` · último uso ${formatDate(token.lastUsedAt)}` : ''}</p>
          </div>
        ))}
        {props.tokens.length === 0 ? <DarkEmpty text="Nenhum token pessoal." /> : null}
      </div>
    </div>
  );
}

function DocumentationWorkspace() {
  const docs = useMemo(() => ([
    {
      id: 'quickstart',
      group: 'Comece',
      title: 'Quickstart',
      description: 'Do zero até a primeira execução com evidence.',
      tags: ['projeto', 'ambiente', 'suite', 'run'],
      content: (
        <div className="grid gap-5">
          <DocHero title="Documentação TestHub" description="Guia operacional para criar, reutilizar, executar e depurar testes API e Web com organizações, ambientes, Flow Library, MCP e IA." />
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <DocStep title="1. Projeto" text="Crie o workspace do produto ou squad." />
            <DocStep title="2. Ambiente" text="Cadastre baseUrl e variáveis seguras." />
            <DocStep title="3. Suite" text="Escreva YAML API ou Web e valide." />
            <DocStep title="4. Run" text="Execute, revise linha do tempo, artefatos e relatório." />
          </div>
          <DocPanel title="Primeira suite API">
            <CodeBlock code={`version: 1
type: api
name: api-smoke
tests:
  - name: health
    request:
      method: GET
      path: /health
    expect:
      status: 200`} />
          </DocPanel>
        </div>
      ),
    },
    {
      id: 'concepts',
      group: 'Fundamentos',
      title: 'Modelo mental',
      description: 'Como as peças se conectam.',
      tags: ['organização', 'rbac', 'evidence', 'retention'],
      content: (
        <div className="grid gap-4">
          <DocPanel title="Hierarquia">
            <div className="grid gap-3 md:grid-cols-2">
              <InfoLine label="Organização" value="Escopo de usuários, projetos, flows, AI e audit." />
              <InfoLine label="Projeto" value="Agrupa ambientes, suites e runs." />
              <InfoLine label="Ambiente" value="baseUrl + variables/secrets para execução." />
              <InfoLine label="Suite" value="YAML versionado via UI ou MCP." />
              <InfoLine label="Execuções" value="Execução com status, linha do tempo e artefatos." />
              <InfoLine label="Flow Library" value="Flows web compartilhados pela organização." />
            </div>
          </DocPanel>
          <DocPanel title="Permissões">
            <div className="grid gap-2 text-sm text-[#4b5348]">
              <p><strong>admin</strong>: gerencia usuários, organizações, tokens, AI, flows e recursos.</p>
              <p><strong>editor</strong>: cria/edita projetos, ambientes, suites, flows e runs.</p>
              <p><strong>viewer</strong>: consulta recursos e evidence.</p>
            </div>
          </DocPanel>
        </div>
      ),
    },
    {
      id: 'web',
      group: 'YAML',
      title: 'Web suites',
      description: 'Sintaxe web baseada em Playwright.',
      tags: ['goto', 'click', 'fill', 'expect', 'extract'],
      content: (
        <div className="grid gap-4">
          <DocPanel title="Passos web suportados">
            <CodeBlock code={`steps:
  - goto: /login
  - fill:
      by: label
      target: Email
      value: qa@example.com
  - click:
      by: role
      role: button
      name: Entrar
  - expectVisible:
      by: role
      role: heading
      name: Dashboard
  - expectText: Dashboard
  - expectUrlContains: /dashboard
  - expectAttribute:
      by: testId
      target: submit
      attribute: disabled
      value: "true"
  - expectValue:
      by: label
      target: Email
      value: qa@example.com
  - expectCount:
      selector: .todo-item
      count: 3
  - uploadFile:
      selector: input[type="file"]
      path: ./fixtures/avatar.png`} />
          </DocPanel>
          <DocPanel title="Seletores recomendados">
            <CodeBlock code={`# Preferidos: estáveis e acessíveis
by: role
by: label
by: testId
by: placeholder
by: text

# CSS direto: use quando não houver alternativa melhor
selector: '[data-testid="save"]'`} />
          </DocPanel>
        </div>
      ),
    },
    {
      id: 'api',
      group: 'YAML',
      title: 'API suites',
      description: 'Requests HTTP, asserts e extração.',
      tags: ['request', 'expect', 'extract', 'schema'],
      content: (
        <div className="grid gap-4">
          <DocPanel title="Request, expect e extract">
            <CodeBlock code={`tests:
  - name: login extrai token
    request:
      method: POST
      path: /login
      body:
        email: qa@example.com
        password: \${USER_PASSWORD}
    expect:
      status: 200
      maxMs: 1500
      bodyPathExists:
        - token
      bodyPathMatches:
        token: "^ey"
    extract:
      AUTH_TOKEN: body.token

  - name: usa token
    request:
      method: GET
      path: /me
      headers:
        Authorization: Bearer \${AUTH_TOKEN}
    expect:
      status: 200`} />
          </DocPanel>
          <DocPanel title="JSON Schema">
            <CodeBlock code={`expect:
  status: 201
  jsonSchema:
    type: object
    required: [id, email]
    properties:
      id:
        type: string
      email:
        type: string`} />
          </DocPanel>
        </div>
      ),
    },
    {
      id: 'flows',
      group: 'Reuso',
      title: 'Flow Library',
      description: 'Flows web compartilhados por organização.',
      tags: ['flows', 'use', 'with', 'auth.login'],
      content: (
        <div className="grid gap-4">
          <DocPanel title="Criar flow compartilhado">
            <CodeBlock code={`# Menu Flow Library
namespace: auth
name: login
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
      name: Entrar`} />
          </DocPanel>
          <DocPanel title="Usar em várias suites">
            <CodeBlock code={`version: 1
type: web
name: checkout
tests:
  - name: checkout autenticado
     steps:
      - use: auth.login
        with:
          email: qa@example.com
      - goto: /checkout
      - expectText: Finalizar compra`} />
          </DocPanel>
          <DocCallout title="Precedência" text="Flows locais em `flows:` continuam funcionando e vencem a biblioteca quando o nome exato for igual. Referências com namespace, como `auth.login`, buscam a Flow Library." />
        </div>
      ),
    },
    {
      id: 'extract',
      group: 'Reuso',
      title: 'Extract web',
      description: 'Capture dados dinâmicos da tela.',
      tags: ['ORDER_ID', 'attribute', 'url'],
      content: (
        <DocPanel title="Capturas disponíveis">
          <CodeBlock code={`steps:
  - extract:
      as: ORDER_ID
      from:
        by: testId
        target: order-id
      property: text
  - extract:
      as: EMAIL
      from:
        by: label
        target: Email
      property: value
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
  - expectText: \${ORDER_ID}`} />
        </DocPanel>
      ),
    },
    {
      id: 'envs',
      group: 'Operação',
      title: 'Ambientes e secrets',
      description: 'Como passar configuração sem vazar segredo.',
      tags: ['baseUrl', 'variables', 'secrets'],
      content: (
        <div className="grid gap-4">
          <DocPanel title="Variáveis de ambiente">
            <CodeBlock code={`# Ambiente
USER_EMAIL=qa@example.com
USER_PASSWORD=secret
API_TOKEN=secret

# YAML
headers:
  Authorization: Bearer \${API_TOKEN}`} />
          </DocPanel>
          <DocCallout title="Regra" text="Secrets ficam no ambiente. YAML deve usar placeholders. Reports passam por redaction antes de IA e UI." />
        </div>
      ),
    },
    {
      id: 'runs',
      group: 'Operação',
      title: 'Execuções e evidências',
      description: 'Status, linha do tempo e artefatos.',
      tags: ['report', 'video', 'trace', 'screenshot'],
      content: (
        <div className="grid gap-4">
          <DocPanel title="Estados">
            <div className="grid gap-2 text-sm text-[#4b5348]">
              <p><strong>queued/running</strong>: aguardando ou executando.</p>
              <p><strong>passed/failed</strong>: teste terminou com asserts ok ou falhando.</p>
              <p><strong>error</strong>: erro de spec, ambiente, infraestrutura ou runtime.</p>
              <p><strong>canceled/deleted</strong>: cancelada ou arquivada por cleanup.</p>
            </div>
          </DocPanel>
          <DocPanel title="Health check e progresso live">
            <div className="grid gap-2 text-sm text-[#4b5348]">
              <p>Antes de enfileirar uma run, o TestHub valida se o `baseUrl` do ambiente responde HTTP dentro de `TESTHUB_ENV_HEALTH_TIMEOUT_MS`.</p>
              <p>Qualquer resposta HTTP conta como ambiente alcançável. DNS, conexão recusada, TLS e timeout bloqueiam a run com status `error`.</p>
              <p>Durante a execução, Evidências mostra cenário atual, step atual, contadores e último heartbeat usando o polling da interface.</p>
            </div>
          </DocPanel>
          <DocPanel title="Checklist de debug">
            <CodeBlock code={`1. Abra Evidências
2. Veja erro principal e timeline
3. API: request/response/payload
4. Web: screenshot/video/trace
5. Confirme baseUrl e variables do ambiente
6. Ajuste suite, flow ou ambiente
7. Rode novamente`} />
          </DocPanel>
        </div>
      ),
    },
    {
      id: 'production',
      group: 'Operação',
      title: 'Produção',
      description: 'Checklist para subir TestHub com postura segura e previsível.',
      tags: ['produção', 'docker', 'postgres', 'redis', 's3', 'backup', 'security'],
      content: (
        <div className="grid gap-4">
          <DocPanel title="Checklist obrigatório">
            <CodeBlock code={`TESTHUB_SECRET_KEY=valor-forte-não-default
TESTHUB_AUTH_MODE=local
TESTHUB_CORS_ORIGINS=https://testhub.suaempresa.com
TESTHUB_ALLOWED_HOSTS=app.hml.suaempresa.com,api.hml.suaempresa.com
DATABASE_URL=postgres://...
REDIS_URL=redis://...
S3_ENDPOINT=https://...
S3_BUCKET=testhub-artifacts
TESTHUB_RETENTION_DAYS=30
TESTHUB_ENV_HEALTH_TIMEOUT_MS=5000`} />
          </DocPanel>
          <DocPanel title="Runbook objetivo">
            <div className="grid gap-2 text-sm text-[#4b5348]">
              <p><strong>Banco</strong>: usar Postgres gerenciado, backup diário e restore testado.</p>
              <p><strong>Fila</strong>: usar Redis dedicado para worker assíncrono.</p>
              <p><strong>Artefatos</strong>: usar S3/MinIO com lifecycle policy, versionamento conforme necessidade e backup se evidência for auditável.</p>
              <p><strong>Networking</strong>: API e worker precisam resolver os hosts permitidos em `TESTHUB_ALLOWED_HOSTS`; em Docker, valide nomes internos e `host.docker.internal` quando usado.</p>
              <p><strong>PAT</strong>: criar tokens por usuário/organização, revogar tokens antigos e evitar tokens pessoais compartilhados.</p>
              <p><strong>Retention</strong>: combinar `TESTHUB_RETENTION_DAYS`, cleanup de projeto e política do bucket.</p>
            </div>
          </DocPanel>
          <DocCallout title="Sem bloqueio de startup" text="Nesta v1 o TestHub mostra readiness e alertas claros, mas não impede startup automaticamente." />
        </div>
      ),
    },
    {
      id: 'mcp',
      group: 'Automação',
      title: 'MCP',
      description: 'Criar, validar e executar suites YAML por agentes.',
      tags: ['MCP', 'PAT', 'YAML', 'agent'],
      content: (
        <div className="grid gap-4">
          <DocPanel title="Configurar MCP em agente">
            <CodeBlock code={`{
  "mcpServers": {
    "testhub": {
      "command": "npx",
      "args": ["testhub-mcp"],
      "env": {
        "TESTHUB_URL": "http://localhost:4321",
        "TESTHUB_PAT": "th_pat_xxx",
        "TESTHUB_ORGANIZATION_ID": "<org-id-opcional>"
      }
    }
  }
}`} />
          </DocPanel>
          <DocPanel title="Fluxo MCP recomendado">
            <CodeBlock code={`1. testhub_help()
2. testhub_list_projects()
3. testhub_list_flows({ "namespace": "auth" })
4. testhub_get_spec_examples({ "example": "web-library-flow" })
5. testhub_validate_spec({ "specContent": "..." })
6. testhub_create_suite ou testhub_update_suite
7. testhub_run_suite
8. testhub_wait_run
9. testhub_get_run_report`} />
          </DocPanel>
          <DocCallout title="IA" text="A IA não executa testes. Ela usa relatório, linha do tempo, artefatos e redaction para explicar falhas ou sugerir ajustes." />
          <DocCallout title="Escopo do MCP" text="O MCP não gerencia usuários, tokens, OpenAPI import, cleanup ou AI connections. Essas operações ficam na aplicação. O MCP fica focado em projetos, ambientes, Flow Library, suites YAML, runs e evidence." />
        </div>
      ),
    },
    {
      id: 'reference',
      group: 'Referência',
      title: 'Referência rápida',
      description: 'Campos YAML e erros comuns.',
      tags: ['defaults', 'hooks', 'errors'],
      content: (
        <div className="grid gap-4">
          <DocPanel title="Campos principais">
            <CodeBlock code={`version: 1
type: api | web
name: minha-suite
description: opcional
baseUrl: https://app.example.com
variables: {}
defaults:
  timeoutMs: 10000
  retries: 1
  screenshotOnFailure: true
  video: retain-on-failure
  trace: retain-on-failure
beforeEach: []
afterEach: []
flows: {}
tests: []`} />
            <DocCallout title="Timeout" text="`defaults.timeoutMs` controla navegação, clicks, fills, expects e extract. Para telas lentas, use valores maiores como `60000` ou `90000`; também é possível sobrescrever por teste com `timeoutMs`." />
          </DocPanel>
          <DocPanel title="Erros comuns">
            <div className="grid gap-2 text-sm text-[#4b5348]">
              <p><strong>flow não encontrado</strong>: `use` não existe localmente nem na Flow Library.</p>
              <p><strong>ciclo em flows</strong>: um flow chama outro que volta para ele.</p>
              <p><strong>Variável obrigatória ausente</strong>: placeholder sem valor em ambiente, params, variables ou extract.</p>
              <p><strong>extract attribute requer attribute</strong>: informe o nome do atributo.</p>
            </div>
          </DocPanel>
        </div>
      ),
    },
  ]), []);

  const [activeId, setActiveId] = useState(docs[0].id);
  const [query, setQuery] = useState('');
  const filteredDocs = docs.filter((doc) => {
    const haystack = `${doc.group} ${doc.title} ${doc.description} ${doc.tags.join(' ')}`.toLowerCase();
    return haystack.includes(query.toLowerCase());
  });
  const activeDoc = docs.find((doc) => doc.id === activeId) ?? docs[0];
  const groupedDocs = filteredDocs.reduce<Record<string, typeof docs>>((groups, doc) => {
    groups[doc.group] = [...(groups[doc.group] ?? []), doc];
    return groups;
  }, {});

  return (
    <div className="grid min-h-[calc(100vh-160px)] gap-4 lg:grid-cols-[300px_minmax(0,1fr)_220px]">
      <aside className="grid h-fit gap-3 rounded-lg border border-[#e1ddd1] bg-white p-3 lg:sticky lg:top-4">
        <Field label="Buscar docs">
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="flow, api, mcp..." />
        </Field>
        <ScrollArea className="max-h-[calc(100vh-280px)] pr-2">
          <div className="grid gap-4">
            {Object.entries(groupedDocs).map(([group, items]) => (
              <div key={group} className="grid gap-1">
                <p className="px-2 text-xs font-bold uppercase tracking-wide text-[#66705f]">{group}</p>
                {items.map((doc) => (
                  <button
                    key={doc.id}
                    type="button"
                    onClick={() => setActiveId(doc.id)}
                    className={cn('grid gap-1 rounded-md px-2 py-2 text-left text-sm hover:bg-[#f4f1e8]', activeDoc.id === doc.id ? 'bg-[#edf3cf] text-[#1f241f]' : 'text-[#4b5348]')}
                  >
                    <span className="font-semibold">{doc.title}</span>
                    <span className="line-clamp-2 text-xs text-[#66705f]">{doc.description}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </ScrollArea>
      </aside>

      <main className="min-w-0">
        <div className="grid gap-4">
          <div className="rounded-lg border border-[#e1ddd1] bg-white p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-wide text-[#66705f]">{activeDoc.group}</p>
                <h1 className="mt-1 text-2xl font-semibold text-[#1f241f]">{activeDoc.title}</h1>
                <p className="mt-2 max-w-3xl text-sm text-[#4b5348]">{activeDoc.description}</p>
              </div>
              <Badge variant="outline">{activeDoc.tags.length} topicos</Badge>
            </div>
          </div>
          {activeDoc.content}
        </div>
      </main>

      <aside className="hidden h-fit rounded-lg border border-[#e1ddd1] bg-white p-3 lg:sticky lg:top-4 lg:grid lg:gap-2">
        <p className="text-xs font-bold uppercase tracking-wide text-[#66705f]">Nesta pagina</p>
        {activeDoc.tags.map((tag) => (
          <Badge key={tag} variant="outline" className="w-fit">{tag}</Badge>
        ))}
        <Separator className="my-2" />
        <p className="text-xs text-[#66705f]">Use busca para achar sintaxe, exemplos e operacao sem trocar contexto.</p>
      </aside>
    </div>
  );
}

function DocHero({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-lg border border-[#d7d2c4] bg-[#fbfaf6] p-5">
      <p className="text-xs font-bold uppercase tracking-wide text-[#66705f]">Wiki operacional</p>
      <h2 className="mt-2 text-2xl font-semibold text-[#1f241f]">{title}</h2>
      <p className="mt-2 max-w-3xl text-sm text-[#4b5348]">{description}</p>
    </div>
  );
}

function DocPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function DocCallout({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-lg border border-[#c9d78c] bg-[#f2f6d8] p-4">
      <p className="font-semibold text-[#1f241f]">{title}</p>
      <p className="mt-1 text-sm text-[#4b5348]">{text}</p>
    </div>
  );
}

function DocStep({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-lg border border-[#e1ddd1] bg-white p-3">
      <p className="font-semibold">{title}</p>
      <p className="mt-1 text-sm text-[#4b5348]">{text}</p>
    </div>
  );
}

function CodeBlock({ code }: { code: string }) {
  return (
    <pre className="overflow-auto rounded-lg border border-[#d8d3c5] bg-[#111611] p-3 text-xs leading-relaxed text-[#f7f6f0]">
      <code>{code}</code>
    </pre>
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
        <TabsTrigger value="security">Segurança</TabsTrigger>
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
                <Field label="Descrição"><Textarea value={props.projectDraft.description} onChange={(event) => props.onProjectDraftChange({ ...props.projectDraft, description: event.target.value })} placeholder="Escopo, app ou squad." /></Field>
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
              <CardHeader className="pb-3"><CardTitle>Segurança empresa</CardTitle><CardDescription>Estado atual vindo da API.</CardDescription></CardHeader>
              <CardContent className="grid gap-2">
                <SecurityLine label="OIDC/Auth.js" ok={Boolean(props.security?.oidc.configured)} value={props.security?.oidc.issuer ?? 'não configurado'} />
                <SecurityLine label="API token" ok={Boolean(props.security?.auth.apiTokenEnabled)} value={props.security?.auth.apiTokenEnabled ? 'ativo' : 'desligado'} />
                <SecurityLine label="RBAC" ok value={props.security?.auth.rbacRole ?? 'viewer'} />
                <SecurityLine label="TESTHUB_SECRET_KEY" ok={!props.security?.secrets.defaultKey} value={props.security?.secrets.defaultKey ? 'default, trocar antes de produção' : 'custom'} />
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

function ProductionReadiness({ security }: { security: SecurityStatus | null }) {
  const checks = [
    { label: 'Secret forte', ok: Boolean(security && !security.secrets.defaultKey), value: security?.secrets.defaultKey ? 'TESTHUB_SECRET_KEY default' : 'TESTHUB_SECRET_KEY custom' },
    { label: 'Auth ativo', ok: Boolean(security && security.auth.mode !== 'off'), value: security?.auth.mode ?? 'desconhecido' },
    { label: 'RBAC visivel', ok: Boolean(security?.auth.rbacRole), value: security?.auth.rbacRole ?? 'viewer' },
    { label: 'Allowlist de hosts', ok: Boolean(security && !security.network.allowAllWhenEmpty), value: security?.network.allowedHosts.join(', ') || 'vazia' },
    { label: 'Retention configurado', ok: Boolean(security && security.retention.days > 0), value: `${security?.retention.days ?? '-'} dias` },
  ];
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle>Production readiness</CardTitle>
        <CardDescription>Alertas derivados do estado atual de segurança.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {checks.map((check) => <SecurityLine key={check.label} label={check.label} ok={check.ok} value={check.value} />)}
      </CardContent>
    </Card>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[#66705f]">{label}</p>
      <p className="truncate text-sm font-semibold">{value}</p>
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
    <div className="grid min-h-0 flex-1 gap-4 md:grid-cols-[340px_minmax(0,1fr)]">
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
            {props.validation ? <Badge variant={props.validation.valid ? 'success' : 'destructive'}>{props.validation.valid ? `${props.validation.tests} tests` : 'inválida'}</Badge> : null}
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
          <CardTitle>Ambientes</CardTitle>
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
                    <Badge variant="outline">{Object.keys(env.variables ?? {}).length} variáveis</Badge>
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
            <Label>Variáveis</Label>
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

function SuitePreviewDialog({ open, suite, projectId, onOpenChange }: { open: boolean; suite: SuiteWithContent | null; projectId: string; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>{suite?.name ?? 'Suite'}</DialogTitle>
          <DialogDescription>{suite ? `${suiteTypeLabel(suite.type)} · ${shortId(suite.id)}` : 'YAML somente leitura da suite selecionada.'}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <YamlEditor value={suite?.specContent ?? ''} onChange={() => undefined} readOnly height="520px" />
          <div className="flex justify-end gap-2 border-t pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
            {suite ? (
              <Button asChild>
                <Link href={`/suites?project=${projectId}&suite=${suite.id}`}>Alterar</Link>
              </Button>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function YamlEditor({ value, onChange, readOnly = false, validateSpec = true, height = 'calc(100vh - 410px)' }: { value: string; onChange: (value: string) => void; readOnly?: boolean; validateSpec?: boolean; height?: string }) {
  const monacoRef = useRef<any>(null);
  const editorRef = useRef<any>(null);
  const modelPathRef = useRef(`testhub-${Math.random().toString(36).slice(2)}.yaml`);
  useEffect(() => {
    const monaco = monacoRef.current;
    const editor = editorRef.current;
    const model = editor?.getModel?.();
    if (!monaco || !model) return;
    monaco.editor.setModelMarkers(model, 'testhub-yaml', validateSpec ? yamlDiagnostics(value, monaco) : yamlSyntaxDiagnostics(value, monaco));
  }, [value, validateSpec]);

  return (
    <div className="overflow-hidden rounded-md border border-input bg-[#0b100c]" style={{ height }}>
      <MonacoEditor
        height={height}
        defaultLanguage="yaml"
        path={modelPathRef.current}
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
                { label: 'frontend test', kind: monaco.languages.CompletionItemKind.Snippet, insertText: 'tests:\\n  - name: ${1:login}\\n     steps:\\n      - goto: /\\n      - expectVisible: ${2:text}', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, range: undefined as never },
                { label: 'web flow', kind: monaco.languages.CompletionItemKind.Snippet, insertText: 'flows:\\n  ${1:login}:\\n    params:\\n      ${2:email}: ${3:\\${USER_EMAIL}}\\n     steps:\\n      - goto: ${4:/login}\\n      - fill:\\n          by: label\\n          target: ${5:Email}\\n          value: \\${${2:email}}\\n\\ntests:\\n  - name: ${6:fluxo}\\n     steps:\\n      - use: ${1:login}', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, range: undefined as never },
                { label: 'web extract', kind: monaco.languages.CompletionItemKind.Snippet, insertText: '- extract:\\n    as: ${1:ORDER_ID}\\n    from:\\n      by: testId\\n      target: ${2:order-id}\\n    property: ${3:text}', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, range: undefined as never },
              ],
            }),
          });
        }}
        onMount={(editor, monaco) => {
          editorRef.current = editor;
          monacoRef.current = monaco;
          const model = editor.getModel();
          if (model) monaco.editor.setModelMarkers(model, 'testhub-yaml', validateSpec ? yamlDiagnostics(value, monaco) : yamlSyntaxDiagnostics(value, monaco));
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
          readOnly,
          domReadOnly: readOnly,
          renderValidationDecorations: readOnly ? 'off' : 'on',
        }}
        theme="vs-dark"
      />
    </div>
  );
}

function yamlSyntaxDiagnostics(source: string, monaco: any) {
  const markers: Array<ReturnType<typeof marker>> = [];
  try {
    const doc = YAML.parseDocument(source);
    for (const error of doc.errors) {
      const line = lineFromOffset(source, error.pos?.[0] ?? 0);
      markers.push(marker(monaco, line, error.message, monaco.MarkerSeverity.Error));
    }
  } catch (error) {
    markers.push(marker(monaco, 1, messageOf(error), monaco.MarkerSeverity.Error));
  }
  return markers;
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
  if (parsed.version !== 1) markers.push(marker(monaco, Math.max(1, findLine(lines, 'version')), 'version: 1 obrigatório.', monaco.MarkerSeverity.Error));
  if (parsed.type !== 'api' && parsed.type !== 'web') markers.push(marker(monaco, Math.max(1, findLine(lines, 'type')), 'type deve ser api ou web/frontend.', monaco.MarkerSeverity.Error));
  if (!parsed.name) markers.push(marker(monaco, Math.max(1, findLine(lines, 'name')), 'name obrigatório.'));
  if (!Array.isArray(parsed.tests) || parsed.tests.length === 0) markers.push(marker(monaco, Math.max(1, findLine(lines, 'tests')), 'tests deve ter pelo menos 1 item.', monaco.MarkerSeverity.Error));
  if (Array.isArray(parsed.tests)) {
    parsed.tests.forEach((test: any, index: number) => {
      const line = findLine(lines, `- name: ${test?.name ?? ''}`) || findLine(lines, 'tests');
      if (!test?.name) markers.push(marker(monaco, line, `tests[${index}].name obrigatório.`));
      if (parsed.type === 'api' && !test?.request) markers.push(marker(monaco, line, `tests[${index}].request obrigatório para API.`));
      if (parsed.type === 'web' && (!Array.isArray(test?.steps) || test.steps.length === 0)) markers.push(marker(monaco, line, `tests[${index}].steps obrigatório para Frontend.`));
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
        <Score label="Ok" value={props.stats.passed} tone="good" />
        <Score label="Falhas" value={props.stats.failed} tone="bad" />
        <Score label="Erros" value={props.stats.error} tone="bad" />
        <Score label="Rodando" value={props.stats.active} tone="warn" />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              {props.selectedRun ? <Status status={props.selectedRun.status} /> : <Badge variant="muted" className="h-7 font-mono uppercase">Sem execução</Badge>}
              <CardTitle className="mt-3 max-w-full truncate text-2xl font-extrabold" title={props.selectedSuite?.name ?? 'Sem execução'}>
                {props.selectedSuite?.name ?? 'Sem execução'}
              </CardTitle>
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
          <TabsTrigger value="artifacts" className="min-w-0">Artefatos</TabsTrigger>
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
              <ArtifactEvidence run={props.selectedRun} artifacts={props.artifacts} report={props.report} />
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

function OverviewEvidence({ run, report }: { run?: Run; report: RunReport | null; videos: Artifact[] }) {
  if (!run) return <DarkEmpty text="Selecione uma execução." />;
  const results = report?.results ?? [];
  return (
    <div className="grid gap-4">
      <div className="rounded-lg border border-[#e1ddd1] bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-[#66705f]">Execução</p>
            <p className="mt-3 text-lg font-extrabold">{run.status.toUpperCase()}</p>
            <p className="mt-2 text-sm text-[#66705f]">{runSummary(run)}</p>
          </div>
          {results.length > 0 ? (
            <div className="grid grid-cols-4 overflow-hidden rounded-md border border-[#e1ddd1] bg-[#fbfaf6]">
              <Score label="Total" value={results.length} tone="warn" />
              <Score label="Ok" value={results.filter((result) => result.status === 'passed').length} tone="good" />
              <Score label="Falhas" value={results.filter((result) => result.status === 'failed').length} tone="bad" />
              <Score label="Erros" value={results.filter((result) => result.status === 'error').length} tone="bad" />
            </div>
          ) : null}
        </div>
        {run.error ? <pre className="mt-3 overflow-auto rounded-lg bg-[#0b100c] p-3 font-mono text-xs text-[#ffb4a8]">{run.error}</pre> : null}
      </div>
      {['queued', 'running'].includes(run.status) ? <LiveProgress run={run} /> : null}
      {results.length > 0 ? <TestEvidenceList results={results} /> : <DarkEmpty text="Cenários ainda indisponíveis para esta execução." />}
    </div>
  );
}

function TestEvidenceList({ results }: { results: NonNullable<RunReport['results']> }) {
  return (
    <div className="grid gap-3">
      {results.map((result, index) => {
        const artifacts = dedupeArtifacts(result.artifacts ?? []);
        const videos = artifacts.filter((artifact) => artifact.type === 'video');
        const traces = artifacts.filter((artifact) => artifact.type === 'trace');
        const screenshots = artifacts.filter((artifact) => artifact.type === 'screenshot');
        const logs = artifacts.filter((artifact) => artifact.type === 'log');
        return (
          <Card key={`${result.name}:${index}`}>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#66705f]">Cenário {index + 1}</p>
                  <CardTitle className="mt-1 truncate text-lg" title={result.name}>{result.name}</CardTitle>
                  <CardDescription>{result.durationMs ? `${result.durationMs}ms` : `${result.steps?.length ?? 0} passos`} · {artifacts.length} artefatos</CardDescription>
                </div>
                <Status status={result.status} />
              </div>
              {result.error ? <pre className="mt-3 max-h-44 overflow-auto rounded-lg bg-[#0b100c] p-3 font-mono text-xs text-[#ffb4a8]">{result.error}</pre> : null}
            </CardHeader>
            <CardContent className="grid gap-3">
              {videos[0] ? (
                <div className="overflow-hidden rounded-lg bg-black shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08),0_12px_24px_rgba(0,0,0,0.18)]">
                  <video className="aspect-video w-full bg-black" src={artifactUrl(videos[0].path)} controls preload="metadata" />
                </div>
              ) : <DarkEmpty text="Video indisponível para este cenário." />}
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                {videos.slice(1).map((artifact) => <ArtifactLink key={artifact.path} label={artifact.label ?? 'Video'} path={artifact.path} type={artifact.type} compact />)}
                {screenshots.map((artifact) => <ArtifactLink key={artifact.path} label={artifact.label ?? 'Screenshot'} path={artifact.path} type={artifact.type} compact />)}
                {traces.map((artifact) => <ArtifactLink key={artifact.path} label={artifact.label ?? 'Trace'} path={artifact.path} type={artifact.type} compact />)}
                {logs.map((artifact) => <ArtifactLink key={artifact.path} label={artifact.label ?? 'Console'} path={artifact.path} type={artifact.type} compact />)}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function TimelineEvidence({ report }: { report: RunReport | null }) {
  const results = report?.results ?? [];
  if (results.length === 0) return <DarkEmpty text="Timeline indisponível." />;
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

function ArtifactEvidence({ run, artifacts, report }: { run?: Run; artifacts: Artifact[]; report?: RunReport | null }) {
  const uniqueArtifacts = dedupeArtifacts(artifacts).filter((artifact) => artifact.path !== run?.reportHtmlPath);
  const payloadGroups = groupHttpArtifacts(uniqueArtifacts);
  const otherArtifacts = uniqueArtifacts.filter((artifact) => artifact.type !== 'request' && artifact.type !== 'response');
  if (!run?.reportHtmlPath && uniqueArtifacts.length === 0) return <DarkEmpty text="Artefatos indisponíveis." />;
  return (
    <div className="grid gap-3">
      {run?.reportHtmlPath ? <ArtifactLink label="HTML report" path={run.reportHtmlPath} type="html" /> : null}
      {(report?.results ?? []).map((result) => {
        const resultArtifacts = dedupeArtifacts(result.artifacts ?? []).filter((artifact) => artifact.type !== 'request' && artifact.type !== 'response');
        if (resultArtifacts.length === 0) return null;
        return (
          <Card key={result.name}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="truncate text-base" title={result.name}>{result.name}</CardTitle>
                <Status status={result.status} />
              </div>
            </CardHeader>
            <CardContent className="grid gap-2 sm:grid-cols-2">
              {resultArtifacts.map((artifact) => <ArtifactLink key={`${result.name}:${artifact.type}:${artifact.path}`} label={artifact.label ?? shortPath(artifact.path)} path={artifact.path} type={artifact.type} compact />)}
            </CardContent>
          </Card>
        );
      })}
      {otherArtifacts.filter((artifact) => !(report?.results ?? []).some((result) => (result.artifacts ?? []).some((item) => item.path === artifact.path))).map((artifact) => <ArtifactLink key={`${artifact.type}:${artifact.path}`} label={artifact.label ?? shortPath(artifact.path)} path={artifact.path} type={artifact.type} />)}
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
  if (artifacts.length === 0) return <DarkEmpty text="Payload indisponível para execuções frontend." />;
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
    fetch(artifactUrl(artifact.path), { credentials: 'include', headers: authHeaders() })
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
      <pre className="mt-3 max-h-96 overflow-auto rounded-lg bg-[#0b100c] p-3 font-mono text-xs leading-5 text-[#f7f6f0]">{payload ? JSON.stringify(payload, null, 2) : 'Carregando...'}</pre>
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
          <DialogTitle>Wizard de configuração</DialogTitle>
          <DialogDescription>Crie projeto, ambiente e primeira suite em fluxo único.</DialogDescription>
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
              <Field label="Descrição"><Textarea value={props.draft.projectDescription} onChange={(event) => props.onDraftChange({ ...props.draft, projectDescription: event.target.value })} placeholder="Escopo, squad, produto ou módulo." /></Field>
            </div>
          ) : null}

          {props.step === 1 ? (
            <div className="grid gap-3">
              <Field label="Nome do ambiente"><Input value={props.draft.environmentName} onChange={(event) => props.onDraftChange({ ...props.draft, environmentName: event.target.value })} placeholder="hml" /></Field>
              <Field label="Base URL"><Input value={props.draft.baseUrl} onChange={(event) => props.onDraftChange({ ...props.draft, baseUrl: event.target.value })} placeholder="https://app.local" /></Field>
              <Field label="Variáveis"><Textarea className="min-h-36 font-mono text-xs" value={props.draft.variables} onChange={(event) => props.onDraftChange({ ...props.draft, variables: event.target.value })} placeholder="TOKEN=abc" /></Field>
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
              <div className="grid gap-1">
                <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#66705f]">YAML</span>
                <YamlEditor
                  value={props.draft.specContent}
                  onChange={(value) => props.onDraftChange({ ...props.draft, specContent: value })}
                  readOnly={false}
                  height="360px"
                />
              </div>
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
    <Badge variant={variant} className="h-7 gap-2 uppercase">
      {passed ? <CheckCircle2 data-icon="inline-start" /> : failed ? <XCircle data-icon="inline-start" /> : active ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <Square data-icon="inline-start" />}
      {statusLabel(status)}
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

function MetricPill({ label, value, tone }: { label: string; value: number; tone: 'good' | 'bad' | 'warn' | 'neutral' }) {
  return (
    <div className="min-w-[92px] rounded-lg border border-[#e1ddd1] bg-[#fbfaf6] px-3 py-2">
      <p className="font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-[#66705f]">{label}</p>
      <p className={cn('mt-1 text-lg font-black', tone === 'good' && 'text-[#1f7a50]', tone === 'bad' && 'text-[#b43c2e]', tone === 'warn' && 'text-[#8a6417]', tone === 'neutral' && 'text-[#1f241f]')}>{value}</p>
    </div>
  );
}

function StatusDot({ status }: { status?: RunStatus }) {
  return (
    <span className="mt-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#e1ddd1] bg-[#fbfaf6]" aria-label={status ? statusLabel(status) : 'Sem run'}>
      <span className={cn('h-2.5 w-2.5 rounded-full', status ? statusDotClass(status) : 'bg-[#c8c2b4]')} />
    </span>
  );
}

function Signal({ tone, text }: { tone: 'good' | 'bad'; text: string }) {
  return <div className={cn('rounded-lg border px-3 py-2 font-mono text-xs', tone === 'good' ? 'border-[#1d4f3a]/50 bg-[#e9f4d0] text-[#1d4f3a]' : 'border-[#b42318]/50 bg-[#fff0ed] text-[#9f1f16]')}>{text}</div>;
}

function ArtifactLink({ label, path, type, compact }: { label: string; path: string; type: string; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function openLog() {
    setOpen(true);
    if (content || loading) return;
    setLoading(true);
    setError('');
    try {
      const response = await fetch(artifactUrl(path), { credentials: 'include', headers: authHeaders() });
      if (!response.ok) throw new Error(await response.text());
      setContent(await response.text());
    } catch (nextError) {
      setError(messageOf(nextError));
    } finally {
      setLoading(false);
    }
  }

  if (type === 'log') {
    return (
      <>
        <button
          type="button"
          className={cn('flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-[#e1ddd1] bg-white text-left text-sm transition hover:border-[#9fb25a] hover:bg-[#f5f4ee]', compact ? 'p-2' : 'p-3')}
          onClick={openLog}
        >
          <span className="min-w-0 truncate font-semibold">{label}</span>
          <Badge variant="outline">{type}</Badge>
        </button>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-4xl">
            <DialogHeader>
              <DialogTitle>{label}</DialogTitle>
              <DialogDescription className="break-all font-mono text-xs">{shortPath(path)}</DialogDescription>
            </DialogHeader>
            {error ? <Signal tone="bad" text={error} /> : null}
            <pre className="max-h-[70vh] overflow-auto rounded-lg bg-[#0b100c] p-4 font-mono text-xs leading-5 text-[#f7f6f0]">{loading ? 'Carregando...' : content || 'Sem logs.'}</pre>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <a className={cn('flex items-center justify-between gap-3 rounded-lg border border-[#e1ddd1] bg-white text-sm transition hover:border-[#9fb25a] hover:bg-[#f5f4ee]', compact ? 'p-2' : 'p-3')} href={artifactUrl(path)} target="_blank">
      <span className="min-w-0 truncate font-semibold">{label}</span>
      <Badge variant="outline">{type}</Badge>
    </a>
  );
}

function UserSidebarMenu({ me, role, busy, onLogout }: { me: AuthMe | null; role: Role; busy: boolean; onLogout: () => void }) {
  if (!me) {
    return (
      <Button asChild variant="outline" size="icon" className="rounded-lg border-white/15 bg-transparent text-[#f7f6f0] hover:bg-white/10">
        <Link href="/settings" aria-label="Sessão">
          <Settings2 data-icon="inline-start" />
        </Link>
      </Button>
    );
  }
  const label = me.user.name || me.user.email;
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <button type="button" aria-label="Menu do usuário" className="grid rounded-full ring-1 ring-white/15 transition hover:ring-[#d7e35f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d7e35f]">
              <Avatar className="h-11 w-11 border border-white/10 bg-[#d7e35f] text-[#111611]">
                <AvatarFallback className="bg-[#d7e35f] font-bold text-[#111611]">{initials(label)}</AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="right" sideOffset={10}>{label}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent side="right" align="end" sideOffset={12} className="w-72">
        <DropdownMenuLabel>
          <span className="block truncate">{label}</span>
          <span className="block truncate font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{me.organization.name} · {role}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem asChild>
            <Link href="/settings">
              <Settings2 data-icon="inline-start" />
              Perfil e sistema
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onLogout} disabled={busy} variant="destructive">
            {busy ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <LogOut data-icon="inline-start" />}
            Sair
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
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

function latestRun(runs: Run[], filter: { suiteId?: string; environmentId?: string } = {}): Run | undefined {
  return runs
    .filter((run) => (!filter.suiteId || run.suiteId === filter.suiteId) && (!filter.environmentId || run.environmentId === filter.environmentId))
    .sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime())[0];
}

function inferredOwner(suite: Suite): string {
  const name = suite.name.toLowerCase();
  if (name.includes('auth') || name.includes('login') || name.includes('security')) return 'Segurança';
  if (name.includes('checkout') || name.includes('payment') || name.includes('billing')) return 'Receita';
  if (name.includes('api') || name.includes('health') || suite.type === 'api') return 'Plataforma';
  if (suite.type === 'web') return 'Produto';
  return 'Qualidade';
}

function inferredCriticality(suite: Suite): 'baixa' | 'média' | 'alta' | 'bloqueante' {
  const name = suite.name.toLowerCase();
  if (name.includes('checkout') || name.includes('payment') || name.includes('billing') || name.includes('auth') || name.includes('login')) return 'bloqueante';
  if (name.includes('api') || name.includes('health') || name.includes('smoke')) return 'alta';
  if (suite.type === 'web') return 'média';
  return 'baixa';
}

function statusDotClass(status: RunStatus): string {
  if (status === 'passed') return 'bg-[#1f7a50]';
  if (status === 'failed' || status === 'error') return 'bg-[#b43c2e]';
  if (status === 'queued' || status === 'running') return 'bg-[#c39420]';
  return 'bg-[#9da596]';
}

type TimelineRow = { name: string; status: RunStatus; startedAt?: string; durationMs?: number; error?: string; artifacts: Artifact[] };

function timelineRows(report: RunReport | null, run?: Run): TimelineRow[] {
  const rows = (report?.results ?? []).flatMap((result) => {
    const resultSteps = result.steps ?? [];
    if (resultSteps.length === 0) {
      return [{
        name: result.name,
        status: result.status,
        startedAt: result.startedAt,
        durationMs: result.durationMs,
        error: result.error,
        artifacts: result.artifacts ?? [],
      }];
    }
    return resultSteps.map((step) => ({
      name: `${result.name} / ${step.name}`,
      status: step.status,
      startedAt: step.startedAt ?? result.startedAt,
      durationMs: step.durationMs,
      error: step.error,
      artifacts: step.artifacts ?? result.artifacts ?? [],
    }));
  });
  if (rows.length > 0) return rows;
  if (!run) return [];
  if (run.progress) {
    return [{
      name: run.progress.currentTest ?? run.progress.phase,
      status: run.status,
      error: run.error ?? undefined,
      artifacts: [],
    }];
  }
  return [{
    name: 'Execução criada',
    status: run.status,
    error: run.error ?? undefined,
    artifacts: [],
  }];
}

function buildRunMarkdown({ suite, env, run, report }: { suite: Suite; env?: Environment; run?: Run; report: RunReport | null }): string {
  const results = report?.results ?? [];
  const failedResults = results.filter((result) => result.status === 'failed' || result.status === 'error');
  const artifacts = collectArtifacts(report);
  const artifactCounts = countArtifactsByType(artifacts);
  const lines = [
    `# Relatório de execução - ${suite.name}`,
    '',
    `- Status: ${run ? statusLabel(run.status) : 'sem execução'}`,
    `- Resultado: ${run ? runSummary(run) : 'sem execução selecionada'}`,
    `- Ambiente: ${env ? `${env.name} (${env.baseUrl})` : 'não selecionado'}`,
    `- Início: ${run ? formatDate(run.startedAt ?? run.createdAt) : '-'}`,
    `- Fim: ${run ? formatDate(run.finishedAt) : '-'}`,
    `- Run: ${run ? run.id : 'sem run'}`,
    '',
    '## Resumo',
    '',
    `- Suite: ${suite.name} (${suiteTypeLabel(suite.type)})`,
    `- Dono: ${inferredOwner(suite)}`,
    `- Criticidade: ${inferredCriticality(suite)}`,
    `- Cenários: ${results.length || run?.summary?.total || 0}`,
    `- Evidências: ${formatArtifactCounts(artifactCounts)}`,
    '',
    '## Cenários',
    '',
  ];
  if (results.length === 0) {
    lines.push('- Cenários indisponíveis enquanto o relatório final não existe.');
  } else {
    results.forEach((result, index) => {
      const resultArtifacts = dedupeArtifacts(result.artifacts ?? []);
      lines.push(`${index + 1}. ${result.name}`);
      lines.push(`   - Status: ${statusLabel(result.status)}`);
      if (result.startedAt) lines.push(`   - Início: ${formatDate(result.startedAt)}`);
      if (result.durationMs !== undefined) lines.push(`   - Duração: ${result.durationMs}ms`);
      lines.push(`   - Passos: ${result.steps?.length ?? 0}`);
      if (resultArtifacts.length > 0) lines.push(`   - Evidências: ${formatArtifactCounts(countArtifactsByType(resultArtifacts))}`);
      if (result.error) lines.push(`   - Erro: ${redactStepText(result.error)}`);
    });
  }
  lines.push('', '## Falhas e passos relevantes', '');
  if (failedResults.length === 0) {
    lines.push('- Nenhuma falha. Passo a passo completo disponível na aba Passos e nas evidências brutas.');
  } else {
    failedResults.forEach((result) => {
      lines.push(`- ${result.name}: ${redactStepText(result.error ?? statusLabel(result.status))}`);
      result.steps
        ?.filter((step) => step.status === 'failed' || step.status === 'error')
        .slice(0, 5)
        .forEach((step) => lines.push(`  - ${redactStepText(step.name)}: ${redactStepText(step.error ?? statusLabel(step.status))}`));
    });
  }
  lines.push('', '## Artefatos', '');
  if (artifacts.length === 0) {
    lines.push('- Nenhum artefato disponível.');
  } else {
    lines.push(`- ${formatArtifactCounts(artifactCounts)}`);
    const reportArtifacts = artifacts.filter((artifact) => artifact.type === 'html' || artifact.type === 'json' || artifact.type === 'xml');
    reportArtifacts.forEach((artifact) => lines.push(`- ${artifact.type}: ${artifact.label ?? shortPath(artifact.path)}`));
  }
  return lines.join('\n');
}

function countArtifactsByType(artifacts: Artifact[]): Record<string, number> {
  return artifacts.reduce<Record<string, number>>((counts, artifact) => {
    counts[artifact.type] = (counts[artifact.type] ?? 0) + 1;
    return counts;
  }, {});
}

function formatArtifactCounts(counts: Record<string, number>): string {
  const entries = Object.entries(counts);
  if (entries.length === 0) return 'nenhuma';
  return entries.map(([type, count]) => `${count} ${artifactTypeLabel(type)}`).join(' · ');
}

function artifactTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    html: 'HTML',
    json: 'JSON',
    xml: 'JUnit',
    log: 'log(s)',
    video: 'vídeo(s)',
    trace: 'trace(s)',
    screenshot: 'screenshot(s)',
    request: 'request(s)',
    response: 'response(s)',
  };
  return labels[type] ?? type;
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
  if (!run.summary) return 'Sem relatório final.';
  return `${run.summary.passed ?? 0}/${run.summary.total ?? 0} cenário(s) ok · ${run.summary.failed ?? 0} falha(s) · ${run.summary.error ?? 0} erro(s)`;
}

function statusLabel(status: RunStatus): string {
  const labels: Record<RunStatus, string> = {
    queued: 'Na fila',
    running: 'Rodando',
    passed: 'Aprovado',
    failed: 'Falhou',
    error: 'Erro',
    canceled: 'Cancelado',
    deleted: 'Arquivado',
  };
  return labels[status] ?? status;
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

function flowProjectLabel(flow: FlowLibraryItem, projects: Project[]): string {
  if (!flow.projectIds?.length) return 'todos';
  const names = flow.projectIds
    .map((id) => projects.find((project) => project.id === id)?.name)
    .filter(Boolean);
  if (names.length === 0) return `${flow.projectIds.length} projeto(s)`;
  if (names.length === 1) return names[0]!;
  return `${names.length} projetos`;
}

function flowUseReference(namespace: string, name: string): string {
  const safeNamespace = namespace.trim() || 'namespace';
  const safeName = name.trim() || 'chave';
  return `${safeNamespace}.${safeName}`;
}

function roughYamlListCount(value: string): number {
  return value.split('\n').filter((line) => /^\s*-\s+/.test(line)).length;
}

function flowDraftProjectNames(draft: FlowDraft, projects: Project[]): string {
  const names = draft.projectIds
    .map((id) => projects.find((project) => project.id === id)?.name)
    .filter(Boolean);
  if (names.length === 0) return `${draft.projectIds.length} projeto(s)`;
  if (names.length <= 2) return names.join(', ');
  return `${names.slice(0, 2).join(', ')} +${names.length - 2}`;
}

function redactStepText(value: string): string {
  return value.split(' / ').map((segment) => {
    const separatorIndex = segment.indexOf(': ');
    if (separatorIndex === -1) return segment;
    const prefix = segment.slice(0, separatorIndex + 2);
    const payload = segment.slice(separatorIndex + 2);
    if (!payload.trim().startsWith('{')) return redactPlainSensitive(payload, prefix);
    try {
      return `${prefix}${JSON.stringify(redactStepPayload(JSON.parse(payload)))}`;
    } catch {
      return redactPlainSensitive(segment, '');
    }
  }).join(' / ');
}

function redactStepPayload(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactStepPayload);
  if (!value || typeof value !== 'object') return value;
  const input = value as Record<string, unknown>;
  const descriptor = [input.by, input.target, input.name, input.label, input.selector, input.text]
    .filter((item): item is string => typeof item === 'string')
    .join(' ');
  return Object.fromEntries(Object.entries(input).map(([key, nestedValue]) => {
    if (key === 'value' && isSensitiveDescriptor(descriptor)) return [key, '[REDACTED]'];
    if (isSensitiveDescriptor(key)) return [key, '[REDACTED]'];
    return [key, redactStepPayload(nestedValue)];
  }));
}

function redactPlainSensitive(value: string, prefix: string): string {
  if (!isSensitiveDescriptor(`${prefix} ${value}`)) return `${prefix}${value}`;
  return `${prefix}[REDACTED]`;
}

function isSensitiveDescriptor(value: string): boolean {
  return /(authorization|cookie|set-cookie|token|secret|password|senha|api[-_ ]?key)/i.test(value);
}

function artifactUrl(path: string): string {
  return `${apiBase}/artifacts?path=${encodeURIComponent(path)}`;
}

function initials(value: string): string {
  const parts = value.split(/[\s@._-]+/).filter(Boolean);
  return (parts[0]?.[0] ?? 'U').concat(parts[1]?.[0] ?? '').toUpperCase();
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

function mergeMembershipEdit(current: MembershipEdit, users: UserManagementItem[], organizations: Organization[]): MembershipEdit {
  const organizationIds = new Set(organizations.map((organization) => organization.id));
  return Object.fromEntries(users.map((item) => {
    const existing = current[item.user.id] ?? {};
    const memberships = Object.fromEntries(item.memberships
      .filter((membership) => organizationIds.has(membership.organizationId))
      .map((membership) => [membership.organizationId, membership.role]));
    const merged = Object.fromEntries(organizations.map((organization) => {
      const currentValue = existing[organization.id];
      return [organization.id, currentValue !== undefined ? currentValue : (memberships[organization.id] ?? '')];
    }));
    return [item.user.id, merged];
  }));
}

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
