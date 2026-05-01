'use client';

import { Bot, FileCode2, Film, Loader2, Square, WandSparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { Artifact, Environment, EvidenceTab, Run, RunReport, Suite } from '../types';
import { useArtifactJsonQuery } from '../query/useArtifactQueries';
import { LiveProgress } from '../run/LiveProgress';
import { ArtifactLink } from '../shared/artifacts';
import { messageOf } from '../shared/formUtils';
import { artifactUrl, dedupeArtifacts, formatDate, groupHttpArtifacts, runSummary, shortId, shortPath, summarize, timelineRows } from '../shared/runUtils';
import { DarkEmpty, MetricPill, Score, Status } from '../shared/ui';

export function EvidenceColumn(props: {
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
  const payloadQuery = useArtifactJsonQuery(artifact.path);
  return (
    <div className="rounded-lg border border-[#e1ddd1] bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="font-bold">{artifact.label ?? artifact.type}</span>
        <Badge variant={artifact.type === 'response' ? 'secondary' : 'outline'}>{artifact.type}</Badge>
      </div>
      {payloadQuery.error ? <p className="mt-3 text-sm text-[#ffb4a8]">{messageOf(payloadQuery.error)}</p> : null}
      <pre className="mt-3 max-h-96 overflow-auto rounded-lg bg-[#0b100c] p-3 font-mono text-xs leading-5 text-[#f7f6f0]">{payloadQuery.data ? JSON.stringify(payloadQuery.data, null, 2) : 'Carregando...'}</pre>
    </div>
  );
}
