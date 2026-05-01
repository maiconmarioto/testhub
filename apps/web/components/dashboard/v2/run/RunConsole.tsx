'use client';

import { DashboardShell } from '../DashboardShell';
import {
  V2ConsoleProvider,
  useV2Console,
} from '../context/V2ConsoleProvider';
import { RunWorkspace } from './RunWorkspace';

export function RunConsole() {
  return (
    <V2ConsoleProvider section='run'>
      <DashboardShell section='run' title='Execuções' showWizardButton>
        <RunConsoleContent />
      </DashboardShell>
    </V2ConsoleProvider>
  );
}

function RunConsoleContent() {
  const consoleState = useV2Console();

  return (
    <RunWorkspace
      selectedSuite={consoleState.selectedSuite}
      selectedEnv={consoleState.selectedEnv}
      suites={consoleState.projectSuites}
      envs={consoleState.projectEnvs}
      selectedRun={consoleState.selectedRun}
      stats={consoleState.stats}
      runs={consoleState.scopedRuns}
      latestRuns={consoleState.projectRuns}
      selectedRunId={consoleState.selectedRun?.id}
      projectId={consoleState.projectId}
      projectName={consoleState.selectedProject?.name}
      suiteSearch={consoleState.suiteSearch}
      suiteTypeFilter={consoleState.suiteTypeFilter}
      busy={consoleState.busy}
      canRun={Boolean(
        consoleState.projectId &&
          consoleState.environmentId &&
          consoleState.suiteId &&
          consoleState.canWrite,
      )}
      canManageRuns={consoleState.canWrite}
      report={consoleState.report}
      onSuiteSearchChange={consoleState.setSuiteSearch}
      onSuiteTypeFilterChange={consoleState.setSuiteTypeFilter}
      onRun={consoleState.runSuite}
      onRunSuite={(suite, env) =>
        consoleState.runSuiteFor({
          projectId: consoleState.projectId,
          suiteId: suite.id,
          environmentId: env?.id ?? consoleState.environmentId,
        })
      }
      onSelectSuite={consoleState.selectSuite}
      onSelectRun={run => {
        consoleState.setSuiteId(run.suiteId);
        consoleState.setEnvironmentId(run.environmentId);
        consoleState.setSelectedRunId(run.id);
        consoleState.setTab('overview');
      }}
      onDeleteRun={consoleState.deleteRun}
      onCancelRun={consoleState.cancelRun}
      onOpenSuites={consoleState.openSuitePreview}
      onOpenEnvironments={() =>
        window.location.assign(
          consoleState.projectId
            ? `/projects?project=${consoleState.projectId}`
            : '/projects',
        )
      }
      onOpenEvidence={() => consoleState.setOpenSheet('evidence')}
    />
  );
}
