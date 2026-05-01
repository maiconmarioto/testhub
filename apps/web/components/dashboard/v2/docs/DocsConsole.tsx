'use client';

import { DashboardShell } from '../DashboardShell';
import { V2ConsoleProvider } from '../context/V2ConsoleProvider';
import { DocumentationWorkspace } from './DocumentationWorkspace';

export function DocsConsole() {
  return (
    <V2ConsoleProvider section='docs'>
      <DashboardShell section='docs' title='Documentação'>
        <DocumentationWorkspace />
      </DashboardShell>
    </V2ConsoleProvider>
  );
}
