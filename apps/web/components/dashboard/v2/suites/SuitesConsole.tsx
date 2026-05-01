'use client';

import { DashboardShell } from '../DashboardShell';
import {
  V2ConsoleProvider,
  useV2Console,
} from '../context/V2ConsoleProvider';
import { SuitesWorkspace } from './SuitesWorkspace';

export function SuitesConsole() {
  return (
    <V2ConsoleProvider section='suites'>
      <DashboardShell section='suites' title='Suites'>
        <SuitesConsoleContent />
      </DashboardShell>
    </V2ConsoleProvider>
  );
}

function SuitesConsoleContent() {
  const consoleState = useV2Console();

  return (
    <SuitesWorkspace
      suites={consoleState.projectSuites}
      draft={consoleState.suiteDraft}
      validation={consoleState.validation}
      busy={consoleState.busy}
      canWrite={consoleState.canWrite}
      projectId={consoleState.projectId}
      openApiDraft={consoleState.openApiDraft}
      approvedAiPatch={consoleState.approvedAiPatch}
      onDraftChange={consoleState.setSuiteDraft}
      onLoadSuite={consoleState.loadSuite}
      onNewSuite={consoleState.newSuiteDraft}
      onValidate={() => consoleState.validateSpec(true)}
      onSave={consoleState.saveSuite}
      onOpenApiDraftChange={consoleState.setOpenApiDraft}
      onApprovedAiPatchChange={consoleState.setApprovedAiPatch}
      onImportOpenApi={consoleState.importOpenApi}
    />
  );
}
