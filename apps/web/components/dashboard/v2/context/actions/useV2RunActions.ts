'use client';

import { api } from '@/lib/api';
import type { Run, Suite } from '../../types';
import { latestRun, shortId } from '../../shared/runUtils';
import type { V2WorkspaceActionsInput } from './workspaceActionTypes';

export function useV2RunActions(input: V2WorkspaceActionsInput) {
  const {
    projectId,
    environmentId,
    suiteId,
    setEnvironmentId,
    setSuiteId,
    setSelectedRunId,
    setTab,
    setError,
    projectRuns,
    performMutation,
  } = input;

  async function runSuite() {
    if (!projectId || !environmentId || !suiteId) {
      setError('Projeto, ambiente e suite obrigatórios.');
      return;
    }
    await runSuiteFor({ projectId, environmentId, suiteId });
  }

  async function runSuiteFor(nextRun: {
    projectId: string;
    environmentId: string;
    suiteId: string;
  }) {
    await performMutation(async () => {
      const run = await api<Run>('/api/runs', {
        method: 'POST',
        body: JSON.stringify(nextRun),
      });
      setSuiteId(run.suiteId);
      setEnvironmentId(run.environmentId);
      setSelectedRunId(run.id);
      setTab('overview');
    }, 'Execução enviada.');
  }

  function selectSuite(suite: Suite, nextEnvironmentId = environmentId) {
    setSuiteId(suite.id);
    if (nextEnvironmentId) setEnvironmentId(nextEnvironmentId);
    const run = latestRun(projectRuns, {
      suiteId: suite.id,
      environmentId: nextEnvironmentId || undefined,
    });
    setSelectedRunId(run?.id ?? '');
    setTab('overview');
  }

  async function cancelRun(run: Run) {
    await performMutation(
      () => api(`/api/runs/${run.id}/cancel`, { method: 'POST', body: '{}' }),
      'Execução cancelada.',
    );
  }

  async function deleteRun(run: Run) {
    if (
      !window.confirm(
        `Excluir run ${shortId(run.id)}? Esta ação oculta a execução desta seleção.`,
      )
    )
      return;
    await performMutation(async () => {
      await api(`/api/runs/${run.id}`, { method: 'DELETE' });
      setSelectedRunId(current => (current === run.id ? '' : current));
    }, 'Run excluída.');
  }

  return { runSuite, runSuiteFor, selectSuite, cancelRun, deleteRun };
}
