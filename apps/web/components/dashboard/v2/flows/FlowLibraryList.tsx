'use client';

import { Copy, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { controlClass } from '../constants';
import type { FlowLibraryItem, Project } from '../types';
import { flowProjectLabel } from '../shared/flowUtils';
import { DarkEmpty } from '../shared/ui';

export function FlowLibraryList(props: {
  visibleFlows: FlowLibraryItem[];
  currentProjectFlowsCount: number;
  selectedFlowId: string;
  projects: Project[];
  currentProjectId: string;
  search: string;
  busy: boolean;
  canWrite: boolean;
  onSearchChange: (value: string) => void;
  onNewFlow: () => void;
  onEditFlow: (flow: FlowLibraryItem) => void;
  onArchiveFlow: (flowId: string) => void;
}) {
  return (
    <Card className="overflow-hidden xl:sticky xl:top-4 xl:max-h-[calc(100vh-9rem)]">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Biblioteca</CardTitle>
            <CardDescription>{props.visibleFlows.length} visíveis · {props.currentProjectFlowsCount} compatíveis</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={props.onNewFlow}>Novo</Button>
        </div>
        <Input value={props.search} onChange={(event) => props.onSearchChange(event.target.value)} placeholder="Buscar flow" className={cn(controlClass, 'mt-2')} />
      </CardHeader>
      <CardContent className="max-h-[calc(100vh-17rem)] overflow-auto pr-3">
        <div className="grid gap-2">
          {props.visibleFlows.map((flow) => {
            const outOfProject = Boolean(props.currentProjectId && flow.projectIds?.length && !flow.projectIds.includes(props.currentProjectId));
            return (
              <article key={flow.id} className={cn('grid gap-2 rounded-lg border bg-white p-3 transition', props.selectedFlowId === flow.id ? 'border-[#151915] shadow-[inset_4px_0_0_#c7d957]' : 'border-[#e1ddd1] hover:border-[#9fb25a]')}>
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
          {props.visibleFlows.length === 0 ? <DarkEmpty text="Nenhum flow encontrado." /> : null}
        </div>
      </CardContent>
    </Card>
  );
}
