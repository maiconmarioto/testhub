'use client';

import { useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import YAML from 'yaml';
import type { YamlValidationMode } from '../types';
import { messageOf } from '../shared';

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), { ssr: false });

export function YamlEditor({ value, onChange, readOnly = false, validateSpec = true, validationMode, height = 'calc(100vh - 410px)' }: { value: string; onChange: (value: string) => void; readOnly?: boolean; validateSpec?: boolean; validationMode?: YamlValidationMode; height?: string }) {
  const monacoRef = useRef<any>(null);
  const editorRef = useRef<any>(null);
  const modelPathRef = useRef(`testhub-${Math.random().toString(36).slice(2)}.yaml`);
  const mode = validationMode ?? (validateSpec ? 'spec' : 'syntax');
  useEffect(() => {
    const monaco = monacoRef.current;
    const editor = editorRef.current;
    const model = editor?.getModel?.();
    if (!monaco || !model) return;
    monaco.editor.setModelMarkers(model, 'testhub-yaml', yamlDiagnosticsForMode(value, monaco, mode));
  }, [value, mode]);

  return (
    <div className="overflow-hidden rounded-md border border-input bg-[#0b100c]" style={{ height }}>
      <MonacoEditor
        height={height}
        defaultLanguage="yaml"
        path={modelPathRef.current}
        value={value}
        onChange={(nextValue) => onChange(nextValue ?? '')}
        beforeMount={(monaco) => {
          monacoRef.current = monaco;
          monaco.languages.registerCompletionItemProvider('yaml', {
            provideCompletionItems: () => ({
              suggestions: [
                { label: 'version', kind: monaco.languages.CompletionItemKind.Property, insertText: 'version: 1', range: undefined as never },
                { label: 'type api', kind: monaco.languages.CompletionItemKind.Snippet, insertText: 'type: api', range: undefined as never },
                { label: 'type frontend', kind: monaco.languages.CompletionItemKind.Snippet, insertText: 'type: web', range: undefined as never },
                { label: 'api test', kind: monaco.languages.CompletionItemKind.Snippet, insertText: 'tests:\\n  - name: ${1:health}\\n    request:\\n      method: GET\\n      path: /health\\n    expect:\\n      status: 200', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, range: undefined as never },
                { label: 'frontend test', kind: monaco.languages.CompletionItemKind.Snippet, insertText: 'tests:\\n  - name: ${1:login}\\n     steps:\\n      - goto: /\\n      - expectVisible: ${2:text}', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, range: undefined as never },
                { label: 'web flow', kind: monaco.languages.CompletionItemKind.Snippet, insertText: 'flows:\\n  ${1:login}:\\n    params:\\n      ${2:email}: ${3:\\${USER_EMAIL}}\\n     steps:\\n      - goto: ${4:/login}\\n      - fill:\\n          by: label\\n          target: ${5:Email}\\n          value: \\${${2:email}}\\n\\ntests:\\n  - name: ${6:fluxo}\\n     steps:\\n      - use: ${1:login}', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, range: undefined as never },
                { label: 'web extract', kind: monaco.languages.CompletionItemKind.Snippet, insertText: '- extract:\\n    as: ${1:ORDER_ID}\\n    from:\\n      by: testId\\n      target: ${2:order-id}\\n    property: ${3:text}', insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, range: undefined as never },
              ],
            }),
          });
        }}
        onMount={(editor, monaco) => {
          editorRef.current = editor;
          monacoRef.current = monaco;
          const model = editor.getModel();
          if (model) monaco.editor.setModelMarkers(model, 'testhub-yaml', yamlDiagnosticsForMode(value, monaco, mode));
        }}
        options={{
          minimap: { enabled: false },
          fontFamily: 'IBM Plex Mono, monospace',
          fontSize: 12,
          lineNumbersMinChars: 3,
          scrollBeyondLastLine: false,
          tabSize: 2,
          wordWrap: 'on',
          automaticLayout: true,
          glyphMargin: true,
          quickSuggestions: true,
          readOnly,
          domReadOnly: readOnly,
          renderValidationDecorations: readOnly ? 'off' : 'on',
        }}
        theme="vs-dark"
      />
    </div>
  );
}

function yamlSyntaxDiagnostics(source: string, monaco: any) {
  const markers: Array<ReturnType<typeof marker>> = [];
  try {
    const doc = YAML.parseDocument(source);
    for (const error of doc.errors) {
      const line = lineFromOffset(source, error.pos?.[0] ?? 0);
      markers.push(marker(monaco, line, error.message, monaco.MarkerSeverity.Error));
    }
  } catch (error) {
    markers.push(marker(monaco, 1, messageOf(error), monaco.MarkerSeverity.Error));
  }
  return markers;
}

function yamlDiagnosticsForMode(source: string, monaco: any, mode: YamlValidationMode) {
  if (mode === 'spec') return yamlDiagnostics(source, monaco);
  if (mode === 'flowSteps') return flowStepsDiagnostics(source, monaco);
  if (mode === 'flowParams') return flowParamsDiagnostics(source, monaco);
  return yamlSyntaxDiagnostics(source, monaco);
}

function flowParamsDiagnostics(source: string, monaco: any) {
  const markers = yamlSyntaxDiagnostics(source, monaco);
  if (markers.length > 0) return markers;
  if (!source.trim()) return markers;
  const parsed = YAML.parse(source);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    markers.push(marker(monaco, 1, 'Params YAML deve ser um objeto chave: valor.', monaco.MarkerSeverity.Error));
  }
  return markers;
}

function flowStepsDiagnostics(source: string, monaco: any) {
  const markers = yamlSyntaxDiagnostics(source, monaco);
  if (markers.length > 0) return markers;
  const lines = source.split('\n');
  let parsed: unknown = [];
  try {
    parsed = source.trim() ? YAML.parse(source) : [];
  } catch {
    return markers;
  }
  if (!Array.isArray(parsed)) {
    markers.push(marker(monaco, 1, 'Steps YAML deve ser uma lista de passos.', monaco.MarkerSeverity.Error));
    return markers;
  }
  if (parsed.length === 0) markers.push(marker(monaco, 1, 'Adicione pelo menos 1 passo ao flow.', monaco.MarkerSeverity.Warning));
  parsed.forEach((step, index) => {
    const line = flowStepLine(lines, index);
    if (typeof step === 'string') return;
    if (!step || typeof step !== 'object' || Array.isArray(step)) {
      markers.push(marker(monaco, line, `Passo ${index + 1} deve ser um comando YAML válido.`, monaco.MarkerSeverity.Error));
      return;
    }
    const stepObject = step as Record<string, unknown>;
    const entries = Object.entries(stepObject);
    const [action, payload] = entries[0] ?? [];
    if (!action) return;
    const validUseWith = action === 'use' && entries.every(([key]) => key === 'use' || key === 'with');
    if (entries.length !== 1 && !validUseWith) markers.push(marker(monaco, line, `Passo ${index + 1} deve ter apenas uma ação.`, monaco.MarkerSeverity.Warning));
    if (!knownFlowActions.has(action)) markers.push(marker(monaco, line, `Ação "${action}" não é reconhecida pelo builder.`, monaco.MarkerSeverity.Warning));
    if ((action === 'goto' || action === 'waitFor' || action === 'expectText' || action === 'expectUrlContains' || action === 'use') && !payload) {
      markers.push(marker(monaco, line, `${action} precisa de valor.`, monaco.MarkerSeverity.Error));
    }
    if (
      (
        action === 'fill'
        || action === 'click'
        || action === 'select'
        || action === 'check'
        || action === 'expectVisible'
        || action === 'expectHidden'
        || action === 'expectAttribute'
        || action === 'expectValue'
        || action === 'expectCount'
        || action === 'uploadFile'
      ) && (!payload || typeof payload !== 'object')
    ) {
      markers.push(marker(monaco, line, `${action} precisa de objeto com by/target.`, monaco.MarkerSeverity.Error));
    }
    if (action === 'extract' && (!payload || typeof payload !== 'object')) markers.push(marker(monaco, line, 'extract precisa de objeto.', monaco.MarkerSeverity.Error));
    if (action === 'press' && (!payload || (typeof payload !== 'string' && typeof payload !== 'object'))) markers.push(marker(monaco, line, 'press precisa de tecla ou objeto com key.', monaco.MarkerSeverity.Error));
  });
  return markers;
}

const knownFlowActions = new Set<string>(['goto', 'click', 'fill', 'select', 'check', 'press', 'waitFor', 'expectText', 'expectUrlContains', 'expectVisible', 'expectHidden', 'expectAttribute', 'expectValue', 'expectCount', 'uploadFile', 'use', 'extract']);

function yamlDiagnostics(source: string, monaco: any) {
  const markers: Array<ReturnType<typeof marker>> = [];
  const lines = source.split('\n');
  let parsed: any = null;
  try {
    const doc = YAML.parseDocument(source);
    for (const error of doc.errors) {
      const line = lineFromOffset(source, error.pos?.[0] ?? 0);
      markers.push(marker(monaco, line, error.message, monaco.MarkerSeverity.Error));
    }
    parsed = doc.toJSON();
  } catch (error) {
    markers.push(marker(monaco, 1, messageOf(error), monaco.MarkerSeverity.Error));
  }
  if (!parsed || typeof parsed !== 'object') return markers;
  if (parsed.version !== 1) markers.push(marker(monaco, Math.max(1, findLine(lines, 'version')), 'version: 1 obrigatório.', monaco.MarkerSeverity.Error));
  if (parsed.type !== 'api' && parsed.type !== 'web') markers.push(marker(monaco, Math.max(1, findLine(lines, 'type')), 'type deve ser api ou web/frontend.', monaco.MarkerSeverity.Error));
  if (!parsed.name) markers.push(marker(monaco, Math.max(1, findLine(lines, 'name')), 'name obrigatório.'));
  if (!Array.isArray(parsed.tests) || parsed.tests.length === 0) markers.push(marker(monaco, Math.max(1, findLine(lines, 'tests')), 'tests deve ter pelo menos 1 item.', monaco.MarkerSeverity.Error));
  if (Array.isArray(parsed.tests)) {
    parsed.tests.forEach((test: any, index: number) => {
      const line = findLine(lines, `- name: ${test?.name ?? ''}`) || findLine(lines, 'tests');
      if (!test?.name) markers.push(marker(monaco, line, `tests[${index}].name obrigatório.`));
      if (parsed.type === 'api' && !test?.request) markers.push(marker(monaco, line, `tests[${index}].request obrigatório para API.`));
      if (parsed.type === 'web' && (!Array.isArray(test?.steps) || test.steps.length === 0)) markers.push(marker(monaco, line, `tests[${index}].steps obrigatório para Frontend.`));
    });
  }
  return markers;
}

function marker(monaco: any, line: number, message: string, severity = monaco.MarkerSeverity.Warning) {
  return {
    severity,
    message,
    startLineNumber: line,
    startColumn: 1,
    endLineNumber: line,
    endColumn: 120,
  };
}

function lineFromOffset(source: string, offset: number): number {
  return source.slice(0, offset).split('\n').length;
}

function findLine(lines: string[], token: string): number {
  const index = lines.findIndex((line) => line.includes(token));
  return index >= 0 ? index + 1 : 1;
}

function flowStepLine(lines: string[], stepIndex: number): number {
  let current = -1;
  for (let index = 0; index < lines.length; index += 1) {
    if (/^\s*-\s+/.test(lines[index] ?? '')) {
      current += 1;
      if (current === stepIndex) return index + 1;
    }
  }
  return Math.max(1, stepIndex + 1);
}
