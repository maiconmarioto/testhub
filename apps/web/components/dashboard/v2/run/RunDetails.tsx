'use client';

import { useState } from 'react';
import { ClipboardCheck, Copy, Database, FileCode2, Film, Loader2, Play, Square } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { Environment, Run, RunReport, Suite } from '../types';
import { ArtifactLink } from '../shared/artifacts';
import {
  artifactUrl,
  buildRunMarkdown,
  collectArtifacts,
  formatDate,
  inferredCriticality,
  inferredOwner,
  redactStepText,
  runSummary,
  shortId,
  shortPath,
  statusLabel,
  suiteTypeLabel,
  summarize,
  timelineRows,
} from '../shared/runUtils';
import { DarkEmpty, InfoLine, MetricPill, Status } from '../shared/ui';
import { FailureInbox, HealthMatrix, SuiteRunHistory } from './RunHistory';
import { LiveProgress } from './LiveProgress';

export function SuiteDetailPanel(props: {
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
