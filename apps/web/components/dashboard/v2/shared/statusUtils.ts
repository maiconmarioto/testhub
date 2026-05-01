import type { Run, RunStatus, Suite } from '../types';

export function summarize(runs: Run[]) {
  return {
    passed: runs.filter((run) => run.status === 'passed').length,
    failed: runs.filter((run) => run.status === 'failed').length,
    error: runs.filter((run) => run.status === 'error').length,
    active: runs.filter((run) => run.status === 'queued' || run.status === 'running').length,
  };
}

export function latestRun(runs: Run[], filter: { suiteId?: string; environmentId?: string } = {}): Run | undefined {
  return runs
    .filter((run) => (!filter.suiteId || run.suiteId === filter.suiteId) && (!filter.environmentId || run.environmentId === filter.environmentId))
    .sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime())[0];
}

export function inferredOwner(suite: Suite): string {
  const name = suite.name.toLowerCase();
  if (name.includes('auth') || name.includes('login') || name.includes('security')) return 'Segurança';
  if (name.includes('checkout') || name.includes('payment') || name.includes('billing')) return 'Receita';
  if (name.includes('api') || name.includes('health') || suite.type === 'api') return 'Plataforma';
  if (suite.type === 'web') return 'Produto';
  return 'Qualidade';
}

export function inferredCriticality(suite: Suite): 'baixa' | 'média' | 'alta' | 'bloqueante' {
  const name = suite.name.toLowerCase();
  if (name.includes('checkout') || name.includes('payment') || name.includes('billing') || name.includes('auth') || name.includes('login')) return 'bloqueante';
  if (name.includes('api') || name.includes('health') || name.includes('smoke')) return 'alta';
  if (suite.type === 'web') return 'média';
  return 'baixa';
}

export function statusDotClass(status: RunStatus): string {
  if (status === 'passed') return 'bg-[#1f7a50]';
  if (status === 'failed' || status === 'error') return 'bg-[#b43c2e]';
  if (status === 'queued' || status === 'running') return 'bg-[#c39420]';
  return 'bg-[#9da596]';
}

export function runSummary(run: Run): string {
  if (run.error) return run.error;
  if (!run.summary) return 'Sem relatório final.';
  return `${run.summary.passed ?? 0}/${run.summary.total ?? 0} cenário(s) ok · ${run.summary.failed ?? 0} falha(s) · ${run.summary.error ?? 0} erro(s)`;
}

export function statusLabel(status: RunStatus): string {
  const labels: Record<RunStatus, string> = {
    queued: 'Na fila',
    running: 'Rodando',
    passed: 'Aprovado',
    failed: 'Falhou',
    error: 'Erro',
    canceled: 'Cancelado',
    deleted: 'Arquivado',
  };
  return labels[status] ?? status;
}

export function formatDate(value?: string | null): string {
  if (!value) return '-';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

export function shortId(value: string): string {
  return value.slice(0, 8);
}

export function suiteTypeLabel(type: Suite['type']): string {
  return type === 'web' ? 'Frontend' : 'API';
}
