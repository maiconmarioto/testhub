'use client';

import { Bot, FileCode2, Square, WandSparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import type { Artifact, Environment, EvidenceTab, Run, RunReport, Suite } from '../types';
import { summarize } from '../shared/runUtils';
import { Score, Status } from '../shared/ui';
import { ArtifactEvidence, EvidenceTabContent, OtherRuns, OverviewEvidence, PayloadEvidence, TimelineEvidence } from './EvidenceTabs';

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
