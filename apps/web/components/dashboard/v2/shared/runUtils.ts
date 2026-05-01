import type { Artifact, Environment, Run, RunReport, RunStatus, Suite } from '../types';
import { apiBase } from '@/lib/api';

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

type TimelineRow = { name: string; status: RunStatus; startedAt?: string; durationMs?: number; error?: string; artifacts: Artifact[] };

export function timelineRows(report: RunReport | null, run?: Run): TimelineRow[] {
  const rows = (report?.results ?? []).flatMap((result) => {
    const resultSteps = result.steps ?? [];
    if (resultSteps.length === 0) {
      return [{
        name: result.name,
        status: result.status,
        startedAt: result.startedAt,
        durationMs: result.durationMs,
        error: result.error,
        artifacts: result.artifacts ?? [],
      }];
    }
    return resultSteps.map((step) => ({
      name: `${result.name} / ${step.name}`,
      status: step.status,
      startedAt: step.startedAt ?? result.startedAt,
      durationMs: step.durationMs,
      error: step.error,
      artifacts: step.artifacts ?? result.artifacts ?? [],
    }));
  });
  if (rows.length > 0) return rows;
  if (!run) return [];
  if (run.progress) {
    return [{
      name: run.progress.currentTest ?? run.progress.phase,
      status: run.status,
      error: run.error ?? undefined,
      artifacts: [],
    }];
  }
  return [{
    name: 'Execução criada',
    status: run.status,
    error: run.error ?? undefined,
    artifacts: [],
  }];
}

export function buildRunMarkdown({ suite, env, run, report }: { suite: Suite; env?: Environment; run?: Run; report: RunReport | null }): string {
  const results = report?.results ?? [];
  const failedResults = results.filter((result) => result.status === 'failed' || result.status === 'error');
  const artifacts = collectArtifacts(report);
  const artifactCounts = countArtifactsByType(artifacts);
  const lines = [
    `# Relatório de execução - ${suite.name}`,
    '',
    `- Status: ${run ? statusLabel(run.status) : 'sem execução'}`,
    `- Resultado: ${run ? runSummary(run) : 'sem execução selecionada'}`,
    `- Ambiente: ${env ? `${env.name} (${env.baseUrl})` : 'não selecionado'}`,
    `- Início: ${run ? formatDate(run.startedAt ?? run.createdAt) : '-'}`,
    `- Fim: ${run ? formatDate(run.finishedAt) : '-'}`,
    `- Run: ${run ? run.id : 'sem run'}`,
    '',
    '## Resumo',
    '',
    `- Suite: ${suite.name} (${suiteTypeLabel(suite.type)})`,
    `- Dono: ${inferredOwner(suite)}`,
    `- Criticidade: ${inferredCriticality(suite)}`,
    `- Cenários: ${results.length || run?.summary?.total || 0}`,
    `- Evidências: ${formatArtifactCounts(artifactCounts)}`,
    '',
    '## Cenários',
    '',
  ];
  if (results.length === 0) {
    lines.push('- Cenários indisponíveis enquanto o relatório final não existe.');
  } else {
    results.forEach((result, index) => {
      const resultArtifacts = dedupeArtifacts(result.artifacts ?? []);
      lines.push(`${index + 1}. ${result.name}`);
      lines.push(`   - Status: ${statusLabel(result.status)}`);
      if (result.startedAt) lines.push(`   - Início: ${formatDate(result.startedAt)}`);
      if (result.durationMs !== undefined) lines.push(`   - Duração: ${result.durationMs}ms`);
      lines.push(`   - Passos: ${result.steps?.length ?? 0}`);
      if (resultArtifacts.length > 0) lines.push(`   - Evidências: ${formatArtifactCounts(countArtifactsByType(resultArtifacts))}`);
      if (result.error) lines.push(`   - Erro: ${redactStepText(result.error)}`);
    });
  }
  lines.push('', '## Falhas e passos relevantes', '');
  if (failedResults.length === 0) {
    lines.push('- Nenhuma falha. Passo a passo completo disponível na aba Passos e nas evidências brutas.');
  } else {
    failedResults.forEach((result) => {
      lines.push(`- ${result.name}: ${redactStepText(result.error ?? statusLabel(result.status))}`);
      result.steps
        ?.filter((step) => step.status === 'failed' || step.status === 'error')
        .slice(0, 5)
        .forEach((step) => lines.push(`  - ${redactStepText(step.name)}: ${redactStepText(step.error ?? statusLabel(step.status))}`));
    });
  }
  lines.push('', '## Artefatos', '');
  if (artifacts.length === 0) {
    lines.push('- Nenhum artefato disponível.');
  } else {
    lines.push(`- ${formatArtifactCounts(artifactCounts)}`);
    const reportArtifacts = artifacts.filter((artifact) => artifact.type === 'html' || artifact.type === 'json' || artifact.type === 'xml');
    reportArtifacts.forEach((artifact) => lines.push(`- ${artifact.type}: ${artifact.label ?? shortPath(artifact.path)}`));
  }
  return lines.join('\n');
}

export function countArtifactsByType(artifacts: Artifact[]): Record<string, number> {
  return artifacts.reduce<Record<string, number>>((counts, artifact) => {
    counts[artifact.type] = (counts[artifact.type] ?? 0) + 1;
    return counts;
  }, {});
}

export function formatArtifactCounts(counts: Record<string, number>): string {
  const entries = Object.entries(counts);
  if (entries.length === 0) return 'nenhuma';
  return entries.map(([type, count]) => `${count} ${artifactTypeLabel(type)}`).join(' · ');
}

export function artifactTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    html: 'HTML',
    json: 'JSON',
    xml: 'JUnit',
    log: 'log(s)',
    video: 'vídeo(s)',
    trace: 'trace(s)',
    screenshot: 'screenshot(s)',
    request: 'request(s)',
    response: 'response(s)',
  };
  return labels[type] ?? type;
}

export function collectArtifacts(report: RunReport | null): Artifact[] {
  return dedupeArtifacts([
    ...(report?.artifacts ?? []),
    ...((report?.results ?? []).flatMap((result) => result.artifacts ?? [])),
  ]);
}

export function dedupeArtifacts(artifacts: Artifact[]): Artifact[] {
  const seen = new Set<string>();
  return artifacts.filter((artifact) => {
    const key = `${artifact.type}:${artifact.path}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function groupHttpArtifacts(artifacts: Artifact[]): Array<{ request?: Artifact; response?: Artifact }> {
  const groups: Array<{ request?: Artifact; response?: Artifact }> = [];
  for (const artifact of artifacts) {
    if (artifact.type === 'request') {
      groups.push({ request: artifact });
      continue;
    }
    if (artifact.type === 'response') {
      let openGroup: { request?: Artifact; response?: Artifact } | undefined;
      for (let index = groups.length - 1; index >= 0; index -= 1) {
        if (groups[index].request && !groups[index].response) {
          openGroup = groups[index];
          break;
        }
      }
      if (openGroup) {
        openGroup.response = artifact;
      } else {
        groups.push({ response: artifact });
      }
    }
  }
  return groups;
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

export function shortPath(value: string): string {
  return value.split('/').slice(-2).join('/');
}

export function artifactUrl(path: string): string {
  return `${apiBase}/artifacts?path=${encodeURIComponent(path)}`;
}

export function suiteTypeLabel(type: Suite['type']): string {
  return type === 'web' ? 'Frontend' : 'API';
}

export function redactStepText(value: string): string {
  return value.split(' / ').map((segment) => {
    const separatorIndex = segment.indexOf(': ');
    if (separatorIndex === -1) return segment;
    const prefix = segment.slice(0, separatorIndex + 2);
    const payload = segment.slice(separatorIndex + 2);
    if (!payload.trim().startsWith('{')) return redactPlainSensitive(payload, prefix);
    try {
      return `${prefix}${JSON.stringify(redactStepPayload(JSON.parse(payload)))}`;
    } catch {
      return redactPlainSensitive(segment, '');
    }
  }).join(' / ');
}

export function redactStepPayload(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactStepPayload);
  if (!value || typeof value !== 'object') return value;
  const input = value as Record<string, unknown>;
  const descriptor = [input.by, input.target, input.name, input.label, input.selector, input.text]
    .filter((item): item is string => typeof item === 'string')
    .join(' ');
  return Object.fromEntries(Object.entries(input).map(([key, nestedValue]) => {
    if (key === 'value' && isSensitiveDescriptor(descriptor)) return [key, '[REDACTED]'];
    if (isSensitiveDescriptor(key)) return [key, '[REDACTED]'];
    return [key, redactStepPayload(nestedValue)];
  }));
}

export function redactPlainSensitive(value: string, prefix: string): string {
  if (!isSensitiveDescriptor(`${prefix} ${value}`)) return `${prefix}${value}`;
  return `${prefix}[REDACTED]`;
}

export function isSensitiveDescriptor(value: string): boolean {
  return /(authorization|cookie|set-cookie|token|secret|password|senha|api[-_ ]?key)/i.test(value);
}
