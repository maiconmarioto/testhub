'use client';

import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type { FlowDraft, Project } from '../types';
import { DarkEmpty } from '../shared/ui';

export function FlowScopeDialog(props: {
  open: boolean;
  flowDraft: FlowDraft;
  projects: Project[];
  busy: boolean;
  canSaveFlow: boolean;
  onOpenChange: (open: boolean) => void;
  onFlowDraftChange: (draft: FlowDraft) => void;
  onConfirmSave: () => void;
}) {
  const flowDraftAllProjects = props.flowDraft.projectIds.length === 0;
  const toggleProject = (projectId: string, checked: boolean) => {
    const next = checked
      ? [...new Set([...props.flowDraft.projectIds, projectId])]
      : props.flowDraft.projectIds.filter((id) => id !== projectId);
    props.onFlowDraftChange({ ...props.flowDraft, projectIds: next });
  };

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
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
            <Button variant="outline" onClick={() => props.onOpenChange(false)}>Cancelar</Button>
            <Button onClick={props.onConfirmSave} disabled={!props.canSaveFlow}>{props.busy ? <Loader2 data-icon="inline-start" className="animate-spin" /> : null}Salvar flow</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
