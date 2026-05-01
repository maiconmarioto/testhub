import type { FlowDraft, FlowLibraryItem, Project } from '../types';

export function flowProjectLabel(flow: FlowLibraryItem, projects: Project[]): string {
  if (!flow.projectIds?.length) return 'todos';
  const names = flow.projectIds
    .map((id) => projects.find((project) => project.id === id)?.name)
    .filter(Boolean);
  if (names.length === 0) return `${flow.projectIds.length} projeto(s)`;
  if (names.length === 1) return names[0]!;
  return `${names.length} projetos`;
}

export function flowUseReference(namespace: string, name: string): string {
  const safeNamespace = namespace.trim() || 'namespace';
  const safeName = name.trim() || 'chave';
  return `${safeNamespace}.${safeName}`;
}

export function roughYamlListCount(value: string): number {
  return value.split('\n').filter((line) => /^\s*-\s+/.test(line)).length;
}

export function flowDraftProjectNames(draft: FlowDraft, projects: Project[]): string {
  const names = draft.projectIds
    .map((id) => projects.find((project) => project.id === id)?.name)
    .filter(Boolean);
  if (names.length === 0) return `${draft.projectIds.length} projeto(s)`;
  if (names.length <= 2) return names.join(', ');
  return `${names.slice(0, 2).join(', ')} +${names.length - 2}`;
}
