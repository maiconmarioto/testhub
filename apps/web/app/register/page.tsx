'use client';

import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AuthShell } from '@/components/auth/auth-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';

type AuthResponse = { token?: string };
type PublicOrganization = { id: string; name: string; slug: string; status: string; createdAt: string; updatedAt: string };

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [organizationName, setOrganizationName] = useState('');
  const [organizations, setOrganizations] = useState<PublicOrganization[]>([]);
  const [selectedOrganizationIds, setSelectedOrganizationIds] = useState<string[]>([]);
  const [orgsLoading, setOrgsLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const canSubmit = useMemo(() => {
    const hasOrganization = organizations.length > 0 ? selectedOrganizationIds.length > 0 : organizationName.trim().length > 0;
    return Boolean(email.trim() && name.trim() && password && hasOrganization && !orgsLoading);
  }, [email, name, password, organizationName, organizations.length, selectedOrganizationIds.length, orgsLoading]);

  useEffect(() => {
    let active = true;
    api<PublicOrganization[]>('/api/auth/organizations', { redirectOnUnauthorized: false })
      .then((nextOrganizations) => {
        if (!active) return;
        setOrganizations(nextOrganizations);
      })
      .catch(() => {
        if (active) setOrganizations([]);
      })
      .finally(() => {
        if (active) setOrgsLoading(false);
      });
    return () => { active = false; };
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError('');
    try {
      const payload = {
        email: email.trim(),
        name: name.trim() || undefined,
        password,
        organizationIds: organizations.length > 0 ? selectedOrganizationIds : undefined,
        organizationName: organizationName.trim() || undefined,
      };
      const result = await api<AuthResponse>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (result.token) window.localStorage.setItem('testhub.token', result.token);
      router.replace('/v2');
    } catch (nextError) {
      setError(formatRegisterError(nextError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell title="Criar conta" description="Setup inicial ou cadastro liberado." links={[{ href: '/login', label: 'Voltar para login' }]}>
      <form onSubmit={submit} className="grid gap-4">
        <AuthField id="email" label="Email">
          <Input id="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
        </AuthField>
        <AuthField id="name" label="Nome">
          <Input id="name" autoComplete="name" required value={name} onChange={(event) => setName(event.target.value)} />
        </AuthField>
        {organizations.length > 0 ? (
          <AuthField id="organizations" label="Organizações">
            <details className="group rounded-md border border-input bg-background">
              <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-sm">
                <span className="truncate">{selectedOrganizationIds.length > 0 ? `${selectedOrganizationIds.length} selecionada(s)` : 'Selecionar organizações'}</span>
                <span className="text-xs text-muted-foreground group-open:rotate-180">v</span>
              </summary>
              <div className="grid max-h-52 gap-1 overflow-auto border-t p-2">
                {organizations.map((organization) => (
                  <label key={organization.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted">
                    <input
                      type="checkbox"
                      checked={selectedOrganizationIds.includes(organization.id)}
                      onChange={(event) => {
                        setSelectedOrganizationIds((current) => event.target.checked
                          ? [...current, organization.id]
                          : current.filter((id) => id !== organization.id));
                      }}
                    />
                    <span className="min-w-0 flex-1 truncate">{organization.name}</span>
                    <span className="font-mono text-xs text-muted-foreground">{organization.slug}</span>
                  </label>
                ))}
              </div>
            </details>
          </AuthField>
        ) : (
          <AuthField id="organizationName" label="Organização">
            <Input id="organizationName" required value={organizationName} onChange={(event) => setOrganizationName(event.target.value)} />
          </AuthField>
        )}
        <AuthField id="password" label="Senha">
          <Input id="password" type="password" autoComplete="new-password" required value={password} onChange={(event) => setPassword(event.target.value)} />
        </AuthField>
        {error ? <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}
        <Button type="submit" disabled={busy || !canSubmit}>{busy ? 'Criando...' : orgsLoading ? 'Carregando...' : 'Criar conta'}</Button>
      </form>
    </AuthShell>
  );
}

function AuthField({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

function formatRegisterError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('Cadastro público')) return 'Cadastro público desativado. Use usuário inicial/bootstrap ou habilite public signup.';
  return message;
}
