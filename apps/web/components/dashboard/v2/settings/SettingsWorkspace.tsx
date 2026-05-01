'use client';

import { WandSparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { apiBase } from '@/lib/api';
import { cn } from '@/lib/utils';
import { roles } from '../constants';
import type { AiConnection, AuditEntry, AuthMe, MembershipEdit, Organization, OrganizationMember, PersonalAccessToken, Role, SecurityStatus, UserManagementItem } from '../types';
import { DarkEmpty, Field, InfoLine, Signal, formatDate, shortId } from '../shared';

export function SettingsWorkspace(props: {
  me: AuthMe | null;
  members: OrganizationMember[];
  organizations: Organization[];
  managedUsers: UserManagementItem[];
  memberDraft: { email: string; name: string; role: OrganizationMember['membership']['role']; temporaryPassword: string };
  profileDraft: { name: string; email: string; currentPassword: string; newPassword: string };
  orgDraft: { name: string };
  membershipEdit: MembershipEdit;
  personalTokens: PersonalAccessToken[];
  tokenDraft: { name: string; scope: 'all' | 'selected'; organizationIds: string[] };
  aiConnections: AiConnection[];
  aiDraft: { id: string; name: string; provider: AiConnection['provider']; apiKey: string; model: string; baseUrl: string; enabled: boolean };
  security: SecurityStatus | null;
  audit: AuditEntry[];
  cleanupDays: string;
  cleanupResult: string;
  busy: boolean;
  canWrite: boolean;
  canAdmin: boolean;
  onMemberDraftChange: (draft: { email: string; name: string; role: OrganizationMember['membership']['role']; temporaryPassword: string }) => void;
  onCreateMember: () => void;
  onProfileDraftChange: (draft: { name: string; email: string; currentPassword: string; newPassword: string }) => void;
  onSaveProfile: () => void;
  onOrgDraftChange: (draft: { name: string }) => void;
  onCreateOrganization: () => void;
  onSwitchOrganization: (organizationId: string) => void;
  onMembershipEditChange: (userId: string, organizationId: string, roleValue: Role | '') => void;
  onSaveUserMemberships: (userId: string) => void;
  onTokenDraftChange: (draft: { name: string; scope: 'all' | 'selected'; organizationIds: string[] }) => void;
  onCreatePersonalToken: () => void;
  onRevokePersonalToken: (tokenId: string) => void;
  onAiDraftChange: (draft: { id: string; name: string; provider: AiConnection['provider']; apiKey: string; model: string; baseUrl: string; enabled: boolean }) => void;
  onEditAiConnection: (connection: AiConnection) => void;
  onSaveAiConnection: () => void;
  onCleanupDaysChange: (value: string) => void;
  onCleanup: () => void;
}) {
  return (
    <Tabs defaultValue="profile" className="grid gap-4">
      <TabsList className="grid h-auto grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
        <TabsTrigger value="profile">Perfil</TabsTrigger>
        <TabsTrigger value="organizations">Organizações</TabsTrigger>
        <TabsTrigger value="users">Usuários</TabsTrigger>
        <TabsTrigger value="security">Segurança /MCP</TabsTrigger>
        <TabsTrigger value="ai">AI</TabsTrigger>
        <TabsTrigger value="audit">Audit</TabsTrigger>
      </TabsList>

      <TabsContent value="profile" className="m-0">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Perfil</CardTitle>
            <CardDescription>{props.me?.user.email ?? 'Sessão não carregada'}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-2 rounded-lg border border-[#e1ddd1] bg-white p-3 md:grid-cols-3">
              <InfoLine label="Usuário" value={props.me?.user.email ?? 'sem sessão'} />
              <InfoLine label="Organização" value={props.me?.organization.name ?? 'não carregado'} />
              <InfoLine label="Role" value={props.me?.membership.role ?? 'viewer'} />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Nome"><Input value={props.profileDraft.name} onChange={(event) => props.onProfileDraftChange({ ...props.profileDraft, name: event.target.value })} /></Field>
              <Field label="Email"><Input type="email" value={props.profileDraft.email} onChange={(event) => props.onProfileDraftChange({ ...props.profileDraft, email: event.target.value })} /></Field>
              <Field label="Senha atual"><Input type="password" value={props.profileDraft.currentPassword} onChange={(event) => props.onProfileDraftChange({ ...props.profileDraft, currentPassword: event.target.value })} placeholder="Obrigatória para trocar senha" /></Field>
              <Field label="Nova senha"><Input type="password" value={props.profileDraft.newPassword} onChange={(event) => props.onProfileDraftChange({ ...props.profileDraft, newPassword: event.target.value })} /></Field>
            </div>
            <Button className="w-fit" onClick={props.onSaveProfile} disabled={props.busy || !props.profileDraft.email.trim() || Boolean(props.profileDraft.newPassword && !props.profileDraft.currentPassword)}>Salvar perfil</Button>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="organizations" className="m-0">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="grid gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle>Organizações</CardTitle>
                <CardDescription>{props.me?.organization.name ?? 'Organização atual'} · {props.organizations.length} disponíveis</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-2 md:grid-cols-2">
                {props.organizations.map((organization) => (
                  <div key={organization.id} className={cn('grid gap-3 rounded-lg border bg-white p-3', organization.id === props.me?.organization.id ? 'border-[#9fb25a] bg-[#f2f6d8]' : 'border-[#e1ddd1]')}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{organization.name}</p>
                        <p className="font-mono text-xs text-[#66705f]">{organization.slug || shortId(organization.id)}</p>
                      </div>
                      <Badge variant={organization.status === 'active' ? 'success' : 'outline'}>{organization.status ?? 'ativa'}</Badge>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => props.onSwitchOrganization(organization.id)} disabled={props.busy || organization.id === props.me?.organization.id}>Usar</Button>
                  </div>
                ))}
                {props.organizations.length === 0 ? <DarkEmpty text="Nenhuma organização." /> : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3"><CardTitle>Membros da organização atual</CardTitle><CardDescription>{props.members.length} membros carregados.</CardDescription></CardHeader>
              <CardContent className="grid gap-2 md:grid-cols-2">
                {props.members.map((member) => (
                  <div key={member.membership.id} className="flex items-center justify-between gap-3 rounded-lg border border-[#e1ddd1] bg-white p-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{member.user.email}</p>
                      {member.user.name ? <p className="truncate text-xs text-[#66705f]">{member.user.name}</p> : null}
                    </div>
                    <Badge variant={member.membership.role === 'admin' ? 'success' : member.membership.role === 'editor' ? 'secondary' : 'outline'}>{member.membership.role}</Badge>
                  </div>
                ))}
                {props.members.length === 0 ? <DarkEmpty text="Nenhum membro carregado." /> : null}
              </CardContent>
            </Card>
          </div>

          {props.canAdmin ? (
            <Card>
              <CardHeader className="pb-3"><CardTitle>Nova organização</CardTitle><CardDescription>Cria time/workspace compartilhado.</CardDescription></CardHeader>
              <CardContent className="grid gap-3">
                <Field label="Nome"><Input value={props.orgDraft.name} onChange={(event) => props.onOrgDraftChange({ name: event.target.value })} placeholder="Nome" /></Field>
                <Button onClick={props.onCreateOrganization} disabled={props.busy || !props.orgDraft.name.trim()}>Criar org</Button>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </TabsContent>

      <TabsContent value="users" className="m-0">
        <div className="grid gap-4">
          {props.canAdmin ? (
            <Card>
              <CardHeader className="pb-3"><CardTitle>Novo membro</CardTitle><CardDescription>Cria usuário na organização atual.</CardDescription></CardHeader>
              <CardContent className="grid gap-3">
                <div className="grid gap-3 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_160px]">
                  <Field label="Email"><Input type="email" value={props.memberDraft.email} onChange={(event) => props.onMemberDraftChange({ ...props.memberDraft, email: event.target.value })} placeholder="user@empresa.com" /></Field>
                  <Field label="Nome"><Input value={props.memberDraft.name} onChange={(event) => props.onMemberDraftChange({ ...props.memberDraft, name: event.target.value })} placeholder="Opcional" /></Field>
                  <Field label="Role">
                    <Select value={props.memberDraft.role} onValueChange={(value) => props.onMemberDraftChange({ ...props.memberDraft, role: value as OrganizationMember['membership']['role'] })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">admin</SelectItem>
                        <SelectItem value="editor">editor</SelectItem>
                        <SelectItem value="viewer">viewer</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
                  <Field label="Senha temporária"><Input type="password" value={props.memberDraft.temporaryPassword} onChange={(event) => props.onMemberDraftChange({ ...props.memberDraft, temporaryPassword: event.target.value })} placeholder="Opcional" /></Field>
                  <Button className="self-end" onClick={props.onCreateMember} disabled={props.busy || !props.canAdmin || !props.memberDraft.email.trim()}>Criar membro</Button>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {props.canAdmin ? (
            <Card>
              <CardHeader className="pb-3"><CardTitle>Gestão de acessos</CardTitle><CardDescription>Organizações e roles por usuário.</CardDescription></CardHeader>
              <CardContent className="grid gap-3">
                {props.managedUsers.map((item) => (
                  <div key={item.user.id} className="grid gap-3 rounded-lg border border-[#e1ddd1] bg-white p-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{item.user.email}</p>
                        <p className="truncate text-xs text-[#66705f]">{item.user.name || 'Sem nome'} · {item.user.status}</p>
                      </div>
                      <Button size="sm" onClick={() => props.onSaveUserMemberships(item.user.id)} disabled={props.busy}>Salvar acessos</Button>
                    </div>
                    <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                      {props.organizations.map((organization) => {
                        const value = props.membershipEdit[item.user.id]?.[organization.id] ?? '';
                        return (
                          <div key={`${item.user.id}:${organization.id}`} className="grid gap-2 rounded-md border border-[#e1ddd1] bg-[#fbfaf6] p-2">
                            <label className="flex min-w-0 items-center gap-2 text-sm">
                              <input
                                type="checkbox"
                                checked={Boolean(value)}
                                onChange={(event) => props.onMembershipEditChange(item.user.id, organization.id, event.target.checked ? 'viewer' : '')}
                              />
                              <span className="truncate font-semibold">{organization.name}</span>
                            </label>
                            <Select value={value || 'viewer'} onValueChange={(nextRole) => props.onMembershipEditChange(item.user.id, organization.id, nextRole as Role)} disabled={!value}>
                              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {roles.map((membershipRole) => <SelectItem key={membershipRole} value={membershipRole}>{membershipRole}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
                {props.managedUsers.length === 0 ? <DarkEmpty text="Nenhum usuário carregado." /> : null}
              </CardContent>
            </Card>
          ) : null}
        </div>
      </TabsContent>

      <TabsContent value="security" className="m-0">
        <div className="grid gap-4">
          <Card>
            <CardHeader className="pb-3"><CardTitle>Segurança empresa</CardTitle><CardDescription>OIDC, RBAC, allowlist, secrets e retention.</CardDescription></CardHeader>
            <CardContent className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              <SecurityLine label="OIDC/Auth.js" ok={Boolean(props.security?.oidc.configured)} value={props.security?.oidc.issuer ?? 'não configurado'} />
              <SecurityLine label="API token" ok={Boolean(props.security?.auth.apiTokenEnabled)} value={props.security?.auth.apiTokenEnabled ? 'ativo' : 'desligado'} />
              <SecurityLine label="RBAC" ok value={props.security?.auth.rbacRole ?? 'viewer'} />
              <SecurityLine label="TESTHUB_SECRET_KEY" ok={!props.security?.secrets.defaultKey} value={props.security?.secrets.defaultKey ? 'default, trocar antes de produção' : 'custom'} />
              <SecurityLine label="Allowlist hosts" ok={Boolean(props.security && !props.security.network.allowAllWhenEmpty)} value={props.security?.network.allowedHosts.join(', ') || 'vazia, permite tudo'} />
              <SecurityLine label="Retention" ok value={`${props.security?.retention.days ?? props.cleanupDays} dias`} />
            </CardContent>
          </Card>
          <ProductionReadiness security={props.security} />
          <Card>
            <CardHeader className="pb-3"><CardTitle>Tokens CLI/MCP</CardTitle><CardDescription>Bearer tokens pessoais para CLI, MCP e automações.</CardDescription></CardHeader>
            <CardContent>
              <PersonalTokenControl
                tokens={props.personalTokens}
                organizations={props.me?.organizations ?? props.organizations}
                draft={props.tokenDraft}
                busy={props.busy}
                onDraftChange={props.onTokenDraftChange}
                onCreate={props.onCreatePersonalToken}
                onRevoke={props.onRevokePersonalToken}
              />
            </CardContent>
          </Card>
        </div>
      </TabsContent>

      <TabsContent value="ai" className="m-0">
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
      </TabsContent>

      <TabsContent value="audit" className="m-0">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
          <Card>
            <CardHeader className="pb-3"><CardTitle>Audit log</CardTitle><CardDescription>Mutacoes recentes na API.</CardDescription></CardHeader>
            <CardContent className="grid gap-2">
              <div className="flex justify-end">
                <Button asChild variant="outline" size="sm">
                  <a href={`${apiBase}/api/audit/export`} target="_blank">Export CSV</a>
                </Button>
              </div>
              {props.audit.map((entry) => (
                <div key={entry.id} className="grid gap-1 rounded-lg border border-[#e1ddd1] bg-white p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-xs font-bold">{entry.action}</span>
                    <Badge variant={entry.status === 'ok' ? 'success' : entry.status === 'blocked' ? 'warning' : 'destructive'}>{entry.status}</Badge>
                  </div>
                  <p className="font-mono text-xs text-[#66705f]">{formatDate(entry.createdAt)} · {entry.actor}{entry.target ? ` · ${entry.target}` : ''}</p>
                </div>
              ))}
              {props.audit.length === 0 ? <DarkEmpty text="Audit vazio." /> : null}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3"><CardTitle>Cleanup</CardTitle><CardDescription>Aplica política de retention.</CardDescription></CardHeader>
            <CardContent className="grid gap-3">
              <Field label="Dias"><Input type="number" min={1} value={props.cleanupDays} onChange={(event) => props.onCleanupDaysChange(event.target.value)} /></Field>
              <Button variant="destructive" onClick={props.onCleanup} disabled={props.busy || !props.canAdmin || Number(props.cleanupDays) < 1}>Executar cleanup</Button>
              {props.cleanupResult ? <Signal tone="good" text={props.cleanupResult} /> : null}
            </CardContent>
          </Card>
        </div>
      </TabsContent>
    </Tabs>
  );
}

function PersonalTokenControl(props: {
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

function SecurityLine({ label, ok, value }: { label: string; ok: boolean; value: string }) {
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

function ProductionReadiness({ security }: { security: SecurityStatus | null }) {
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
