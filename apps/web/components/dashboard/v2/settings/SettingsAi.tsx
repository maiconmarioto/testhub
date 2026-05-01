'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { AiConnection } from '../types';
import { DarkEmpty, Field } from '../shared/ui';

export function SettingsAi(props: {
  aiConnections: AiConnection[];
  aiDraft: { id: string; name: string; provider: AiConnection['provider']; apiKey: string; model: string; baseUrl: string; enabled: boolean };
  busy: boolean;
  canAdmin: boolean;
  onAiDraftChange: (draft: { id: string; name: string; provider: AiConnection['provider']; apiKey: string; model: string; baseUrl: string; enabled: boolean }) => void;
  onEditAiConnection: (connection: AiConnection) => void;
  onSaveAiConnection: () => void;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
      <Card>
        <CardHeader className="pb-3"><CardTitle>AI connections</CardTitle><CardDescription>{props.aiConnections.length} configuradas.</CardDescription></CardHeader>
        <CardContent className="grid gap-2">
          {props.aiConnections.map((connection) => (
            <button key={connection.id} type="button" onClick={() => props.onEditAiConnection(connection)} className="grid gap-2 rounded-lg border border-[#e1ddd1] bg-white p-3 text-left hover:border-[#9fb25a]">
              <div className="flex items-center justify-between gap-3">
                <span className="font-semibold">{connection.name}</span>
                <Badge variant={connection.enabled ? 'success' : 'muted'}>{connection.enabled ? 'ativa' : 'off'}</Badge>
              </div>
              <p className="font-mono text-xs text-[#66705f]">{connection.provider} · {connection.model}</p>
            </button>
          ))}
          {props.aiConnections.length === 0 ? <DarkEmpty text="Nenhuma AI connection." /> : null}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-3"><CardTitle>{props.aiDraft.id ? 'Editar AI' : 'Nova AI'}</CardTitle><CardDescription>Usada no explain failure.</CardDescription></CardHeader>
        <CardContent className="grid gap-3">
          <Field label="Nome"><Input value={props.aiDraft.name} onChange={(event) => props.onAiDraftChange({ ...props.aiDraft, name: event.target.value })} /></Field>
          <Field label="Provider">
            <Select value={props.aiDraft.provider} onValueChange={(value) => props.onAiDraftChange({ ...props.aiDraft, provider: value as AiConnection['provider'] })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="openrouter">OpenRouter</SelectItem>
                <SelectItem value="openai">OpenAI</SelectItem>
                <SelectItem value="anthropic">Anthropic</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Modelo"><Input value={props.aiDraft.model} onChange={(event) => props.onAiDraftChange({ ...props.aiDraft, model: event.target.value })} /></Field>
          <Field label="Base URL"><Input value={props.aiDraft.baseUrl} onChange={(event) => props.onAiDraftChange({ ...props.aiDraft, baseUrl: event.target.value })} /></Field>
          <Field label="API key"><Input type="password" value={props.aiDraft.apiKey} onChange={(event) => props.onAiDraftChange({ ...props.aiDraft, apiKey: event.target.value })} placeholder={props.aiDraft.id ? '[REDACTED]' : 'sk-...'} /></Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={props.aiDraft.enabled} onChange={(event) => props.onAiDraftChange({ ...props.aiDraft, enabled: event.target.checked })} /> Ativa</label>
          <Button onClick={props.onSaveAiConnection} disabled={props.busy || !props.canAdmin || !props.aiDraft.name || !props.aiDraft.model}>Salvar AI</Button>
        </CardContent>
      </Card>
    </div>
  );
}
