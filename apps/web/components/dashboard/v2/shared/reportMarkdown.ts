import type { Artifact, Environment, Run, RunReport, RunStatus, Suite } from '../types';
import { collectArtifacts, countArtifactsByType, dedupeArtifacts, formatArtifactCounts, shortPath } from './artifactUtils';
import { formatDate, inferredCriticality, inferredOwner, runSummary, statusLabel, suiteTypeLabel } from './statusUtils';

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
