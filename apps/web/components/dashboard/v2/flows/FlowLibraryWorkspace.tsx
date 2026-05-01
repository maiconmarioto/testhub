'use client';

import { useState } from 'react';
import type React from 'react';
import { Bot, Copy, GripVertical, Loader2, Trash2 } from 'lucide-react';
import YAML from 'yaml';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { controlClass } from '../constants';
import type { FlowDraft, FlowLibraryItem, Project } from '../types';
import { DarkEmpty, Field, MetricPill, flowProjectLabel, flowUseReference, roughYamlListCount } from '../shared';
import { YamlEditor } from '../yaml/YamlEditor';
import { FlowHumanPreview, FlowStepHeader } from './FlowBuilderPreview';
import { FlowStepInspector } from './FlowStepInspector';
import type { FlowStepTemplate } from './flowBuilderTypes';
import { cloneFlowStep, describeFlowStep, flowStepPreviewRows, flowStepTemplates, parseFlowStepsYaml } from './flowBuilderUtils';

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
  const [builderDialogOpen, setBuilderDialogOpen] = useState(false);
  const [builderSteps, setBuilderSteps] = useState<unknown[]>([]);
  const [selectedBuilderStepIndex, setSelectedBuilderStepIndex] = useState(0);
  const [builderApplied, setBuilderApplied] = useState(true);
  const [draggedBuilderStepIndex, setDraggedBuilderStepIndex] = useState<number | null>(null);
  const [dragOverBuilderStepIndex, setDragOverBuilderStepIndex] = useState<number | null>(null);
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
  const toggleProject = (projectId: string, checked: boolean) => {
    const next = checked
      ? [...new Set([...props.flowDraft.projectIds, projectId])]
      : props.flowDraft.projectIds.filter((id) => id !== projectId);
    props.onFlowDraftChange({ ...props.flowDraft, projectIds: next });
  };
  const selectedFlow = props.flowLibrary.find((flow) => flow.id === props.flowDraft.id);
  const draftReference = flowUseReference(props.flowDraft.namespace, props.flowDraft.name);
  const draftStepCount = roughYamlListCount(props.flowDraft.steps);
  const draftParamCount = roughYamlListCount(props.flowDraft.params);
  const flowPreview = flowStepPreviewRows(props.flowDraft.steps);
  const builderPreview = builderSteps.map((step, index) => describeFlowStep(step, index + 1));
  const canSaveFlow = !props.busy && props.canWrite && Boolean(props.flowDraft.displayName.trim() && props.flowDraft.namespace.trim() && props.flowDraft.name.trim() && props.flowDraft.steps.trim());
  const requestSaveFlow = () => {
    if (!canSaveFlow) return;
    setScopeDialogOpen(true);
  };
  const confirmSaveFlow = () => {
    setScopeDialogOpen(false);
    props.onSaveFlow();
  };
  const openBuilder = () => {
    const nextSteps = parseFlowStepsYaml(props.flowDraft.steps);
    setBuilderSteps(nextSteps);
    setSelectedBuilderStepIndex(Math.min(selectedBuilderStepIndex, Math.max(0, nextSteps.length - 1)));
    setBuilderApplied(true);
    setBuilderDialogOpen(true);
  };
  const appendBuilderStep = (template: FlowStepTemplate) => {
    setBuilderSteps((current) => {
      const next = [...current, cloneFlowStep(template.step)];
      setSelectedBuilderStepIndex(next.length - 1);
      return next;
    });
    setBuilderApplied(false);
  };
  const updateBuilderStep = (index: number, step: unknown) => {
    setBuilderSteps((current) => current.map((item, itemIndex) => itemIndex === index ? step : item));
    setBuilderApplied(false);
  };
  const removeBuilderStep = (index: number) => {
    setBuilderSteps((current) => {
      const next = current.filter((_, itemIndex) => itemIndex !== index);
      setSelectedBuilderStepIndex(Math.max(0, Math.min(index, next.length - 1)));
      return next;
    });
    setBuilderApplied(false);
  };
  const moveBuilderStep = (index: number, direction: -1 | 1) => {
    reorderBuilderStep(index, index + direction);
  };
  const reorderBuilderStep = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    setBuilderSteps((current) => {
      if (fromIndex < 0 || toIndex < 0 || fromIndex >= current.length || toIndex >= current.length) return current;
      const next = [...current];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      setSelectedBuilderStepIndex(toIndex);
      return next;
    });
    setBuilderApplied(false);
  };
  const startBuilderStepDrag = (event: React.DragEvent, index: number) => {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', String(index));
    setDraggedBuilderStepIndex(index);
    setDragOverBuilderStepIndex(index);
  };
  const overBuilderStepDrag = (event: React.DragEvent, index: number) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setDragOverBuilderStepIndex(index);
  };
  const dropBuilderStep = (event: React.DragEvent, index: number) => {
    event.preventDefault();
    const transferredIndex = Number(event.dataTransfer.getData('text/plain'));
    const fromIndex = draggedBuilderStepIndex ?? transferredIndex;
    if (Number.isInteger(fromIndex)) reorderBuilderStep(fromIndex, index);
    setDraggedBuilderStepIndex(null);
    setDragOverBuilderStepIndex(null);
  };
  const endBuilderStepDrag = () => {
    setDraggedBuilderStepIndex(null);
    setDragOverBuilderStepIndex(null);
  };
  const applyBuilderSteps = () => {
    props.onFlowDraftChange({ ...props.flowDraft, steps: YAML.stringify(builderSteps).trim() });
    setBuilderApplied(true);
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
        <Card className="overflow-hidden xl:sticky xl:top-4 xl:max-h-[calc(100vh-9rem)]">
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle>Biblioteca</CardTitle>
                <CardDescription>{visibleFlows.length} visíveis · {currentProjectFlows.length} compatíveis</CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={props.onNewFlow}>Novo</Button>
            </div>
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar flow" className={cn(controlClass, 'mt-2')} />
          </CardHeader>
          <CardContent className="max-h-[calc(100vh-17rem)] overflow-auto pr-3">
            <div className="grid gap-2">
              {visibleFlows.map((flow) => {
                const outOfProject = Boolean(props.currentProjectId && flow.projectIds?.length && !flow.projectIds.includes(props.currentProjectId));
                return (
                  <article key={flow.id} className={cn('grid gap-2 rounded-lg border bg-white p-3 transition', props.flowDraft.id === flow.id ? 'border-[#151915] shadow-[inset_4px_0_0_#c7d957]' : 'border-[#e1ddd1] hover:border-[#9fb25a]')}>
                    <button type="button" className="grid min-w-0 gap-1 text-left" onClick={() => props.onEditFlow(flow)}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h2 className="truncate text-base font-extrabold" title={flow.displayName || flow.name}>{flow.displayName || flow.name}</h2>
                          <p className="truncate font-mono text-xs text-[#66705f]">use: {flow.namespace}.{flow.name}</p>
                        </div>
                        <Badge variant={outOfProject ? 'muted' : 'success'}>{flowProjectLabel(flow, props.projects)}</Badge>
                      </div>
                      <p className="line-clamp-2 text-xs text-[#66705f]">{flow.description || `${flow.steps.length} passo(s)`}</p>
                    </button>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-[#66705f]">{flow.steps.length} passo(s)</span>
                      <span className="flex shrink-0 gap-2">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="outline" size="icon" aria-label="Copiar referência" onClick={() => navigator.clipboard?.writeText(`use: ${flow.namespace}.${flow.name}`)}>
                              <Copy className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Copiar use</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="outline" size="icon" aria-label="Arquivar flow" onClick={() => props.onArchiveFlow(flow.id)} disabled={props.busy || !props.canWrite}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Arquivar</TooltipContent>
                        </Tooltip>
                      </span>
                    </div>
                  </article>
                );
              })}
              {visibleFlows.length === 0 ? <DarkEmpty text="Nenhum flow encontrado." /> : null}
            </div>
          </CardContent>
        </Card>

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
      <Dialog open={scopeDialogOpen} onOpenChange={setScopeDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Definir escopo do flow</DialogTitle>
            <DialogDescription>Escolha onde este flow vai aparecer antes de salvar.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <button
              type="button"
              onClick={() => props.onFlowDraftChange({ ...props.flowDraft, projectIds: [] })}
              className={cn('rounded-lg border p-3 text-left transition', flowDraftAllProjects ? 'border-[#788c5d] bg-[#eef2dd] shadow-[inset_4px_0_0_#788c5d]' : 'border-[#e8e6dc] bg-white hover:border-[#788c5d]')}
            >
              <p className="font-semibold">Todos os projetos</p>
              <p className="mt-1 text-sm text-[#66705f]">Disponível para qualquer suite da organização.</p>
            </button>
            <div className="grid gap-2 rounded-lg border border-[#e8e6dc] bg-[#faf9f5] p-3">
              <div>
                <p className="font-semibold">Projetos selecionados</p>
                <p className="mt-1 text-sm text-[#66705f]">{props.flowDraft.projectIds.length} projeto(s) vinculados.</p>
              </div>
              {props.projects.map((project) => (
                <label key={project.id} className={cn('flex min-h-11 items-center gap-2 rounded-md border p-2.5 text-sm', props.flowDraft.projectIds.includes(project.id) ? 'border-[#788c5d] bg-[#eef2dd]' : 'border-[#e8e6dc] bg-white')}>
                  <input
                    type="checkbox"
                    checked={props.flowDraft.projectIds.includes(project.id)}
                    onChange={(event) => toggleProject(project.id, event.target.checked)}
                  />
                  <span className="truncate">{project.name}</span>
                </label>
              ))}
              {props.projects.length === 0 ? <DarkEmpty text="Nenhum projeto disponível para restringir." /> : null}
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="outline" onClick={() => setScopeDialogOpen(false)}>Cancelar</Button>
              <Button onClick={confirmSaveFlow} disabled={!canSaveFlow}>{props.busy ? <Loader2 data-icon="inline-start" className="animate-spin" /> : null}Salvar flow</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={builderDialogOpen} onOpenChange={setBuilderDialogOpen}>
        <DialogContent
          className="max-h-[94vh] w-[calc(100vw-1rem)] max-w-[1760px]"
          onEscapeKeyDown={(event) => event.preventDefault()}
          onPointerDownOutside={(event) => event.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>Builder visual de flow</DialogTitle>
            <DialogDescription>Monte o fluxo por blocos, edite cada passo e aplique no YAML só quando estiver pronto.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 lg:grid-cols-[280px_minmax(520px,1fr)_420px]">
            <div className="grid max-h-[74vh] content-start gap-2 overflow-auto rounded-lg border border-[#e8e6dc] bg-[#faf9f5] p-3">
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#66705f]">Blocos</p>
              {flowStepTemplates.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => appendBuilderStep(template)}
                  className="rounded-md border border-[#e8e6dc] bg-white p-3 text-left transition hover:border-[#788c5d] hover:bg-[#eef2dd]"
                >
                  <span className="block text-sm font-bold">{template.label}</span>
                  <span className="mt-1 block text-xs text-[#66705f]">{template.description}</span>
                </button>
              ))}
            </div>

            <div className="grid min-h-[72vh] content-start gap-3 rounded-lg border border-[#e8e6dc] bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#788c5d]">Canvas do fluxo</p>
                  <h3 className="text-lg font-black">{props.flowDraft.displayName || 'Flow sem nome'}</h3>
                  <p className="mt-1 text-sm text-[#66705f]">Arraste os blocos para reorganizar. Use os botões no inspector como alternativa.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant={builderPreview.length > 0 ? 'success' : 'warning'}>{builderPreview.length} passo(s)</Badge>
                  <Badge variant={builderApplied ? 'success' : 'warning'}>{builderApplied ? 'aplicado' : 'não aplicado'}</Badge>
                </div>
              </div>
              <div className="grid max-h-[62vh] gap-0 overflow-auto pr-1">
                {builderPreview.map((row, index) => (
                  <div
                    key={`${row.index}:${row.title}:${row.detail}`}
                    data-flow-builder-dropzone={index}
                    className={cn('grid grid-cols-[34px_minmax(0,1fr)] gap-3 rounded-lg transition', dragOverBuilderStepIndex === index && draggedBuilderStepIndex !== index && 'bg-[#eef2dd] ring-2 ring-[#9fb25a]')}
                    onDragOver={(event) => overBuilderStepDrag(event, index)}
                    onDrop={(event) => dropBuilderStep(event, index)}
                    onDragLeave={() => setDragOverBuilderStepIndex((current) => current === index ? null : current)}
                  >
                    <div className="grid justify-items-center">
                      <button
                        type="button"
                        onClick={() => setSelectedBuilderStepIndex(index)}
                        className={cn('grid h-8 w-8 place-items-center rounded-full border bg-white font-mono text-xs font-bold transition', selectedBuilderStepIndex === index ? 'border-[#141413] bg-[#eef2dd]' : 'border-[#e8e6dc] hover:border-[#788c5d]')}
                      >
                        {row.index}
                      </button>
                      {index < builderPreview.length - 1 ? <span className="h-8 w-px bg-[#e8e6dc]" /> : null}
                    </div>
                    <div
                      draggable
                      data-flow-builder-step={index}
                      onDragStart={(event) => startBuilderStepDrag(event, index)}
                      onDragEnd={endBuilderStepDrag}
                      className={cn('mb-3 grid cursor-grab grid-cols-[32px_minmax(0,1fr)] items-center rounded-lg border text-left transition active:cursor-grabbing', selectedBuilderStepIndex === index ? 'border-[#141413] bg-[#eef2dd] shadow-[inset_4px_0_0_#788c5d]' : 'border-[#e8e6dc] bg-[#faf9f5] hover:border-[#788c5d]', draggedBuilderStepIndex === index && 'opacity-50')}
                    >
                      <button
                        type="button"
                        aria-label={`Arrastar passo ${row.index}`}
                        className="grid h-full min-h-20 cursor-grab place-items-center border-r border-[#e8e6dc] text-[#66705f] active:cursor-grabbing"
                        onMouseDown={() => setSelectedBuilderStepIndex(index)}
                      >
                        <GripVertical className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedBuilderStepIndex(index)}
                        className="min-w-0 p-3 text-left"
                      >
                        <p className="font-bold">{row.title}</p>
                        <p className="mt-1 text-sm text-[#66705f]">{row.detail}</p>
                      </button>
                    </div>
                  </div>
                ))}
                {builderPreview.length === 0 ? <DarkEmpty text="Adicione um bloco para começar o fluxo." /> : null}
              </div>
            </div>

            <FlowStepInspector
              step={builderSteps[selectedBuilderStepIndex]}
              index={selectedBuilderStepIndex}
              total={builderSteps.length}
              onChange={(step) => updateBuilderStep(selectedBuilderStepIndex, step)}
              onDelete={() => removeBuilderStep(selectedBuilderStepIndex)}
              onMove={(direction) => moveBuilderStep(selectedBuilderStepIndex, direction)}
            />
          </div>
          <div className="flex flex-wrap justify-between gap-2 border-t pt-4">
            <DialogClose asChild>
              <Button variant="outline">Voltar</Button>
            </DialogClose>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Badge variant={builderApplied ? 'success' : 'warning'}>{builderApplied ? 'YAML sincronizado' : 'alterações não aplicadas'}</Badge>
              <Button onClick={applyBuilderSteps} disabled={builderApplied}>Aplicar no YAML</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
