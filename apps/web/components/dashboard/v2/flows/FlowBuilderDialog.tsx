'use client';

import type React from 'react';
import { GripVertical } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type { FlowDraft } from '../types';
import { DarkEmpty } from '../shared/ui';
import { FlowStepInspector } from './FlowStepInspector';
import type { FlowPreviewRow, FlowStepTemplate } from './flowBuilderTypes';
import { flowStepTemplates } from './flowBuilderUtils';

type FlowBuilderDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  flowDraft: FlowDraft;
  builderPreview: FlowPreviewRow[];
  builderApplied: boolean;
  builderSteps: unknown[];
  selectedBuilderStepIndex: number;
  setSelectedBuilderStepIndex: (index: number) => void;
  dragOverBuilderStepIndex: number | null;
  draggedBuilderStepIndex: number | null;
  appendBuilderStep: (template: FlowStepTemplate) => void;
  overBuilderStepDrag: (event: React.DragEvent, index: number) => void;
  dropBuilderStep: (event: React.DragEvent, index: number) => void;
  setDragOverBuilderStepIndex: (updater: number | null | ((current: number | null) => number | null)) => void;
  startBuilderStepDrag: (event: React.DragEvent, index: number) => void;
  endBuilderStepDrag: () => void;
  updateBuilderStep: (index: number, step: unknown) => void;
  removeBuilderStep: (index: number) => void;
  moveBuilderStep: (index: number, direction: -1 | 1) => void;
  applyBuilderSteps: () => void;
};

export function FlowBuilderDialog({
  open, onOpenChange, flowDraft, builderPreview, builderApplied, builderSteps, selectedBuilderStepIndex, setSelectedBuilderStepIndex,
  dragOverBuilderStepIndex, draggedBuilderStepIndex, appendBuilderStep, overBuilderStepDrag, dropBuilderStep, setDragOverBuilderStepIndex,
  startBuilderStepDrag, endBuilderStepDrag, updateBuilderStep, removeBuilderStep, moveBuilderStep, applyBuilderSteps,
}: FlowBuilderDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
                  <h3 className="text-lg font-black">{flowDraft.displayName || 'Flow sem nome'}</h3>
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
  );
}
