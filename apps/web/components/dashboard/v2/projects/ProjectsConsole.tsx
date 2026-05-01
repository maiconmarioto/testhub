'use client';

import { DashboardShell } from '../DashboardShell';
import {
  V2ConsoleProvider,
  useV2Console,
} from '../context/V2ConsoleProvider';
import { ProjectsWorkspace } from './ProjectsWorkspace';

export function ProjectsConsole() {
  return (
    <V2ConsoleProvider section='projects'>
      <DashboardShell section='projects' title='Projetos'>
        <ProjectsConsoleContent />
      </DashboardShell>
    </V2ConsoleProvider>
  );
}

function ProjectsConsoleContent() {
  const consoleState = useV2Console();

  return (
    <ProjectsWorkspace
      projects={consoleState.projects}
      envs={consoleState.projectEnvs}
      suites={consoleState.projectSuites}
      runs={consoleState.projectRuns}
      selectedProjectId={consoleState.projectId}
      projectDraft={consoleState.projectDraft}
      envDraft={consoleState.envDraft}
      busy={consoleState.busy}
      canWrite={consoleState.canWrite}
      canAdmin={consoleState.canAdmin}
      onSelectProject={id => {
        consoleState.setProjectId(id);
        consoleState.setEnvironmentId('');
        consoleState.setSuiteId('');
        consoleState.setSelectedRunId('');
      }}
      onProjectDraftChange={consoleState.setProjectDraft}
      onSaveProject={consoleState.saveProject}
      onNewProject={() =>
        consoleState.setProjectDraft({
          id: '',
          name: '',
          description: '',
          retentionDays: String(consoleState.security?.retention.days ?? 30),
          cleanupArtifacts: false,
        })
      }
      onArchiveProject={consoleState.archiveProject}
      onEnvDraftChange={consoleState.setEnvDraft}
      onEditEnv={consoleState.editEnvironment}
      onNewEnv={consoleState.newEnvironmentDraft}
      onSaveEnv={consoleState.saveEnvironment}
      onArchiveEnv={consoleState.archiveEnvironment}
    />
  );
}
