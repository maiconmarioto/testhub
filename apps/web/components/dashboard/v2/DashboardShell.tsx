'use client';

import type React from 'react';
import { useV2Console } from './context/V2ConsoleProvider';
import { EvidenceDrawer, SidebarRail, TopBar } from './DashboardShellParts';
import { SuitePreviewDialog } from './suites/SuitePreviewDialog';
import type { ConsoleSection } from './types';
import { WizardDialog } from './wizard/WizardDialog';

export function DashboardShell({
  section,
  title,
  showWizardButton = false,
  children,
}: {
  section: ConsoleSection;
  title: string;
  showWizardButton?: boolean;
  children: React.ReactNode;
}) {
  const consoleState = useV2Console();

  return (
    <main className='min-h-screen bg-[#f4f2eb] text-[#1f241f]'>
      <div className='grid min-h-screen xl:grid-cols-[72px_minmax(0,1fr)]'>
        <SidebarRail section={section} consoleState={consoleState} />

        <section className='grid min-h-screen grid-rows-[auto_minmax(0,1fr)]'>
          <TopBar title={title} showWizardButton={showWizardButton} consoleState={consoleState} />

          <div className='grid min-h-0 content-start gap-4 p-4 md:p-5'>
            {children}
          </div>
          <EvidenceDrawer consoleState={consoleState} />
          <WizardDialog
            open={consoleState.wizardOpen}
            step={consoleState.wizardStep}
            draft={consoleState.wizardDraft}
            busy={consoleState.busy}
            onOpenChange={consoleState.setWizardOpen}
            onStepChange={consoleState.setWizardStep}
            onDraftChange={consoleState.setWizardDraft}
            onFinish={consoleState.finishWizard}
          />
          <SuitePreviewDialog
            open={consoleState.suitePreviewOpen}
            suite={consoleState.suitePreview}
            projectId={consoleState.projectId}
            onOpenChange={consoleState.setSuitePreviewOpen}
          />
        </section>
      </div>
    </main>
  );
}
