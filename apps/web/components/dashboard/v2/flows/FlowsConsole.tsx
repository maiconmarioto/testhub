'use client';

import { defaultFlowDraft } from '../constants';
import { DashboardShell } from '../DashboardShell';
import {
  V2ConsoleProvider,
  useV2Console,
} from '../context/V2ConsoleProvider';
import { FlowLibraryWorkspace } from './FlowLibraryWorkspace';

export function FlowsConsole() {
  return (
    <V2ConsoleProvider section='flows'>
      <DashboardShell section='flows' title='Flows'>
        <FlowsConsoleContent />
      </DashboardShell>
    </V2ConsoleProvider>
  );
}

function FlowsConsoleContent() {
  const consoleState = useV2Console();

  return (
    <FlowLibraryWorkspace
      flowLibrary={consoleState.flowLibrary}
      flowDraft={consoleState.flowDraft}
      projects={consoleState.projects}
      currentProjectId={consoleState.projectId}
      busy={consoleState.busy}
      canWrite={consoleState.canWrite}
      onFlowDraftChange={consoleState.setFlowDraft}
      onNewFlow={() => consoleState.setFlowDraft(defaultFlowDraft)}
      onEditFlow={consoleState.editFlow}
      onSaveFlow={consoleState.saveFlow}
      onArchiveFlow={consoleState.archiveFlow}
    />
  );
}
