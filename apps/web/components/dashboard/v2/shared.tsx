'use client';

import { useState } from 'react';
import type React from 'react';
import Link from 'next/link';
import { CheckCircle2, Loader2, LogOut, Settings2, Square, XCircle, type LucideIcon } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { apiBase } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { Artifact, AuthMe, Environment, FlowDraft, FlowLibraryItem, MembershipEdit, Organization, Project, Role, Run, RunReport, RunStatus, Suite, UserManagementItem } from './types';
import { useArtifactTextQuery } from './query/useArtifactQueries';

export function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[#66705f]">{label}</p>
      <p className="truncate text-sm font-semibold">{value}</p>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1">
      <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#66705f]">{label}</span>
      {children}
    </label>
  );
}

export function RunFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[#e1ddd1] bg-white p-2.5">
      <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#66705f]">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold">{value}</p>
    </div>
  );
}

export function Status({ status }: { status: RunStatus }) {
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

export function Score({ label, value, tone }: { label: string; value: number; tone: 'good' | 'bad' | 'warn' }) {
  return (
    <div className="border-r border-[#e1ddd1] p-2.5 last:border-r-0">
      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#66705f]">{label}</p>
      <p className={cn('mt-1 text-lg font-extrabold', tone === 'good' && 'text-[#1f7a50]', tone === 'bad' && 'text-[#b43c2e]', tone === 'warn' && 'text-[#8a6417]')}>{value}</p>
    </div>
  );
}

export function MetricPill({ label, value, tone }: { label: string; value: number; tone: 'good' | 'bad' | 'warn' | 'neutral' }) {
  return (
    <div className="min-w-[92px] rounded-lg border border-[#e1ddd1] bg-[#fbfaf6] px-3 py-2">
      <p className="font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-[#66705f]">{label}</p>
      <p className={cn('mt-1 text-lg font-black', tone === 'good' && 'text-[#1f7a50]', tone === 'bad' && 'text-[#b43c2e]', tone === 'warn' && 'text-[#8a6417]', tone === 'neutral' && 'text-[#1f241f]')}>{value}</p>
    </div>
  );
}

export function StatusDot({ status }: { status?: RunStatus }) {
  return (
    <span className="mt-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#e1ddd1] bg-[#fbfaf6]" aria-label={status ? statusLabel(status) : 'Sem run'}>
      <span className={cn('h-2.5 w-2.5 rounded-full', status ? statusDotClass(status) : 'bg-[#c8c2b4]')} />
    </span>
  );
}

export function Signal({ tone, text }: { tone: 'good' | 'bad'; text: string }) {
  return <div className={cn('rounded-lg border px-3 py-2 font-mono text-xs', tone === 'good' ? 'border-[#1d4f3a]/50 bg-[#e9f4d0] text-[#1d4f3a]' : 'border-[#b42318]/50 bg-[#fff0ed] text-[#9f1f16]')}>{text}</div>;
}

export function ArtifactLink({ label, path, type, compact }: { label: string; path: string; type: string; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const logQuery = useArtifactTextQuery(path, open && type === 'log');

  function openLog() {
    setOpen(true);
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
            {logQuery.error ? <Signal tone="bad" text={messageOf(logQuery.error)} /> : null}
            <pre className="max-h-[70vh] overflow-auto rounded-lg bg-[#0b100c] p-4 font-mono text-xs leading-5 text-[#f7f6f0]">{logQuery.isLoading ? 'Carregando...' : logQuery.data || 'Sem logs.'}</pre>
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

export function UserSidebarMenu({ me, role, busy, onLogout }: { me: AuthMe | null; role: Role; busy: boolean; onLogout: () => void }) {
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

export function RailIcon({ icon: Icon, active, label, onClick }: { icon: LucideIcon; active?: boolean; label: string; onClick: () => void }) {
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

export function RailLink({ icon: Icon, active, label, href }: { icon: LucideIcon; active?: boolean; label: string; href: string }) {
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

export function DarkEmpty({ text }: { text: string }) {
  return <div className="rounded-lg border border-dashed border-[#cfc9ba] bg-white p-6 text-center text-sm text-[#66705f]">{text}</div>;
}

export function summarize(runs: Run[]) {
  return {
    passed: runs.filter((run) => run.status === 'passed').length,
    failed: runs.filter((run) => run.status === 'failed').length,
    error: runs.filter((run) => run.status === 'error').length,
    active: runs.filter((run) => run.status === 'queued' || run.status === 'running').length,
  };
}

export function latestRun(runs: Run[], filter: { suiteId?: string; environmentId?: string } = {}): Run | undefined {
  return runs
    .filter((run) => (!filter.suiteId || run.suiteId === filter.suiteId) && (!filter.environmentId || run.environmentId === filter.environmentId))
    .sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime())[0];
}

export function inferredOwner(suite: Suite): string {
  const name = suite.name.toLowerCase();
  if (name.includes('auth') || name.includes('login') || name.includes('security')) return 'Segurança';
  if (name.includes('checkout') || name.includes('payment') || name.includes('billing')) return 'Receita';
  if (name.includes('api') || name.includes('health') || suite.type === 'api') return 'Plataforma';
  if (suite.type === 'web') return 'Produto';
  return 'Qualidade';
}

export function inferredCriticality(suite: Suite): 'baixa' | 'média' | 'alta' | 'bloqueante' {
  const name = suite.name.toLowerCase();
  if (name.includes('checkout') || name.includes('payment') || name.includes('billing') || name.includes('auth') || name.includes('login')) return 'bloqueante';
  if (name.includes('api') || name.includes('health') || name.includes('smoke')) return 'alta';
  if (suite.type === 'web') return 'média';
  return 'baixa';
}

export function statusDotClass(status: RunStatus): string {
  if (status === 'passed') return 'bg-[#1f7a50]';
  if (status === 'failed' || status === 'error') return 'bg-[#b43c2e]';
  if (status === 'queued' || status === 'running') return 'bg-[#c39420]';
  return 'bg-[#9da596]';
}

type TimelineRow = { name: string; status: RunStatus; startedAt?: string; durationMs?: number; error?: string; artifacts: Artifact[] };

export function timelineRows(report: RunReport | null, run?: Run): TimelineRow[] {
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

export function buildRunMarkdown({ suite, env, run, report }: { suite: Suite; env?: Environment; run?: Run; report: RunReport | null }): string {
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

export function countArtifactsByType(artifacts: Artifact[]): Record<string, number> {
  return artifacts.reduce<Record<string, number>>((counts, artifact) => {
    counts[artifact.type] = (counts[artifact.type] ?? 0) + 1;
    return counts;
  }, {});
}

export function formatArtifactCounts(counts: Record<string, number>): string {
  const entries = Object.entries(counts);
  if (entries.length === 0) return 'nenhuma';
  return entries.map(([type, count]) => `${count} ${artifactTypeLabel(type)}`).join(' · ');
}

export function artifactTypeLabel(type: string): string {
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

export function collectArtifacts(report: RunReport | null): Artifact[] {
  return dedupeArtifacts([
    ...(report?.artifacts ?? []),
    ...((report?.results ?? []).flatMap((result) => result.artifacts ?? [])),
  ]);
}

export function dedupeArtifacts(artifacts: Artifact[]): Artifact[] {
  const seen = new Set<string>();
  return artifacts.filter((artifact) => {
    const key = `${artifact.type}:${artifact.path}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function groupHttpArtifacts(artifacts: Artifact[]): Array<{ request?: Artifact; response?: Artifact }> {
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

export function runSummary(run: Run): string {
  if (run.error) return run.error;
  if (!run.summary) return 'Sem relatório final.';
  return `${run.summary.passed ?? 0}/${run.summary.total ?? 0} cenário(s) ok · ${run.summary.failed ?? 0} falha(s) · ${run.summary.error ?? 0} erro(s)`;
}

export function statusLabel(status: RunStatus): string {
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

export function formatDate(value?: string | null): string {
  if (!value) return '-';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

export function shortId(value: string): string {
  return value.slice(0, 8);
}

export function shortPath(value: string): string {
  return value.split('/').slice(-2).join('/');
}

export function suiteTypeLabel(type: Suite['type']): string {
  return type === 'web' ? 'Frontend' : 'API';
}

export function flowProjectLabel(flow: FlowLibraryItem, projects: Project[]): string {
  if (!flow.projectIds?.length) return 'todos';
  const names = flow.projectIds
    .map((id) => projects.find((project) => project.id === id)?.name)
    .filter(Boolean);
  if (names.length === 0) return `${flow.projectIds.length} projeto(s)`;
  if (names.length === 1) return names[0]!;
  return `${names.length} projetos`;
}

export function flowUseReference(namespace: string, name: string): string {
  const safeNamespace = namespace.trim() || 'namespace';
  const safeName = name.trim() || 'chave';
  return `${safeNamespace}.${safeName}`;
}

export function roughYamlListCount(value: string): number {
  return value.split('\n').filter((line) => /^\s*-\s+/.test(line)).length;
}

export function flowDraftProjectNames(draft: FlowDraft, projects: Project[]): string {
  const names = draft.projectIds
    .map((id) => projects.find((project) => project.id === id)?.name)
    .filter(Boolean);
  if (names.length === 0) return `${draft.projectIds.length} projeto(s)`;
  if (names.length <= 2) return names.join(', ');
  return `${names.slice(0, 2).join(', ')} +${names.length - 2}`;
}

export function redactStepText(value: string): string {
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

export function redactStepPayload(value: unknown): unknown {
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

export function redactPlainSensitive(value: string, prefix: string): string {
  if (!isSensitiveDescriptor(`${prefix} ${value}`)) return `${prefix}${value}`;
  return `${prefix}[REDACTED]`;
}

export function isSensitiveDescriptor(value: string): boolean {
  return /(authorization|cookie|set-cookie|token|secret|password|senha|api[-_ ]?key)/i.test(value);
}

export function artifactUrl(path: string): string {
  return `${apiBase}/artifacts?path=${encodeURIComponent(path)}`;
}

export function initials(value: string): string {
  const parts = value.split(/[\s@._-]+/).filter(Boolean);
  return (parts[0]?.[0] ?? 'U').concat(parts[1]?.[0] ?? '').toUpperCase();
}

export function parseVars(input: string): Record<string, string> {
  return Object.fromEntries(input.split('\n').filter(Boolean).map((line) => {
    const index = line.indexOf('=');
    if (index === -1) return [line.trim(), ''];
    return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
  }));
}

export function splitList(input: string): string[] {
  return input.split(/[\n,]/).map((item) => item.trim()).filter(Boolean);
}

export function mergeMembershipEdit(current: MembershipEdit, users: UserManagementItem[], organizations: Organization[]): MembershipEdit {
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

export function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
