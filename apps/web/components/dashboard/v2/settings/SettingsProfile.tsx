'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import type { AuthMe } from '../types';
import { Field, InfoLine } from '../shared/ui';

export function SettingsProfile(props: {
  me: AuthMe | null;
  profileDraft: { name: string; email: string; currentPassword: string; newPassword: string };
  busy: boolean;
  onProfileDraftChange: (draft: { name: string; email: string; currentPassword: string; newPassword: string }) => void;
  onSaveProfile: () => void;
}) {
  return (
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
  );
}
