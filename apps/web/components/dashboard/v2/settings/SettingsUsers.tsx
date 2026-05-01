'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { roles } from '../constants';
import type { MembershipEdit, Organization, OrganizationMember, Role, UserManagementItem } from '../types';
import { DarkEmpty, Field } from '../shared/ui';

export function SettingsUsers(props: {
  organizations: Organization[];
  managedUsers: UserManagementItem[];
  memberDraft: { email: string; name: string; role: OrganizationMember['membership']['role']; temporaryPassword: string };
  membershipEdit: MembershipEdit;
  busy: boolean;
  canAdmin: boolean;
  onMemberDraftChange: (draft: { email: string; name: string; role: OrganizationMember['membership']['role']; temporaryPassword: string }) => void;
  onCreateMember: () => void;
  onMembershipEditChange: (userId: string, organizationId: string, roleValue: Role | '') => void;
  onSaveUserMemberships: (userId: string) => void;
}) {
  if (!props.canAdmin) return <div className="grid gap-4" />;

  return (
    <div className="grid gap-4">
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
            <Button className="self-end" onClick={props.onCreateMember} disabled={props.busy || !props.memberDraft.email.trim()}>Criar membro</Button>
          </div>
        </CardContent>
      </Card>

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
    </div>
  );
}
