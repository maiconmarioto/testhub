import YAML from 'yaml';
import { redactPlainSensitive } from '../shared';
import type { FlowPreviewRow, FlowSelectorMode, FlowStepAction, FlowStepTemplate } from './flowBuilderTypes';

export const flowStepTemplates: FlowStepTemplate[] = [
  { id: 'goto', label: 'Abrir página', description: 'Acessa uma rota ou URL.', step: { goto: '/login' } },
  { id: 'click', label: 'Clicar ação', description: 'Clica em botão/link por role.', step: { click: { by: 'role', role: 'button', name: 'Entrar' } } },
  { id: 'fill', label: 'Preencher campo', description: 'Digite valor em input.', step: { fill: { by: 'label', target: 'Email', value: '${email}' } } },
  { id: 'select', label: 'Selecionar opção', description: 'Seleciona item de select.', step: { select: { by: 'label', target: 'Plano', value: 'pro' } } },
  { id: 'check', label: 'Marcar checkbox', description: 'Marca checkbox/radio.', step: { check: { by: 'label', target: 'Aceito os termos' } } },
  { id: 'press', label: 'Pressionar tecla', description: 'Envia tecla global ou em campo.', step: { press: 'Enter' } },
  { id: 'wait', label: 'Aguardar', description: 'Espera rede, load ou tempo.', step: { waitFor: 'networkidle' } },
  { id: 'text', label: 'Validar texto', description: 'Confirma texto na tela.', step: { expectText: 'Dashboard' } },
  { id: 'url', label: 'Validar URL', description: 'Confirma trecho da URL.', step: { expectUrlContains: '/dashboard' } },
  { id: 'visible', label: 'Ver elemento', description: 'Confirma que algo aparece.', step: { expectVisible: { by: 'text', target: 'Dashboard' } } },
  { id: 'hidden', label: 'Elemento oculto', description: 'Confirma que algo sumiu.', step: { expectHidden: { by: 'text', target: 'Carregando' } } },
  { id: 'attribute', label: 'Validar atributo', description: 'Confirma atributo de elemento.', step: { expectAttribute: { by: 'testId', target: 'order-link', attribute: 'href', value: '/orders/123' } } },
  { id: 'value', label: 'Validar valor', description: 'Confirma valor de um campo.', step: { expectValue: { by: 'label', target: 'Email', value: '${email}' } } },
  { id: 'count', label: 'Validar quantidade', description: 'Confirma número de elementos.', step: { expectCount: { by: 'css', target: '.item', count: 2 } } },
  { id: 'upload', label: 'Enviar arquivo', description: 'Preenche input file.', step: { uploadFile: { selector: 'input[type="file"]', path: './fixtures/avatar.png' } } },
  { id: 'use', label: 'Usar flow', description: 'Chama flow reutilizável.', step: { use: 'auth.login' } },
  { id: 'extract', label: 'Extrair dado', description: 'Guarda texto para usar depois.', step: { extract: { as: 'ORDER_ID', from: { by: 'testId', target: 'order-id' }, property: 'text' } } },
];

export const flowStepActionOptions: Array<{ value: FlowStepAction; label: string }> = [
  { value: 'goto', label: 'Abrir página' },
  { value: 'click', label: 'Clicar' },
  { value: 'fill', label: 'Preencher campo' },
  { value: 'select', label: 'Selecionar opção' },
  { value: 'check', label: 'Marcar checkbox' },
  { value: 'press', label: 'Pressionar tecla' },
  { value: 'waitFor', label: 'Aguardar' },
  { value: 'expectText', label: 'Validar texto' },
  { value: 'expectUrlContains', label: 'Validar URL' },
  { value: 'expectVisible', label: 'Ver elemento' },
  { value: 'expectHidden', label: 'Elemento oculto' },
  { value: 'expectAttribute', label: 'Validar atributo' },
  { value: 'expectValue', label: 'Validar valor' },
  { value: 'expectCount', label: 'Validar quantidade' },
  { value: 'uploadFile', label: 'Enviar arquivo' },
  { value: 'use', label: 'Usar flow' },
  { value: 'extract', label: 'Extrair dado' },
];

export const flowSelectorModeOptions: Array<{ value: FlowSelectorMode; label: string; placeholder: string }> = [
  { value: 'label', label: 'Label', placeholder: 'Email' },
  { value: 'text', label: 'Texto por target', placeholder: 'Dashboard' },
  { value: 'role', label: 'Role acessível', placeholder: 'Entrar' },
  { value: 'testId', label: 'Test id', placeholder: 'submit-button' },
  { value: 'css', label: 'CSS por target', placeholder: '[data-testid="save"]' },
  { value: 'placeholder', label: 'Placeholder', placeholder: 'Buscar' },
  { value: 'selector', label: 'Selector direto', placeholder: 'button[type="submit"]' },
  { value: 'textObject', label: 'Texto direto', placeholder: 'Pedido salvo' },
];

export function parseFlowStepsYaml(source: string): unknown[] {
  try {
    const parsed = source.trim() ? YAML.parse(source) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function cloneFlowStep(step: unknown): unknown {
  try {
    return YAML.parse(YAML.stringify(step));
  } catch {
    return step;
  }
}

export function flowSelectorMode(selector: Record<string, unknown>): FlowSelectorMode {
  if (typeof selector.selector === 'string') return 'selector';
  if (typeof selector.text === 'string') return 'textObject';
  if (selector.by === 'role') return 'role';
  if (selector.by === 'text') return 'text';
  if (selector.by === 'testId') return 'testId';
  if (selector.by === 'css') return 'css';
  if (selector.by === 'placeholder') return 'placeholder';
  return 'label';
}

export function flowSelectorTarget(selector: Record<string, unknown>, mode: FlowSelectorMode): string {
  if (mode === 'selector') return String(selector.selector ?? selector.target ?? '');
  if (mode === 'textObject') return String(selector.text ?? selector.target ?? '');
  if (mode === 'role') return String(selector.name ?? selector.target ?? '');
  return String(selector.target ?? selector.name ?? '');
}

export function buildFlowSelector(current: Record<string, unknown>, mode: FlowSelectorMode, target: string): Record<string, unknown> {
  const extras = flowSelectorExtras(current);
  const exact = current.exact === true && (mode === 'label' || mode === 'text' || mode === 'role' || mode === 'placeholder' || mode === 'textObject') ? { exact: true } : {};
  if (mode === 'selector') return { ...extras, selector: target };
  if (mode === 'textObject') return { ...extras, text: target, ...exact };
  if (mode === 'role') return { ...extras, by: 'role', role: String(current.role ?? 'button'), name: target, ...exact };
  return { ...extras, by: mode, target, ...exact };
}

export function flowStepAction(step: unknown): FlowStepAction | 'custom' {
  if (!step || typeof step !== 'object' || Array.isArray(step)) return 'custom';
  const action = Object.keys(step as Record<string, unknown>)[0];
  return flowStepActionOptions.some((option) => option.value === action) ? action as FlowStepAction : 'custom';
}

export function flowStepPayload(step: unknown, action: FlowStepAction): unknown {
  if (!step || typeof step !== 'object' || Array.isArray(step)) return undefined;
  return (step as Record<string, unknown>)[action];
}

export function defaultFlowStep(action: FlowStepAction): unknown {
  return cloneFlowStep(flowStepTemplates.find((template) => Object.keys(template.step as Record<string, unknown>)[0] === action)?.step ?? { [action]: '' });
}

export function flowStepPreviewRows(source: string): FlowPreviewRow[] {
  let steps: unknown[] = [];
  try {
    const parsed = source.trim() ? YAML.parse(source) : [];
    if (!Array.isArray(parsed)) return [];
    steps = parsed;
  } catch {
    return [{ index: 1, title: 'YAML inválido', detail: 'Corrija a sintaxe para visualizar o fluxo.' }];
  }
  return steps.map((step, index) => describeFlowStep(step, index + 1));
}

export function describeFlowStep(step: unknown, index: number): FlowPreviewRow {
  if (typeof step === 'string') return { index, title: 'Executar comando', detail: step };
  if (!step || typeof step !== 'object') return { index, title: 'Passo vazio', detail: 'Preencha este bloco no YAML.' };
  const entry = Object.entries(step as Record<string, unknown>)[0];
  if (!entry) return { index, title: 'Passo vazio', detail: 'Preencha este bloco no YAML.' };
  const [action, payload] = entry;
  if (action === 'goto') return { index, title: 'Abrir página', detail: String(payload) };
  if (action === 'waitFor') return { index, title: 'Aguardar', detail: String(payload) };
  if (action === 'fill') return { index, title: 'Preencher campo', detail: locatorDetail(payload, 'com valor') };
  if (action === 'click') return { index, title: 'Clicar', detail: locatorDetail(payload, 'na ação') };
  if (action === 'select') return { index, title: 'Selecionar opção', detail: locatorDetail(payload, 'com opção') };
  if (action === 'check') return { index, title: 'Marcar checkbox', detail: locatorDetail(payload, 'marcado') };
  if (action === 'press') return { index, title: 'Pressionar tecla', detail: pressDetail(payload) };
  if (action === 'expectUrlContains') return { index, title: 'Validar URL', detail: String(payload) };
  if (action === 'expectVisible') return { index, title: 'Ver elemento', detail: locatorDetail(payload, 'visível') };
  if (action === 'expectHidden') return { index, title: 'Elemento oculto', detail: locatorDetail(payload, 'oculto') };
  if (action === 'expectText') return { index, title: 'Validar texto', detail: typeof payload === 'string' ? payload : locatorDetail(payload, 'com texto') };
  if (action === 'expectAttribute') return { index, title: 'Validar atributo', detail: attributeDetail(payload) };
  if (action === 'expectValue') return { index, title: 'Validar valor', detail: locatorDetail(payload, 'com valor esperado') };
  if (action === 'expectCount') return { index, title: 'Validar quantidade', detail: countDetail(payload) };
  if (action === 'uploadFile') return { index, title: 'Enviar arquivo', detail: uploadDetail(payload) };
  if (action === 'extract') return { index, title: 'Extrair dado', detail: extractDetail(payload) };
  if (action === 'use') return { index, title: 'Usar flow', detail: String(payload) };
  return { index, title: action, detail: typeof payload === 'string' ? payload : 'Configuração customizada.' };
}

function flowSelectorExtras(selector: Record<string, unknown>): Record<string, unknown> {
  const selectorKeys = new Set(['by', 'target', 'role', 'name', 'exact', 'selector', 'text']);
  return Object.fromEntries(Object.entries(selector).filter(([key]) => !selectorKeys.has(key)));
}

function locatorDetail(payload: unknown, suffix: string): string {
  if (!payload || typeof payload !== 'object') return String(payload ?? suffix);
  const input = payload as Record<string, unknown>;
  const target = input.target ?? input.name ?? input.selector ?? input.text ?? input.role ?? input.by ?? 'alvo';
  const value = input.value ? `: ${redactPlainSensitive(String(input.value), '')}` : '';
  return `${String(target)} ${suffix}${value}`;
}

function pressDetail(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return String(payload ?? 'tecla');
  const input = payload as Record<string, unknown>;
  const target = input.target ?? input.name ?? input.selector ?? input.text ?? 'elemento';
  return `${String(input.key ?? 'tecla')} em ${String(target)}`;
}

function attributeDetail(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return String(payload ?? 'atributo');
  const input = payload as Record<string, unknown>;
  const target = input.target ?? input.name ?? input.selector ?? input.text ?? 'alvo';
  return `${String(target)} atributo ${String(input.attribute ?? 'atributo')} = ${String(input.value ?? '')}`;
}

function countDetail(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return String(payload ?? 'quantidade');
  const input = payload as Record<string, unknown>;
  const target = input.target ?? input.name ?? input.selector ?? input.text ?? 'alvo';
  return `${String(target)} com ${String(input.count ?? 0)} ocorrência(s)`;
}

function uploadDetail(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return String(payload ?? 'arquivo');
  const input = payload as Record<string, unknown>;
  const target = input.target ?? input.name ?? input.selector ?? input.text ?? 'input file';
  return `${String(input.path ?? 'arquivo')} em ${String(target)}`;
}

function extractDetail(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return 'Extrair dado';
  const input = payload as Record<string, unknown>;
  const from = input.from && typeof input.from === 'object' ? input.from as Record<string, unknown> : {};
  return `${String(input.as ?? 'VAR')} de ${String(from.target ?? from.selector ?? 'elemento')}`;
}
