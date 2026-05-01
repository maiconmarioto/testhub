'use client';

import { Loader2, Upload } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { OpenApiDraft, Suite, ValidationResult } from '../types';
import { shortId, suiteTypeLabel } from '../shared/runUtils';
import { DarkEmpty, Field, MetricPill, Signal } from '../shared/ui';
import { YamlEditor } from '../yaml/YamlEditor';

export function SuitesWorkspace(props: {
  suites: Suite[];
  draft: { id: string; name: string; type: 'api' | 'web'; specContent: string };
  validation: ValidationResult | null;
  busy: boolean;
  canWrite: boolean;
  projectId: string;
  openApiDraft: OpenApiDraft;
  approvedAiPatch: boolean;
  onDraftChange: (draft: { id: string; name: string; type: 'api' | 'web'; specContent: string }) => void;
  onLoadSuite: (suite: Suite) => void;
  onNewSuite: () => void;
  onValidate: () => void;
  onSave: () => void;
  onOpenApiDraftChange: (draft: OpenApiDraft) => void;
  onApprovedAiPatchChange: (value: boolean) => void;
  onImportOpenApi: () => void;
}) {
  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Suites do projeto</CardTitle>
              <CardDescription>Editor YAML e importação ficam separados para evitar ruído.</CardDescription>
            </div>
            <div className="flex gap-2">
              <MetricPill label="Suites" value={props.suites.length} tone="neutral" />
              <MetricPill label="Validação" value={props.validation?.valid ? 1 : 0} tone={props.validation?.valid ? 'good' : 'neutral'} />
            </div>
          </div>
        </CardHeader>
      </Card>
      <Tabs defaultValue="editor" className="grid gap-4">
        <TabsList className="grid h-auto grid-cols-2 md:w-[420px]">
          <TabsTrigger value="editor">Editor</TabsTrigger>
          <TabsTrigger value="import">Import OpenAPI</TabsTrigger>
        </TabsList>
        <TabsContent value="editor" className="m-0"><SuiteMenu {...props} /></TabsContent>
        <TabsContent value="import" className="m-0">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Import OpenAPI</CardTitle>
              <CardDescription>Cria suite API no projeto selecionado.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
              <div className="grid gap-3 self-start">
                <Field label="Nome"><Input value={props.openApiDraft.name} onChange={(event) => props.onOpenApiDraftChange({ ...props.openApiDraft, name: event.target.value })} /></Field>
                <Field label="Base URL"><Input value={props.openApiDraft.baseUrl} onChange={(event) => props.onOpenApiDraftChange({ ...props.openApiDraft, baseUrl: event.target.value })} placeholder="https://api.local" /></Field>
                <Field label="Auth">
                  <Select value={props.openApiDraft.authTemplate} onValueChange={(value) => props.onOpenApiDraftChange({ ...props.openApiDraft, authTemplate: value as OpenApiDraft['authTemplate'] })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sem auth</SelectItem>
                      <SelectItem value="bearer">Bearer API_TOKEN</SelectItem>
                      <SelectItem value="apiKey">x-api-key</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Headers"><Textarea className="min-h-24 font-mono text-xs" value={props.openApiDraft.headers} onChange={(event) => props.onOpenApiDraftChange({ ...props.openApiDraft, headers: event.target.value })} placeholder="x-tenant=demo" /></Field>
                <Field label="Tags"><Input value={props.openApiDraft.tags} onChange={(event) => props.onOpenApiDraftChange({ ...props.openApiDraft, tags: event.target.value })} placeholder="billing, smoke" /></Field>
                <Field label="Endpoints"><Textarea className="min-h-24 font-mono text-xs" value={props.openApiDraft.selectedOperations} onChange={(event) => props.onOpenApiDraftChange({ ...props.openApiDraft, selectedOperations: event.target.value })} placeholder="GET /health&#10;createUser" /></Field>
              </div>
              <div className="grid gap-3">
                <Field label="OpenAPI JSON"><Textarea className="min-h-[420px] font-mono text-xs" value={props.openApiDraft.spec} onChange={(event) => props.onOpenApiDraftChange({ ...props.openApiDraft, spec: event.target.value })} placeholder='{"openapi":"3.0.0","paths":{}}' /></Field>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={props.openApiDraft.includeBodyExamples} onChange={(event) => props.onOpenApiDraftChange({ ...props.openApiDraft, includeBodyExamples: event.target.checked })} /> Incluir body examples</label>
                  <Button onClick={props.onImportOpenApi} disabled={props.busy || !props.canWrite || !props.projectId || !props.openApiDraft.spec.trim()}><Upload data-icon="inline-start" />Importar</Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SuiteMenu(props: {
  suites: Suite[];
  draft: { id: string; name: string; type: 'api' | 'web'; specContent: string };
  validation: ValidationResult | null;
  busy: boolean;
  canWrite?: boolean;
  approvedAiPatch?: boolean;
  onDraftChange: (draft: { id: string; name: string; type: 'api' | 'web'; specContent: string }) => void;
  onLoadSuite: (suite: Suite) => void;
  onNewSuite: () => void;
  onValidate: () => void;
  onSave: () => void;
  onApprovedAiPatchChange?: (value: boolean) => void;
}) {
  return (
    <div className="grid min-h-0 flex-1 gap-4 md:grid-cols-[340px_minmax(0,1fr)]">
      <Card className="min-h-0">
        <CardHeader className="pb-3">
          <CardTitle>Biblioteca</CardTitle>
          <CardDescription>{props.suites.length} suites no projeto.</CardDescription>
        </CardHeader>
        <CardContent className="min-h-0">
          <ScrollArea className="h-[calc(100vh-220px)] pr-3">
            <div className="grid gap-2">
              <Button variant="outline" onClick={props.onNewSuite} disabled={!props.canWrite}>Nova suite</Button>
              {props.suites.map((suite) => (
                <button
                  key={suite.id}
                  type="button"
                  onClick={() => props.onLoadSuite(suite)}
                  className={cn('grid cursor-pointer gap-3 rounded-lg border bg-white p-3 text-left transition hover:border-[#9fb25a] hover:bg-[#f5f4ee]', props.draft.id === suite.id ? 'border-[#9fb25a] bg-[#f2f6d8]' : 'border-[#e1ddd1]')}
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="min-w-0 break-words font-semibold leading-snug">{suite.name}</span>
                    <Badge variant={suite.type === 'api' ? 'secondary' : 'outline'}>{suiteTypeLabel(suite.type)}</Badge>
                  </div>
                  <span className="font-mono text-xs text-[#66705f]">{shortId(suite.id)}</span>
                </button>
              ))}
              {props.suites.length === 0 ? <DarkEmpty text="Nenhuma suite." /> : null}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      <Card className="min-h-0">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>{props.draft.id ? 'Editar suite' : 'Nova suite'}</CardTitle>
              <CardDescription>{props.draft.id ? shortId(props.draft.id) : 'YAML versionavel da suite.'}</CardDescription>
            </div>
            {props.validation ? <Badge variant={props.validation.valid ? 'success' : 'destructive'}>{props.validation.valid ? `${props.validation.tests} tests` : 'inválida'}</Badge> : null}
          </div>
        </CardHeader>
        <CardContent className="grid min-h-0 gap-3">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_150px]">
            <div className="grid gap-1.5">
              <Label>Nome</Label>
              <Input value={props.draft.name} onChange={(event) => props.onDraftChange({ ...props.draft, name: event.target.value })} placeholder="login-smoke" />
            </div>
            <div className="grid gap-1.5">
              <Label>Tipo</Label>
              <Select value={props.draft.type} onValueChange={(value) => props.onDraftChange({ ...props.draft, type: value as 'api' | 'web' })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="api">API</SelectItem>
                  <SelectItem value="web">Frontend</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>YAML</Label>
            <YamlEditor value={props.draft.specContent} onChange={(value) => props.onDraftChange({ ...props.draft, specContent: value })} />
          </div>
          {props.validation && !props.validation.valid ? <Signal tone="bad" text={props.validation.error} /> : null}
          {props.draft.id ? (
            <label className="flex items-center gap-2 rounded-md border border-[#e1ddd1] bg-white px-3 py-2 text-sm">
              <input type="checkbox" checked={Boolean(props.approvedAiPatch)} onChange={(event) => props.onApprovedAiPatchChange?.(event.target.checked)} />
              Aplicar como patch aprovado por humano
            </label>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={props.onValidate} disabled={props.busy}>Validar</Button>
            <Button onClick={props.onSave} disabled={props.busy || !props.canWrite || !props.draft.name.trim() || !props.draft.specContent.trim()}>
              {props.busy ? <Loader2 data-icon="inline-start" className="animate-spin" /> : null}
              Salvar
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
