'use client';

import type React from 'react';
import { CheckCircle2, Loader2, Square, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { RunStatus } from '../types';
import { statusDotClass, statusLabel } from './runUtils';

export function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[#66705f]">{label}</p>
      <p className="truncate text-sm font-semibold">{value}</p>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1">
      <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#66705f]">{label}</span>
      {children}
    </label>
  );
}

export function RunFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[#e1ddd1] bg-white p-2.5">
      <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#66705f]">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold">{value}</p>
    </div>
  );
}

export function Status({ status }: { status: RunStatus }) {
  const passed = status === 'passed';
  const failed = status === 'failed' || status === 'error';
  const active = status === 'queued' || status === 'running';
  const variant = passed ? 'success' : failed ? 'destructive' : active ? 'warning' : 'muted';
  return (
    <Badge variant={variant} className="h-7 gap-2 uppercase">
      {passed ? <CheckCircle2 data-icon="inline-start" /> : failed ? <XCircle data-icon="inline-start" /> : active ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <Square data-icon="inline-start" />}
      {statusLabel(status)}
    </Badge>
  );
}

export function Score({ label, value, tone }: { label: string; value: number; tone: 'good' | 'bad' | 'warn' }) {
  return (
    <div className="border-r border-[#e1ddd1] p-2.5 last:border-r-0">
      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#66705f]">{label}</p>
      <p className={cn('mt-1 text-lg font-extrabold', tone === 'good' && 'text-[#1f7a50]', tone === 'bad' && 'text-[#b43c2e]', tone === 'warn' && 'text-[#8a6417]')}>{value}</p>
    </div>
  );
}

export function MetricPill({ label, value, tone }: { label: string; value: number; tone: 'good' | 'bad' | 'warn' | 'neutral' }) {
  return (
    <div className="min-w-[92px] rounded-lg border border-[#e1ddd1] bg-[#fbfaf6] px-3 py-2">
      <p className="font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-[#66705f]">{label}</p>
      <p className={cn('mt-1 text-lg font-black', tone === 'good' && 'text-[#1f7a50]', tone === 'bad' && 'text-[#b43c2e]', tone === 'warn' && 'text-[#8a6417]', tone === 'neutral' && 'text-[#1f241f]')}>{value}</p>
    </div>
  );
}

export function StatusDot({ status }: { status?: RunStatus }) {
  return (
    <span className="mt-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#e1ddd1] bg-[#fbfaf6]" aria-label={status ? statusLabel(status) : 'Sem run'}>
      <span className={cn('h-2.5 w-2.5 rounded-full', status ? statusDotClass(status) : 'bg-[#c8c2b4]')} />
    </span>
  );
}

export function Signal({ tone, text }: { tone: 'good' | 'bad'; text: string }) {
  return <div className={cn('rounded-lg border px-3 py-2 font-mono text-xs', tone === 'good' ? 'border-[#1d4f3a]/50 bg-[#e9f4d0] text-[#1d4f3a]' : 'border-[#b42318]/50 bg-[#fff0ed] text-[#9f1f16]')}>{text}</div>;
}

export function DarkEmpty({ text }: { text: string }) {
  return <div className="rounded-lg border border-dashed border-[#cfc9ba] bg-white p-6 text-center text-sm text-[#66705f]">{text}</div>;
}
