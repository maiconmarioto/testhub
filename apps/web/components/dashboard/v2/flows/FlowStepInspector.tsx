import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { DarkEmpty, Field } from '../shared/ui';
import type { FlowSelectorMode, FlowStepAction } from './flowBuilderTypes';
import {
  buildFlowSelector,
  defaultFlowStep,
  describeFlowStep,
  flowSelectorMode,
  flowSelectorModeOptions,
  flowSelectorTarget,
  flowStepAction,
  flowStepActionOptions,
  flowStepPayload,
} from './flowBuilderUtils';

export function FlowStepInspector({ step, index, total, onChange, onDelete, onMove }: { step: unknown; index: number; total: number; onChange: (step: unknown) => void; onDelete: () => void; onMove: (direction: -1 | 1) => void }) {
  if (!step) {
    return (
      <aside className="grid content-start gap-3 rounded-lg border border-[#e8e6dc] bg-[#faf9f5] p-3">
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#788c5d]">Inspector</p>
        <DarkEmpty text="Selecione ou adicione um bloco." />
      </aside>
    );
  }
  const action = flowStepAction(step);
  const preview = describeFlowStep(step, index + 1);
  const payload = action !== 'custom' ? flowStepPayload(step, action) : undefined;
  const objectPayload = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload as Record<string, unknown> : {};
  const fromPayload = objectPayload.from && typeof objectPayload.from === 'object' && !Array.isArray(objectPayload.from) ? objectPayload.from as Record<string, unknown> : {};
  const setSimplePayload = (value: string) => action !== 'custom' && onChange({ [action]: value });
  const setObjectField = (field: string, value: string) => action !== 'custom' && onChange({ [action]: { ...objectPayload, [field]: value } });
  const setObjectNumberField = (field: string, value: string) => {
    const numeric = Number(value);
    if (action !== 'custom') onChange({ [action]: { ...objectPayload, [field]: Number.isFinite(numeric) ? numeric : 0 } });
  };
  const setSelectorPayload = (selector: Record<string, unknown>) => action !== 'custom' && onChange({ [action]: selector });
  const setFromSelector = (selector: Record<string, unknown>) => action !== 'custom' && onChange({ [action]: { ...objectPayload, from: selector } });
  const selectorAction = action === 'fill'
    || action === 'click'
    || action === 'select'
    || action === 'check'
    || action === 'expectVisible'
    || action === 'expectHidden'
    || action === 'expectAttribute'
    || action === 'expectValue'
    || action === 'expectCount'
    || action === 'uploadFile';
  return (
    <aside className="grid max-h-[74vh] content-start gap-3 overflow-auto rounded-lg border border-[#e8e6dc] bg-[#faf9f5] p-3">
      <div>
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#788c5d]">Inspector</p>
        <h3 className="mt-1 text-lg font-black">Passo {index + 1}</h3>
        <p className="text-sm text-[#66705f]">{preview.title}: {preview.detail}</p>
      </div>
      <Field label="Tipo do bloco">
        <Select value={action === 'custom' ? 'goto' : action} onValueChange={(value) => onChange(defaultFlowStep(value as FlowStepAction))}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {flowStepActionOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </Field>

      {action === 'goto' ? <Field label="Página ou URL"><Input value={String(payload ?? '')} onChange={(event) => setSimplePayload(event.target.value)} placeholder="/login" /></Field> : null}
      {action === 'waitFor' ? <Field label="Aguardar"><Input value={String(payload ?? '')} onChange={(event) => setSimplePayload(event.target.value)} placeholder="networkidle" /></Field> : null}
      {action === 'expectUrlContains' ? <Field label="Trecho da URL"><Input value={String(payload ?? '')} onChange={(event) => setSimplePayload(event.target.value)} placeholder="/dashboard" /></Field> : null}
      {action === 'press' ? (
        <div className="grid gap-3">
          <Field label="Destino da tecla">
            <Select
              value={payload && typeof payload === 'object' && !Array.isArray(payload) ? 'element' : 'page'}
              onValueChange={(value) => onChange({ press: value === 'element' ? { by: 'label', target: 'Campo', key: String(payload || 'Enter') } : String(objectPayload.key ?? payload ?? 'Enter') })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="page">Página inteira</SelectItem>
                <SelectItem value="element">Elemento específico</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          {payload && typeof payload === 'object' && !Array.isArray(payload) ? <FlowSelectorFields selector={objectPayload} onChange={setSelectorPayload} /> : null}
          <Field label="Tecla">
            <Input
              value={payload && typeof payload === 'object' && !Array.isArray(payload) ? String(objectPayload.key ?? '') : String(payload ?? '')}
              onChange={(event) => onChange({ press: payload && typeof payload === 'object' && !Array.isArray(payload) ? { ...objectPayload, key: event.target.value } : event.target.value })}
              placeholder="Enter"
            />
          </Field>
        </div>
      ) : null}
      {action === 'expectText' ? (
        <div className="grid gap-3">
          <Field label="Modo da validação">
            <Select
              value={payload && typeof payload === 'object' && !Array.isArray(payload) ? 'selector' : 'text'}
              onValueChange={(value) => onChange({ expectText: value === 'selector' ? { by: 'text', target: String(payload ?? 'Dashboard') } : flowSelectorTarget(objectPayload, flowSelectorMode(objectPayload)) })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="text">Texto simples</SelectItem>
                <SelectItem value="selector">Selector</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          {payload && typeof payload === 'object' && !Array.isArray(payload) ? (
            <FlowSelectorFields selector={objectPayload} onChange={setSelectorPayload} />
          ) : (
            <Field label="Texto esperado"><Input value={String(payload ?? '')} onChange={(event) => setSimplePayload(event.target.value)} placeholder="Dashboard" /></Field>
          )}
        </div>
      ) : null}
      {action === 'use' ? <Field label="Flow chamado"><Input value={String(payload ?? '')} onChange={(event) => setSimplePayload(event.target.value)} placeholder="auth.login" /></Field> : null}

      {selectorAction ? (
        <div className="grid gap-3">
          <FlowSelectorFields selector={objectPayload} onChange={setSelectorPayload} />
          {action === 'fill' || action === 'select' || action === 'expectValue' ? (
            <Field label={action === 'fill' ? 'Valor para preencher' : action === 'select' ? 'Opção' : 'Valor esperado'}>
              <Input value={String(objectPayload.value ?? '')} onChange={(event) => setObjectField('value', event.target.value)} placeholder={action === 'select' ? 'pro' : '${email}'} />
            </Field>
          ) : null}
          {action === 'expectAttribute' ? (
            <div className="grid grid-cols-2 gap-2">
              <Field label="Atributo"><Input value={String(objectPayload.attribute ?? '')} onChange={(event) => setObjectField('attribute', event.target.value)} placeholder="href" /></Field>
              <Field label="Valor esperado"><Input value={String(objectPayload.value ?? '')} onChange={(event) => setObjectField('value', event.target.value)} placeholder="/orders/123" /></Field>
            </div>
          ) : null}
          {action === 'expectCount' ? (
            <Field label="Quantidade esperada">
              <Input type="number" value={String(objectPayload.count ?? 1)} onChange={(event) => setObjectNumberField('count', event.target.value)} placeholder="2" />
            </Field>
          ) : null}
          {action === 'uploadFile' ? (
            <Field label="Caminho do arquivo">
              <Input value={String(objectPayload.path ?? '')} onChange={(event) => setObjectField('path', event.target.value)} placeholder="./fixtures/avatar.png" />
            </Field>
          ) : null}
        </div>
      ) : null}

      {action === 'extract' ? (
        <div className="grid gap-3">
          <Field label="Salvar como"><Input value={String(objectPayload.as ?? '')} onChange={(event) => setObjectField('as', event.target.value)} placeholder="ORDER_ID" /></Field>
          <Field label="Propriedade">
            <Select value={String(objectPayload.property ?? 'text')} onValueChange={(value) => setObjectField('property', value)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="text">Texto</SelectItem>
                <SelectItem value="value">Valor</SelectItem>
                <SelectItem value="url">URL atual</SelectItem>
                <SelectItem value="attribute">Atributo</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          {String(objectPayload.property ?? 'text') !== 'url' ? <FlowSelectorFields selector={fromPayload} onChange={setFromSelector} /> : null}
          {String(objectPayload.property ?? 'text') === 'attribute' ? <Field label="Atributo"><Input value={String(objectPayload.attribute ?? '')} onChange={(event) => setObjectField('attribute', event.target.value)} placeholder="href" /></Field> : null}
        </div>
      ) : null}

      {action === 'custom' ? (
        <div className="rounded-lg border border-[#e8e6dc] bg-white p-3 text-sm text-[#66705f]">
          Este passo usa uma ação customizada. Troque o tipo para editar pelo builder.
        </div>
      ) : null}

      <Separator />

      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" onClick={() => onMove(-1)} disabled={index <= 0}>Subir</Button>
        <Button variant="outline" onClick={() => onMove(1)} disabled={index >= total - 1}>Descer</Button>
      </div>
      <Button variant="destructive" onClick={onDelete}><Trash2 data-icon="inline-start" />Excluir passo</Button>
    </aside>
  );
}

function FlowSelectorFields({ selector, onChange }: { selector: Record<string, unknown>; onChange: (selector: Record<string, unknown>) => void }) {
  const mode = flowSelectorMode(selector);
  const option = flowSelectorModeOptions.find((item) => item.value === mode) ?? flowSelectorModeOptions[0];
  const targetValue = flowSelectorTarget(selector, mode);
  const supportsExact = mode === 'label' || mode === 'text' || mode === 'role' || mode === 'placeholder' || mode === 'textObject';
  const updateMode = (nextMode: FlowSelectorMode) => {
    onChange(buildFlowSelector(selector, nextMode, flowSelectorTarget(selector, mode)));
  };
  const updateTarget = (value: string) => {
    onChange(buildFlowSelector(selector, mode, value));
  };
  const updateField = (field: string, value: unknown) => {
    onChange({ ...selector, [field]: value });
  };
  const updateExact = (checked: boolean) => {
    const next = { ...selector };
    if (checked) next.exact = true;
    else delete next.exact;
    onChange(next);
  };
  return (
    <div className="grid gap-3 rounded-lg border border-[#e8e6dc] bg-white p-3">
      <div>
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#788c5d]">Selector</p>
        <p className="mt-1 text-xs text-[#66705f]">Escolha o mesmo tipo aceito pelo YAML do Playwright.</p>
      </div>
      <Field label="Tipo de selector">
        <Select value={mode} onValueChange={(value) => updateMode(value as FlowSelectorMode)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {flowSelectorModeOptions.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </Field>
      {mode === 'role' ? (
        <div className="grid grid-cols-2 gap-2">
          <Field label="Role"><Input value={String(selector.role ?? 'button')} onChange={(event) => updateField('role', event.target.value)} placeholder="button" /></Field>
          <Field label="Nome"><Input value={targetValue} onChange={(event) => updateTarget(event.target.value)} placeholder={option.placeholder} /></Field>
        </div>
      ) : (
        <Field label={mode === 'selector' ? 'CSS selector' : mode === 'textObject' ? 'Texto' : 'Alvo'}>
          <Input value={targetValue} onChange={(event) => updateTarget(event.target.value)} placeholder={option.placeholder} />
        </Field>
      )}
      {supportsExact ? (
        <label className="flex items-center gap-2 rounded-md border border-[#e8e6dc] bg-[#faf9f5] px-3 py-2 text-sm text-[#31372f]">
          <input
            type="checkbox"
            checked={Boolean(selector.exact)}
            onChange={(event) => updateExact(event.target.checked)}
          />
          Match exato
        </label>
      ) : null}
    </div>
  );
}
