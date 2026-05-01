import { apiBase } from '@/lib/api';
import type { Artifact, RunReport } from '../types';

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

export function shortPath(value: string): string {
  return value.split('/').slice(-2).join('/');
}

export function artifactUrl(path: string): string {
  return `${apiBase}/artifacts?path=${encodeURIComponent(path)}`;
}
