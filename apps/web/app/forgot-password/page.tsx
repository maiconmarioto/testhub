'use client';

import type React from 'react';
import { useState } from 'react';
import Link from 'next/link';
import { AuthShell } from '@/components/auth/auth-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';

type ResetRequestResponse = { resetToken?: string };

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [resetToken, setResetToken] = useState('');
  const [error, setError] = useState('');

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await api<ResetRequestResponse>('/api/auth/password-reset/request', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      setSubmitted(true);
      setResetToken(result.resetToken ?? '');
    } catch (nextError) {
      setError(messageOf(nextError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell title="Reset de senha" description="Solicite link/token de recuperacao." links={[{ href: '/login', label: 'Voltar para login' }]}>
      <form onSubmit={submit} className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
        </div>
        {submitted ? <p aria-live="polite" className="rounded-md border border-[#d8d3c5] bg-white px-3 py-2 text-sm text-[#1f241f]">Se existir conta para este email, instrucoes foram enviadas.</p> : null}
        {resetToken ? (
          <div className="grid gap-2 rounded-md border border-[#d8d3c5] bg-white px-3 py-2 text-sm">
            <span className="font-mono break-all">{resetToken}</span>
            <Link className="font-semibold text-[#1d4f3a] underline-offset-4 hover:underline" href={`/reset-password?token=${encodeURIComponent(resetToken)}`}>
              Abrir reset com token
            </Link>
          </div>
        ) : null}
        {error ? <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}
        <Button type="submit" disabled={busy || !email}>{busy ? 'Enviando...' : 'Solicitar reset'}</Button>
      </form>
    </AuthShell>
  );
}

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
