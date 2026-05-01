'use client';

import type { Dispatch, SetStateAction } from 'react';
import { api } from '@/lib/api';
import type {
  AiConnection,
  AiDraft,
  Environment,
  Project,
  Run,
  RunReport,
  Suite,
} from '../../types';
import { formatDate } from '../../shared';

export function useV2SystemActions(input: {
  aiDraft: AiDraft;
  setAiDraft: Dispatch<SetStateAction<AiDraft>>;
  setAiOutput: Dispatch<SetStateAction<string>>;
  cleanupDays: string;
  setCleanupResult: Dispatch<SetStateAction<string>>;
  projectId: string;
  selectedProject?: Project;
  selectedSuite?: Suite;
  selectedEnv?: Environment;
  report: RunReport | null;
  performMutation: (
    operation: () => Promise<unknown>,
    success?: string,
  ) => Promise<void>;
}) {
  function editAiConnection(connection: AiConnection) {
    input.setAiDraft({
      id: connection.id,
      name: connection.name,
      provider: connection.provider,
      apiKey: '',
      model: connection.model,
      baseUrl: connection.baseUrl ?? '',
      enabled: connection.enabled,
    });
  }

  async function saveAiConnection() {
    await input.performMutation(
      () =>
        api('/api/ai/connections', {
          method: 'POST',
          body: JSON.stringify({
            id: input.aiDraft.id || undefined,
            name: input.aiDraft.name,
            provider: input.aiDraft.provider,
            apiKey: input.aiDraft.apiKey || undefined,
            model: input.aiDraft.model,
            baseUrl: input.aiDraft.baseUrl || undefined,
            enabled: input.aiDraft.enabled,
          }),
        }),
      input.aiDraft.id ? 'AI connection atualizada.' : 'AI connection criada.',
    );
  }

  async function explainFailure(run?: Run) {
    await runAi('explain-failure', run, 'Analise IA gerada.');
  }

  async function runAi(
    kind: 'explain-failure' | 'suggest-test-fix' | 'suggest-test-cases',
    run?: Run,
    success = 'IA gerada.',
  ) {
    if (!run) return;
    input.setAiOutput('');
    await input.performMutation(async () => {
      const result = await api<{ output?: string }>(`/api/ai/${kind}`, {
        method: 'POST',
        body: JSON.stringify({
          context: {
            run,
            report: input.report,
            suite: input.selectedSuite,
            environment: input.selectedEnv,
          },
        }),
      });
      input.setAiOutput(result.output ?? JSON.stringify(result, null, 2));
    }, success);
  }

  async function cleanupRuns() {
    await input.performMutation(async () => {
      const result = await api<{
        cutoffIso: string;
        archivedRuns: number;
        retainedArtifacts: boolean;
      }>('/api/cleanup', {
        method: 'POST',
        body: JSON.stringify({
          projectId: input.projectId || undefined,
          days: Number(input.cleanupDays),
          cleanupArtifacts: input.selectedProject?.cleanupArtifacts ?? false,
        }),
      });
      input.setCleanupResult(
        `${result.archivedRuns} runs arquivadas antes de ${formatDate(result.cutoffIso)}.`,
      );
    }, 'Cleanup executado.');
  }

  return {
    editAiConnection,
    saveAiConnection,
    explainFailure,
    runAi,
    cleanupRuns,
  };
}
