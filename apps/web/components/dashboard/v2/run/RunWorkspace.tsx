'use client';

import { Fragment, useState } from 'react';
import { CheckCircle2, ChevronDown, ClipboardCheck, Copy, Database, FileCode2, Film, Loader2, Play, Square, Trash2, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { controlClass } from '../constants';
import type { Environment, Run, RunReport, Suite } from '../types';
import { ArtifactLink, DarkEmpty, Field, InfoLine, MetricPill, Status, StatusDot, artifactUrl, buildRunMarkdown, collectArtifacts, formatDate, inferredCriticality, inferredOwner, latestRun, redactStepText, runSummary, shortId, shortPath, statusDotClass, statusLabel, suiteTypeLabel, summarize, timelineRows } from '../shared';
import { LiveProgress } from './LiveProgress';

export function RunWorkspace(props: {
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
