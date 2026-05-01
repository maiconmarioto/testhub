'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { AuthMe, Organization, OrganizationMember } from '../types';
import { shortId } from '../shared/runUtils';
import { DarkEmpty, Field } from '../shared/ui';

export function SettingsOrganizations(props: {
  me: AuthMe | null;
  members: OrganizationMember[];
  organizations: Organization[];
  orgDraft: { name: string };
  busy: boolean;
  canAdmin: boolean;
  onOrgDraftChange: (draft: { name: string }) => void;
  onCreateOrganization: () => void;
  onSwitchOrganization: (organizationId: string) => void;
}) {
  return (
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
  );
}
