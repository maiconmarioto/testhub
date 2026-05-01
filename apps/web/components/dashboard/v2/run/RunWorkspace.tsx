'use client';

import type { Environment, Run, RunReport, Suite } from '../types';
import { summarize } from '../shared/runUtils';
import { MetricPill } from '../shared/ui';
import { SuiteDetailPanel } from './RunDetails';
import { SuiteBoard } from './RunSuiteBoard';

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
