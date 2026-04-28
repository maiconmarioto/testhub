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

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await api<AuthResponse>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      if (result.token) window.localStorage.setItem('testhub.token', result.token);
      router.replace('/v2');
    } catch (nextError) {
      setError(messageOf(nextError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="Login"
      description="Acesse workspace TestHub."
      links={[
        { href: '/register', label: 'Criar setup inicial' },
        { href: '/forgot-password', label: 'Esqueci senha' },
      ]}
    >
      <form onSubmit={submit} className="grid gap-4">
        <AuthField id="email" label="Email">
          <Input id="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
        </AuthField>
        <AuthField id="password" label="Senha">
          <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} />
        </AuthField>
        {error ? <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}
        <Button type="submit" disabled={busy || !email || !password}>{busy ? 'Entrando...' : 'Entrar'}</Button>
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

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
