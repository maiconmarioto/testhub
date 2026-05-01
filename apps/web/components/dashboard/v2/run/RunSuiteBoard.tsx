'use client';

import { Loader2, Play } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { controlClass } from '../constants';
import type { Environment, Run, Suite } from '../types';
import { inferredCriticality, inferredOwner, latestRun, runSummary, suiteTypeLabel } from '../shared/runUtils';
import { DarkEmpty, StatusDot } from '../shared/ui';

export function SuiteBoard(props: {
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
