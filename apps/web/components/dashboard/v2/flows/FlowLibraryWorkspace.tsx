'use client';

import { useState } from 'react';
import { Bot, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import type { FlowDraft, FlowLibraryItem, Project } from '../types';
import { flowUseReference, roughYamlListCount } from '../shared/flowUtils';
import { Field, MetricPill } from '../shared/ui';
import { YamlEditor } from '../yaml/YamlEditor';
import { FlowHumanPreview, FlowStepHeader } from './FlowBuilderPreview';
import { FlowBuilderDialog } from './FlowBuilderDialog';
import { FlowLibraryList } from './FlowLibraryList';
import { FlowScopeDialog } from './FlowScopeDialog';
import { useFlowBuilderState } from './useFlowBuilderState';

export function FlowLibraryWorkspace(props: {
  flowLibrary: FlowLibraryItem[];
  flowDraft: FlowDraft;
  projects: Project[];
  currentProjectId: string;
  busy: boolean;
  canWrite: boolean;
  onFlowDraftChange: (draft: FlowDraft) => void;
  onNewFlow: () => void;
  onEditFlow: (flow: FlowLibraryItem) => void;
  onSaveFlow: () => void;
  onArchiveFlow: (flowId: string) => void;
}) {
  const [search, setSearch] = useState('');
  const [scopeDialogOpen, setScopeDialogOpen] = useState(false);
  const {
    builderDialogOpen,
    setBuilderDialogOpen,
    builderSteps,
    selectedBuilderStepIndex,
    setSelectedBuilderStepIndex,
    builderApplied,
    draggedBuilderStepIndex,
    dragOverBuilderStepIndex,
    builderPreview,
    flowPreview,
    openBuilder,
    appendBuilderStep,
    updateBuilderStep,
    removeBuilderStep,
    moveBuilderStep,
    startBuilderStepDrag,
    overBuilderStepDrag,
    dropBuilderStep,
    endBuilderStepDrag,
    applyBuilderSteps,
    setDragOverBuilderStepIndex,
  } = useFlowBuilderState(props.flowDraft, props.onFlowDraftChange);
  const currentProjectFlows = props.currentProjectId
    ? props.flowLibrary.filter((flow) => !flow.projectIds?.length || flow.projectIds.includes(props.currentProjectId))
    : props.flowLibrary;
  const visibleFlows = props.flowLibrary.filter((flow) => {
    const query = search.trim().toLowerCase();
    if (!query) return true;
    return [flow.displayName, flow.name, flow.namespace, flow.description]
      .filter(Boolean)
      .some((value) => value!.toLowerCase().includes(query));
  });
  const flowDraftAllProjects = props.flowDraft.projectIds.length === 0;
  const selectedFlow = props.flowLibrary.find((flow) => flow.id === props.flowDraft.id);
  const draftReference = flowUseReference(props.flowDraft.namespace, props.flowDraft.name);
  const draftStepCount = roughYamlListCount(props.flowDraft.steps);
  const draftParamCount = roughYamlListCount(props.flowDraft.params);
  const canSaveFlow = !props.busy && props.canWrite && Boolean(props.flowDraft.displayName.trim() && props.flowDraft.namespace.trim() && props.flowDraft.name.trim() && props.flowDraft.steps.trim());
  const requestSaveFlow = () => {
    if (!canSaveFlow) return;
    setScopeDialogOpen(true);
  };
  const confirmSaveFlow = () => {
    setScopeDialogOpen(false);
    props.onSaveFlow();
  };
  return (
    <div className="grid min-h-0 content-start gap-4">
      <section className="rounded-xl border border-[#e8e6dc] bg-[#faf9f5] p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-[#788c5d]">Mesa de flows</p>
            <h1 className="mt-1 truncate text-2xl font-black tracking-normal text-[#141413]">{props.flowDraft.id ? props.flowDraft.displayName || 'Flow selecionado' : 'Novo flow reutilizável'}</h1>
            <p className="mt-1 text-sm text-[#66705f]">Escolha um flow, ajuste propriedades e mantenha o YAML na área principal.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <MetricPill label="Total" value={props.flowLibrary.length} tone="neutral" />
            <MetricPill label="Projeto" value={currentProjectFlows.length} tone="good" />
            <MetricPill label="Steps" value={draftStepCount || selectedFlow?.steps.length || 0} tone={draftStepCount > 0 || selectedFlow ? 'good' : 'warn'} />
          </div>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
        <FlowLibraryList
          visibleFlows={visibleFlows}
          currentProjectFlowsCount={currentProjectFlows.length}
          selectedFlowId={props.flowDraft.id}
          projects={props.projects}
          currentProjectId={props.currentProjectId}
          search={search}
          busy={props.busy}
          canWrite={props.canWrite}
          onSearchChange={setSearch}
          onNewFlow={props.onNewFlow}
          onEditFlow={props.onEditFlow}
          onArchiveFlow={props.onArchiveFlow}
        />

        <Card className="overflow-hidden">
          <CardHeader className="border-b border-[#e8e6dc] bg-[#faf9f5] pb-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#788c5d]">{props.flowDraft.id ? 'Flow selecionado' : 'Novo flow'}</p>
                <CardTitle className="mt-1 truncate text-2xl text-[#141413]">{props.flowDraft.displayName || 'Sem nome'}</CardTitle>
                <CardDescription className="mt-1">{props.flowDraft.description || 'Propriedades à esquerda. YAML à direita.'}</CardDescription>
                <div className="mt-3 flex flex-wrap gap-2">
                  {flowDraftAllProjects ? (
                    <Badge variant="success">todos os projetos</Badge>
                  ) : props.flowDraft.projectIds.length > 0 ? (
                    props.flowDraft.projectIds.map((projectId) => (
                      <Badge key={projectId} variant="outline">{props.projects.find((project) => project.id === projectId)?.name ?? 'Projeto'}</Badge>
                    ))
                  ) : (
                    <Badge variant="warning">sem escopo selecionado</Badge>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <code className="rounded-md border border-[#e8e6dc] bg-white px-3 py-2 font-mono text-sm font-bold text-[#141413]">use: {draftReference}</code>
                <Button variant="outline" onClick={openBuilder}><Bot data-icon="inline-start" />Builder visual</Button>
                <Button variant="outline" onClick={props.onNewFlow}>Limpar</Button>
                <Button onClick={requestSaveFlow} disabled={!canSaveFlow}>{props.busy ? <Loader2 data-icon="inline-start" className="animate-spin" /> : null}Salvar flow</Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="grid min-h-[720px] lg:grid-cols-[340px_minmax(0,1fr)]">
              <aside className="grid content-start gap-5 border-b border-[#e8e6dc] bg-[#faf9f5] p-4 lg:border-b-0 lg:border-r">
                <section className="grid gap-3">
                  <FlowStepHeader index={1} title="Identidade" description="Nome e referência técnica." />
                  <Field label="Nome do flow"><Input value={props.flowDraft.displayName} onChange={(event) => props.onFlowDraftChange({ ...props.flowDraft, displayName: event.target.value })} placeholder="Login com senha" /></Field>
                  <Field label="Namespace"><Input value={props.flowDraft.namespace} onChange={(event) => props.onFlowDraftChange({ ...props.flowDraft, namespace: event.target.value })} placeholder="auth" /></Field>
                  <Field label="Chave YAML"><Input value={props.flowDraft.name} onChange={(event) => props.onFlowDraftChange({ ...props.flowDraft, name: event.target.value })} placeholder="login" /></Field>
                  <Field label="Descrição"><Input value={props.flowDraft.description} onChange={(event) => props.onFlowDraftChange({ ...props.flowDraft, description: event.target.value })} placeholder="Opcional" /></Field>
                </section>

                <Separator />

                <section className="grid gap-3">
                  <FlowStepHeader index={2} title="Resumo" description="Antes de salvar." />
                  <div className="rounded-lg border border-[#e8e6dc] bg-white p-3">
                    <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#66705f]">use</p>
                    <code className="mt-1 block truncate font-mono text-sm font-bold">use: {draftReference}</code>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <MetricPill label="Params" value={draftParamCount} tone="neutral" />
                    <MetricPill label="Steps" value={draftStepCount} tone={draftStepCount > 0 ? 'good' : 'warn'} />
                  </div>
                </section>
              </aside>

              <section className="grid content-start gap-4 bg-white p-4">
                <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_320px]">
                  <div className="grid content-start gap-4">
                    <div className="rounded-lg border border-[#e8e6dc] bg-[#141413] p-4 text-[#faf9f5]">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#b0aea5]">Contrato do flow</p>
                          <p className="mt-1 text-lg font-black">{props.flowDraft.displayName || 'Sem nome'}</p>
                        </div>
                        <div className="flex gap-2">
                          <Badge variant="outline" className="border-[#b0aea5] text-[#faf9f5]">{draftParamCount} params</Badge>
                          <Badge variant="outline" className="border-[#b0aea5] text-[#faf9f5]">{draftStepCount} steps</Badge>
                        </div>
                      </div>
                      <code className="mt-3 block truncate rounded-md bg-black/30 px-3 py-2 font-mono text-sm text-[#faf9f5]">use: {draftReference}</code>
                    </div>

                    <Field label="Params YAML">
                      <YamlEditor value={props.flowDraft.params} onChange={(value) => props.onFlowDraftChange({ ...props.flowDraft, params: value })} validateSpec={false} validationMode="flowParams" height="150px" />
                    </Field>
                    <Field label="Steps YAML">
                      <YamlEditor value={props.flowDraft.steps} onChange={(value) => props.onFlowDraftChange({ ...props.flowDraft, steps: value })} validateSpec={false} validationMode="flowSteps" height="520px" />
                    </Field>
                  </div>

                  <FlowHumanPreview rows={flowPreview} />
                </div>
              </section>
            </div>
          </CardContent>
        </Card>
      </div>
      <FlowScopeDialog
        open={scopeDialogOpen}
        flowDraft={props.flowDraft}
        projects={props.projects}
        busy={props.busy}
        canSaveFlow={canSaveFlow}
        onOpenChange={setScopeDialogOpen}
        onFlowDraftChange={props.onFlowDraftChange}
        onConfirmSave={confirmSaveFlow}
      />
      <FlowBuilderDialog
        open={builderDialogOpen}
        onOpenChange={setBuilderDialogOpen}
        flowDraft={props.flowDraft}
        builderPreview={builderPreview}
        builderApplied={builderApplied}
        builderSteps={builderSteps}
        selectedBuilderStepIndex={selectedBuilderStepIndex}
        setSelectedBuilderStepIndex={setSelectedBuilderStepIndex}
        dragOverBuilderStepIndex={dragOverBuilderStepIndex}
        draggedBuilderStepIndex={draggedBuilderStepIndex}
        appendBuilderStep={appendBuilderStep}
        overBuilderStepDrag={overBuilderStepDrag}
        dropBuilderStep={dropBuilderStep}
        setDragOverBuilderStepIndex={setDragOverBuilderStepIndex}
        startBuilderStepDrag={startBuilderStepDrag}
        endBuilderStepDrag={endBuilderStepDrag}
        updateBuilderStep={updateBuilderStep}
        removeBuilderStep={removeBuilderStep}
        moveBuilderStep={moveBuilderStep}
        applyBuilderSteps={applyBuilderSteps}
      />
    </div>
  );
}
