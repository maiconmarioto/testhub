'use client';

import type React from 'react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AuthShell } from '@/components/auth/auth-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';

type AuthResponse = { token?: string };

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [organizationName, setOrganizationName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await api<AuthResponse>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email, name, password, organizationName }),
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
        <AuthField id="organizationName" label="Organizacao">
          <Input id="organizationName" required value={organizationName} onChange={(event) => setOrganizationName(event.target.value)} />
        </AuthField>
        <AuthField id="password" label="Senha">
          <Input id="password" type="password" autoComplete="new-password" required value={password} onChange={(event) => setPassword(event.target.value)} />
        </AuthField>
        {error ? <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}
        <Button type="submit" disabled={busy || !email || !name || !password || !organizationName}>{busy ? 'Criando...' : 'Criar conta'}</Button>
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
  if (message.includes('Cadastro publico')) return 'Cadastro publico desativado. Use usuario inicial/bootstrap ou habilite public signup.';
  return message;
}
