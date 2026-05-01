'use client';

import type React from 'react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { errorMessage, useLoginMutation } from '@/components/auth/auth-query';
import { AuthShell } from '@/components/auth/auth-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function LoginPage() {
  const router = useRouter();
  const loginMutation = useLoginMutation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    try {
      await loginMutation.mutateAsync({ email, password });
      router.replace('/v2');
    } catch (nextError) {
      setError(errorMessage(nextError));
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
        <Button type="submit" disabled={loginMutation.isPending || !email || !password}>{loginMutation.isPending ? 'Entrando...' : 'Entrar'}</Button>
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
