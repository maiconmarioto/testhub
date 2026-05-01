'use client';

import type { QueryClient } from '@tanstack/react-query';
import type { Dispatch, SetStateAction } from 'react';
import YAML from 'yaml';
import { api } from '@/lib/api';
import { defaultFlowDraft } from '../../constants';
import { queryKeys } from '../../query/queryKeys';
import type { FlowDraft, FlowLibraryItem } from '../../types';

export function useV2FlowActions(input: {
  flowDraft: FlowDraft;
  setFlowDraft: Dispatch<SetStateAction<FlowDraft>>;
  performMutation: (
    operation: () => Promise<unknown>,
    success?: string,
  ) => Promise<void>;
  queryClient: QueryClient;
}) {
  function editFlow(flow: FlowLibraryItem) {
    input.setFlowDraft({
      id: flow.id,
      namespace: flow.namespace,
      name: flow.name,
      displayName: flow.displayName ?? flow.name,
      description: flow.description ?? '',
      projectIds: flow.projectIds ?? [],
      params: flow.params ? YAML.stringify(flow.params).trim() : '',
      steps: YAML.stringify(flow.steps).trim(),
    });
  }

  async function saveFlow() {
    const namespace = input.flowDraft.namespace.trim();
    const name = input.flowDraft.name.trim();
    const displayName = input.flowDraft.displayName.trim();
    if (!namespace || !name || !displayName) return;
    await input.performMutation(
      async () => {
        const params = input.flowDraft.params.trim()
          ? YAML.parse(input.flowDraft.params)
          : undefined;
        const steps = YAML.parse(input.flowDraft.steps);
        if (!Array.isArray(steps))
          throw new Error('Passos deve ser uma lista YAML.');
        const payload = {
          namespace,
          name,
          displayName,
          description: input.flowDraft.description.trim() || undefined,
          projectIds:
            input.flowDraft.projectIds.length > 0
              ? input.flowDraft.projectIds
              : undefined,
          params,
          steps,
        };
        await api(
          input.flowDraft.id
            ? `/api/flows/${input.flowDraft.id}`
            : '/api/flows',
          {
            method: input.flowDraft.id ? 'PUT' : 'POST',
            body: JSON.stringify(payload),
          },
        );
        input.setFlowDraft(defaultFlowDraft);
      },
      input.flowDraft.id ? 'Flow atualizado.' : 'Flow criado.',
    );
  }

  async function archiveFlow(flowId: string) {
    await input.performMutation(async () => {
      await api(`/api/flows/${flowId}`, { method: 'DELETE' });
      input.queryClient.setQueryData<FlowLibraryItem[]>(
        queryKeys.flows,
        (current) => (current ?? []).filter((flow) => flow.id !== flowId),
      );
      input.setFlowDraft((current) =>
        current.id === flowId ? defaultFlowDraft : current,
      );
    }, 'Flow arquivado.');
  }

  return { editFlow, saveFlow, archiveFlow };
}
