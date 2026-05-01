'use client';

import type React from 'react';
import {
  BookOpen,
  FileCode2,
  FolderKanban,
  GitBranch,
  Play,
  Settings2,
  ShieldAlert,
  TerminalSquare,
  WandSparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { darkSelectClass } from './constants';
import { EvidenceColumn } from './evidence/EvidenceSheet';
import {
  Field,
  RailLink,
  Signal,
  UserSidebarMenu,
  runSummary,
  shortId,
} from './shared';
import { useV2Console } from './context/V2ConsoleProvider';
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
        <aside className='hidden border-r border-[#d8d3c5] bg-[#111611] xl:block'>
          <div className='flex h-screen flex-col items-center justify-between py-5'>
            <div className='grid gap-4'>
              <div className='grid h-11 w-11 place-items-center rounded-lg bg-[#d7e35f] text-[#111611]'>
                <TerminalSquare className='h-6 w-6' />
              </div>
              <RailLink
                icon={Play}
                active={section === 'run'}
                label='Execuções'
                href='/v2'
              />
              <RailLink
                icon={FolderKanban}
                active={section === 'projects'}
                label='Projetos'
                href={
                  consoleState.projectId
                    ? `/projects?project=${consoleState.projectId}`
                    : '/projects'
                }
              />
              <RailLink
                icon={FileCode2}
                active={section === 'suites'}
                label='Suites'
                href={
                  consoleState.projectId
                    ? `/suites?project=${consoleState.projectId}`
                    : '/suites'
                }
              />
              <RailLink
                icon={GitBranch}
                active={section === 'flows'}
                label='Flows'
                href='/flows'
              />
              <RailLink
                icon={BookOpen}
                active={section === 'docs'}
                label='Docs'
                href='/docs'
              />
              <RailLink
                icon={Settings2}
                active={section === 'settings'}
                label='Sistema'
                href='/settings'
              />
            </div>
            <UserSidebarMenu
              me={consoleState.me}
              role={consoleState.role}
              busy={consoleState.busy}
              onLogout={consoleState.logout}
            />
          </div>
        </aside>

        <section className='grid min-h-screen grid-rows-[auto_minmax(0,1fr)]'>
          <header className='border-b border-[#d8d3c5] bg-[#fbfaf6]/95 px-5 py-3 backdrop-blur md:px-8'>
            <div className='flex flex-wrap items-center justify-between gap-3'>
              <div>
                <p className='font-mono text-[10px] uppercase tracking-[0.28em] text-[#66705f]'>
                  TestHub v2
                </p>
                {showWizardButton ? (
                  <Button
                    type='button'
                    className='mt-1 h-9 rounded-md px-3 text-base font-extrabold'
                    onClick={() => consoleState.setWizardOpen(true)}
                  >
                    <WandSparkles className='h-4 w-4' />
                    Wizard
                  </Button>
                ) : (
                  <h1 className='text-2xl font-extrabold tracking-normal'>
                    {title}
                  </h1>
                )}
              </div>
              <div className='flex flex-wrap items-end gap-2'>
                <Field label='Projeto'>
                  <Select
                    value={consoleState.projectId}
                    onValueChange={value => {
                      consoleState.setProjectId(value);
                      consoleState.setEnvironmentId('');
                      consoleState.setSuiteId('');
                      consoleState.setSelectedRunId('');
                      consoleState.setTab('overview');
                    }}
                  >
                    <SelectTrigger className={darkSelectClass}>
                      <SelectValue placeholder='Projeto' />
                    </SelectTrigger>
                    <SelectContent>
                      {consoleState.projects.map(project => (
                        <SelectItem key={project.id} value={project.id}>
                          {project.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label='Ambiente'>
                  <Select
                    value={consoleState.environmentId}
                    onValueChange={value => {
                      consoleState.setEnvironmentId(value);
                      consoleState.setSelectedRunId('');
                      consoleState.setTab('overview');
                    }}
                  >
                    <SelectTrigger className={darkSelectClass}>
                      <SelectValue placeholder='Ambiente' />
                    </SelectTrigger>
                    <SelectContent>
                      {consoleState.projectEnvs.map(env => (
                        <SelectItem key={env.id} value={env.id}>
                          {env.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
            </div>
            {consoleState.error || consoleState.notice ? (
              <div className='mt-4 grid gap-2'>
                {consoleState.error ? (
                  <Signal tone='bad' text={consoleState.error} />
                ) : null}
                {consoleState.notice ? (
                  <Signal tone='good' text={consoleState.notice} />
                ) : null}
              </div>
            ) : null}
            {consoleState.security?.secrets.defaultKey ? (
              <div className='mt-4 flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900'>
                <ShieldAlert className='h-4 w-4 shrink-0' />
                <span>
                  TESTHUB_SECRET_KEY default. Troque antes de produção; gravação
                  de secrets fica bloqueada em produção.
                </span>
              </div>
            ) : null}
          </header>

          <div className='grid min-h-0 content-start gap-4 p-4 md:p-5'>
            {children}
          </div>
          <Sheet
            open={consoleState.openSheet === 'evidence'}
            onOpenChange={open =>
              consoleState.setOpenSheet(open ? 'evidence' : null)
            }
          >
            <SheetContent className='w-full overflow-hidden p-0 sm:max-w-2xl md:max-w-3xl lg:max-w-5xl'>
              <SheetHeader className='border-b px-5 py-4 pr-12'>
                <SheetTitle className='text-lg'>Evidências</SheetTitle>
                <SheetDescription>
                  {consoleState.selectedRun
                    ? `${shortId(consoleState.selectedRun.id)} · ${runSummary(consoleState.selectedRun)}`
                    : 'Selecione uma execução para ver evidências.'}
                </SheetDescription>
              </SheetHeader>
              <EvidenceColumn
                runs={consoleState.scopedRuns}
                selectedRun={consoleState.selectedRun}
                selectedSuite={consoleState.selectedSuite}
                selectedEnv={consoleState.selectedEnv}
                report={consoleState.report}
                stats={consoleState.stats}
                tab={consoleState.tab}
                setTab={consoleState.setTab}
                videos={
                  consoleState.selectedSuite?.type === 'web'
                    ? consoleState.videos
                    : []
                }
                payloads={consoleState.payloads}
                artifacts={consoleState.artifacts}
                onSelectRun={run => {
                  consoleState.setSuiteId(run.suiteId);
                  consoleState.setEnvironmentId(run.environmentId);
                  consoleState.setSelectedRunId(run.id);
                  consoleState.setTab('overview');
                }}
                onCancel={consoleState.cancelRun}
                onExplain={consoleState.explainFailure}
                onSuggestFix={run =>
                  consoleState.runAi(
                    'suggest-test-fix',
                    run,
                    'Sugestão de correção gerada.',
                  )
                }
                onSuggestCases={run =>
                  consoleState.runAi(
                    'suggest-test-cases',
                    run,
                    'Sugestão de casos gerada.',
                  )
                }
                aiOutput={consoleState.aiOutput}
              />
            </SheetContent>
          </Sheet>
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
