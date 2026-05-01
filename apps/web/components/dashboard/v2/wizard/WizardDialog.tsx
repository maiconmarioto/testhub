'use client';

import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { Suite, WizardDraft } from '../types';
import { Field, RunFact, suiteTypeLabel } from '../shared';
import { YamlEditor } from '../yaml/YamlEditor';

export function WizardDialog(props: {
  open: boolean;
  step: number;
  draft: WizardDraft;
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  onStepChange: (step: number) => void;
  onDraftChange: (draft: WizardDraft) => void;
  onFinish: () => Promise<void>;
}) {
  const labels = ['Projeto', 'Ambiente', 'Suite', 'Revisao'];
  const canNext = props.step === 0
    ? props.draft.projectName.trim()
    : props.step === 1
      ? props.draft.environmentName.trim() && props.draft.baseUrl.trim()
      : props.step === 2
        ? props.draft.suiteName.trim() && props.draft.specContent.trim()
        : true;
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent
        className="max-w-5xl"
        onEscapeKeyDown={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Wizard de configuração</DialogTitle>
          <DialogDescription>Crie projeto, ambiente e primeira suite em fluxo único.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid grid-cols-4 gap-2">
            {labels.map((label, index) => (
              <button
                key={label}
                type="button"
                onClick={() => props.onStepChange(index)}
                className={cn('rounded-lg border px-3 py-2 text-left text-sm font-semibold', props.step === index ? 'border-[#9fb25a] bg-[#f2f6d8]' : 'border-[#e1ddd1] bg-white')}
              >
                <span className="font-mono text-[10px] text-[#66705f]">Passo {index + 1}</span>
                <span className="block">{label}</span>
              </button>
            ))}
          </div>

          {props.step === 0 ? (
            <div className="grid gap-3">
              <Field label="Nome do projeto"><Input autoFocus value={props.draft.projectName} onChange={(event) => props.onDraftChange({ ...props.draft, projectName: event.target.value })} placeholder="Checkout SaaS" /></Field>
              <Field label="Descrição"><Textarea value={props.draft.projectDescription} onChange={(event) => props.onDraftChange({ ...props.draft, projectDescription: event.target.value })} placeholder="Escopo, squad, produto ou módulo." /></Field>
            </div>
          ) : null}

          {props.step === 1 ? (
            <div className="grid gap-3">
              <Field label="Nome do ambiente"><Input value={props.draft.environmentName} onChange={(event) => props.onDraftChange({ ...props.draft, environmentName: event.target.value })} placeholder="hml" /></Field>
              <Field label="Base URL"><Input value={props.draft.baseUrl} onChange={(event) => props.onDraftChange({ ...props.draft, baseUrl: event.target.value })} placeholder="https://app.local" /></Field>
              <Field label="Variáveis"><Textarea className="min-h-36 font-mono text-xs" value={props.draft.variables} onChange={(event) => props.onDraftChange({ ...props.draft, variables: event.target.value })} placeholder="TOKEN=abc" /></Field>
            </div>
          ) : null}

          {props.step === 2 ? (
            <div className="grid gap-3">
              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px]">
                <Field label="Nome da suite"><Input value={props.draft.suiteName} onChange={(event) => props.onDraftChange({ ...props.draft, suiteName: event.target.value })} /></Field>
                <Field label="Tipo">
                  <Select value={props.draft.suiteType} onValueChange={(value) => props.onDraftChange({ ...props.draft, suiteType: value as Suite['type'] })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="api">API</SelectItem>
                      <SelectItem value="web">Frontend</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              <div className="grid gap-1">
                <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#66705f]">YAML</span>
                <YamlEditor
                  value={props.draft.specContent}
                  onChange={(value) => props.onDraftChange({ ...props.draft, specContent: value })}
                  readOnly={false}
                  height="360px"
                />
              </div>
            </div>
          ) : null}

          {props.step === 3 ? (
            <div className="grid gap-3 md:grid-cols-3">
              <RunFact label="Projeto" value={props.draft.projectName || '-'} />
              <RunFact label="Ambiente" value={props.draft.environmentName || '-'} />
              <RunFact label="Suite" value={`${props.draft.suiteName || '-'} · ${suiteTypeLabel(props.draft.suiteType)}`} />
            </div>
          ) : null}

          <div className="flex flex-wrap justify-between gap-2 border-t pt-4">
            <Button variant="outline" onClick={() => props.onOpenChange(false)}>Fechar</Button>
            <div className="flex gap-2">
              <Button variant="outline" disabled={props.step === 0} onClick={() => props.onStepChange(Math.max(0, props.step - 1))}>Voltar</Button>
              {props.step < 3 ? (
                <Button disabled={!canNext} onClick={() => props.onStepChange(Math.min(3, props.step + 1))}>Continuar</Button>
              ) : (
                <Button disabled={props.busy || !canNext} onClick={props.onFinish}>{props.busy ? <Loader2 data-icon="inline-start" className="animate-spin" /> : null}Criar workspace</Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
