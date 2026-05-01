'use client';

import { Fragment, useState } from 'react';
import { ChevronDown, ClipboardCheck, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { Environment, Run, Suite } from '../types';
import { formatDate, latestRun, runSummary, shortId, statusDotClass } from '../shared/runUtils';
import { DarkEmpty, Status } from '../shared/ui';

export function SuiteRunHistory(props: { runs: Run[]; suite: Suite; env?: Environment; selectedRunId?: string; canManageRuns: boolean; busy: boolean; onSelectRun: (run: Run) => void; onDeleteRun: (run: Run) => Promise<void> }) {
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

export function HealthMatrix({ suites, envs, runs, selectedSuiteId, selectedEnvId, onSelectCell }: { suites: Suite[]; envs: Environment[]; runs: Run[]; selectedSuiteId?: string; selectedEnvId?: string; onSelectCell: (suite: Suite, env: Environment, run?: Run) => void }) {
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

export function FailureInbox({ runs, suites, envs, onSelectRun }: { runs: Run[]; suites: Suite[]; envs: Environment[]; onSelectRun: (run: Run) => void }) {
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

export function RunsSection({ title, description, count, defaultOpen = true, children }: { title: string; description: string; count: number; defaultOpen?: boolean; children: React.ReactNode }) {
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
