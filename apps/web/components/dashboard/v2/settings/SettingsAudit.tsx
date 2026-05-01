'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { apiBase } from '@/lib/api';
import type { AuditEntry } from '../types';
import { formatDate } from '../shared/runUtils';
import { DarkEmpty, Field, Signal } from '../shared/ui';

export function SettingsAudit(props: {
  audit: AuditEntry[];
  cleanupDays: string;
  cleanupResult: string;
  busy: boolean;
  canAdmin: boolean;
  onCleanupDaysChange: (value: string) => void;
  onCleanup: () => void;
}) {
  return (
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
  );
}
