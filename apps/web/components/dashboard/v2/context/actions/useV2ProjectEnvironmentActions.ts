'use client';

import { api } from '@/lib/api';
import type { Environment, Project, Suite } from '../../types';
import { parseVars, splitList } from '../../shared/formUtils';
import type { V2WorkspaceActionsInput } from './workspaceActionTypes';

export function useV2ProjectEnvironmentActions(input: V2WorkspaceActionsInput) {
  const {
    projectId,
    setProjectId,
    setEnvironmentId,
    setSuiteId,
    setSelectedRunId,
    setTab,
    envDraft,
    setEnvDraft,
    projectDraft,
    openApiDraft,
    performMutation,
  } = input;

  function editEnvironment(env: Environment) {
    setEnvDraft({
      id: env.id,
      name: env.name,
      baseUrl: env.baseUrl,
      variables: Object.entries(env.variables ?? {})
        .map(([key, value]) => `${key}=${value}`)
        .join('\n'),
    });
    setEnvironmentId(env.id);
    setSelectedRunId('');
    setTab('overview');
  }

  function newEnvironmentDraft() {
    setEnvDraft({ id: '', name: '', baseUrl: '', variables: '' });
  }

  async function saveEnvironment() {
    if (!projectId) return;
    const payload = {
      name: envDraft.name,
      baseUrl: envDraft.baseUrl,
      variables: parseVars(envDraft.variables),
    };
    await performMutation(
      async () => {
        if (envDraft.id) {
          await api(`/api/environments/${envDraft.id}`, {
            method: 'PUT',
            body: JSON.stringify(payload),
          });
        } else {
          const env = await api<Environment>('/api/environments', {
            method: 'POST',
            body: JSON.stringify({ projectId, ...payload }),
          });
          setEnvDraft(current => ({ ...current, id: env.id }));
          setEnvironmentId(env.id);
        }
      },
      envDraft.id ? 'Ambiente atualizado.' : 'Ambiente criado.',
    );
  }

  async function archiveEnvironment(env: Environment) {
    if (
      !window.confirm(
        `Arquivar ambiente "${env.name}"? Runs vinculadas ficam ocultas.`,
      )
    )
      return;
    await performMutation(
      () => api(`/api/environments/${env.id}`, { method: 'DELETE' }),
      'Ambiente arquivado.',
    );
    if (envDraft.id === env.id) newEnvironmentDraft();
  }

  async function saveProject() {
    const payload = {
      name: projectDraft.name.trim(),
      description: projectDraft.description.trim() || undefined,
      retentionDays: Number(projectDraft.retentionDays) || undefined,
      cleanupArtifacts: projectDraft.cleanupArtifacts,
    };
    if (!payload.name) return;
    await performMutation(
      async () => {
        if (projectDraft.id) {
          await api<Project>(`/api/projects/${projectDraft.id}`, {
            method: 'PUT',
            body: JSON.stringify(payload),
          });
        } else {
          const project = await api<Project>('/api/projects', {
            method: 'POST',
            body: JSON.stringify(payload),
          });
          setProjectId(project.id);
        }
      },
      projectDraft.id ? 'Projeto atualizado.' : 'Projeto criado.',
    );
  }

  async function archiveProject(project: Project) {
    if (
      !window.confirm(
        `Arquivar projeto "${project.name}"? Ambientes, suites e runs vinculadas ficam ocultas.`,
      )
    )
      return;
    await performMutation(
      () => api(`/api/projects/${project.id}`, { method: 'DELETE' }),
      'Projeto arquivado.',
    );
    if (project.id === projectId) {
      setProjectId('');
      setEnvironmentId('');
      setSuiteId('');
      setSelectedRunId('');
    }
  }

  async function importOpenApi() {
    if (!projectId || !openApiDraft.spec.trim()) return;
    await performMutation(async () => {
      const parsed = JSON.parse(openApiDraft.spec);
      const suite = await api<Suite>('/api/import/openapi', {
        method: 'POST',
        body: JSON.stringify({
          projectId,
          name: openApiDraft.name || 'openapi-import',
          spec: parsed,
          baseUrl: openApiDraft.baseUrl || undefined,
          authTemplate: openApiDraft.authTemplate,
          headers: parseVars(openApiDraft.headers),
          tags: splitList(openApiDraft.tags),
          selectedOperations: splitList(openApiDraft.selectedOperations),
          includeBodyExamples: openApiDraft.includeBodyExamples,
        }),
      });
      setSuiteId(suite.id);
      setSelectedRunId('');
    }, 'OpenAPI importado.');
  }

  return {
    editEnvironment,
    newEnvironmentDraft,
    saveEnvironment,
    archiveEnvironment,
    saveProject,
    archiveProject,
    importOpenApi,
  };
}
