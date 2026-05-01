'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Organization, PersonalAccessToken, SecurityStatus } from '../types';
import { formatDate } from '../shared/runUtils';
import { DarkEmpty, Field } from '../shared/ui';

export function PersonalTokenControl(props: {
  tokens: PersonalAccessToken[];
  organizations: Organization[];
  draft: { name: string; scope: 'all' | 'selected'; organizationIds: string[] };
  busy: boolean;
  onDraftChange: (draft: { name: string; scope: 'all' | 'selected'; organizationIds: string[] }) => void;
  onCreate: () => void;
  onRevoke: (tokenId: string) => void;
}) {
  const selectedOrganizations = props.organizations.filter((organization) => props.draft.organizationIds.includes(organization.id));
  const canCreate = props.draft.name.trim() && (props.draft.scope === 'all' || props.draft.organizationIds.length > 0);
  return (
    <div className="grid gap-4">
      <div className="grid gap-3 rounded-lg border border-[#e1ddd1] bg-[#fbfaf6] p-3">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px]">
          <Field label="Nome"><Input value={props.draft.name} onChange={(event) => props.onDraftChange({ ...props.draft, name: event.target.value })} placeholder="mcp-local" /></Field>
          <Field label="Escopo">
            <Select value={props.draft.scope} onValueChange={(value) => props.onDraftChange({ ...props.draft, scope: value as 'all' | 'selected', organizationIds: value === 'all' ? [] : props.draft.organizationIds })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas minhas orgs</SelectItem>
                <SelectItem value="selected">Orgs especificas</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>
        {props.draft.scope === 'selected' ? (
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {props.organizations.map((organization) => (
              <label key={organization.id} className="flex min-w-0 items-center gap-2 rounded-md border border-[#e1ddd1] bg-white p-2 text-sm">
                <input
                  type="checkbox"
                  checked={props.draft.organizationIds.includes(organization.id)}
                  onChange={(event) => props.onDraftChange({
                    ...props.draft,
                    organizationIds: event.target.checked
                      ? [...props.draft.organizationIds, organization.id]
                      : props.draft.organizationIds.filter((id) => id !== organization.id),
                  })}
                />
                <span className="truncate font-semibold">{organization.name}</span>
              </label>
            ))}
          </div>
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-[#66705f]">{props.draft.scope === 'all' ? 'Token acompanha todas organizações que voce tem acesso.' : `${selectedOrganizations.length} org(s) selecionada(s).`}</p>
          <Button onClick={props.onCreate} disabled={props.busy || !canCreate}>Criar token</Button>
        </div>
      </div>

      <div className="grid gap-2">
        {props.tokens.map((token) => (
          <div key={token.id} className="grid gap-3 rounded-lg border border-[#e1ddd1] bg-white p-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-semibold">{token.name}</p>
                <p className="font-mono text-xs text-[#66705f]">{token.tokenPreview}</p>
              </div>
              <Badge variant={token.organizationIds?.length ? 'secondary' : 'success'}>{token.organizationIds?.length ? `${token.organizationIds.length} orgs` : 'todas orgs'}</Badge>
            </div>
            <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto_auto]">
              <Input readOnly type="password" value={token.token} />
              <Button variant="outline" onClick={() => navigator.clipboard.writeText(token.token)}>Copiar</Button>
              <Button variant="destructive" onClick={() => props.onRevoke(token.id)} disabled={props.busy}>Revogar</Button>
            </div>
            <p className="text-xs text-[#66705f]">Criado {formatDate(token.createdAt)}{token.lastUsedAt ? ` · último uso ${formatDate(token.lastUsedAt)}` : ''}</p>
          </div>
        ))}
        {props.tokens.length === 0 ? <DarkEmpty text="Nenhum token pessoal." /> : null}
      </div>
    </div>
  );
}
export function SecurityLine({ label, ok, value }: { label: string; ok: boolean; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-[#e1ddd1] bg-white p-3">
      <div className="min-w-0">
        <p className="font-semibold">{label}</p>
        <p className="break-words font-mono text-xs text-[#66705f]">{value}</p>
      </div>
      <Badge variant={ok ? 'success' : 'warning'}>{ok ? 'ok' : 'acao'}</Badge>
    </div>
  );
}

export function ProductionReadiness({ security }: { security: SecurityStatus | null }) {
  const checks = [
    { label: 'Secret forte', ok: Boolean(security && !security.secrets.defaultKey), value: security?.secrets.defaultKey ? 'TESTHUB_SECRET_KEY default' : 'TESTHUB_SECRET_KEY custom' },
    { label: 'Auth ativo', ok: Boolean(security && security.auth.mode !== 'off'), value: security?.auth.mode ?? 'desconhecido' },
    { label: 'RBAC visivel', ok: Boolean(security?.auth.rbacRole), value: security?.auth.rbacRole ?? 'viewer' },
    { label: 'Allowlist de hosts', ok: Boolean(security && !security.network.allowAllWhenEmpty), value: security?.network.allowedHosts.join(', ') || 'vazia' },
    { label: 'Retention configurado', ok: Boolean(security && security.retention.days > 0), value: `${security?.retention.days ?? '-'} dias` },
  ];
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle>Production readiness</CardTitle>
        <CardDescription>Alertas derivados do estado atual de segurança.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {checks.map((check) => <SecurityLine key={check.label} label={check.label} ok={check.ok} value={check.value} />)}
      </CardContent>
    </Card>
  );
}
