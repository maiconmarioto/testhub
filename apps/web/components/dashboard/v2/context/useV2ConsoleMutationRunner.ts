'use client';

import { type Dispatch, type SetStateAction } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../query/queryKeys';
import { messageOf } from '../shared/formUtils';

export function useV2ConsoleMutationRunner(input: {
  setBusy: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<string>>;
  setNotice: Dispatch<SetStateAction<string>>;
}) {
  const queryClient = useQueryClient();

  async function invalidateDashboardData() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.authMe }),
      queryClient.invalidateQueries({ queryKey: queryKeys.members }),
      queryClient.invalidateQueries({ queryKey: queryKeys.personalTokens }),
      queryClient.invalidateQueries({ queryKey: queryKeys.projects }),
      queryClient.invalidateQueries({ queryKey: queryKeys.environments }),
      queryClient.invalidateQueries({ queryKey: queryKeys.suites }),
      queryClient.invalidateQueries({ queryKey: queryKeys.runs }),
      queryClient.invalidateQueries({ queryKey: queryKeys.flows }),
      queryClient.invalidateQueries({ queryKey: queryKeys.aiConnections }),
      queryClient.invalidateQueries({ queryKey: queryKeys.security }),
      queryClient.invalidateQueries({ queryKey: queryKeys.audit }),
      queryClient.invalidateQueries({ queryKey: queryKeys.organizations }),
      queryClient.invalidateQueries({ queryKey: queryKeys.users }),
    ]);
  }

  const operationMutation = useMutation({
    mutationFn: (operation: () => Promise<unknown>) => operation(),
    onSuccess: invalidateDashboardData,
  });

  async function performMutation(
    operation: () => Promise<unknown>,
    success?: string,
  ) {
    input.setBusy(true);
    input.setError('');
    input.setNotice('');
    try {
      await operationMutation.mutateAsync(operation);
      if (success) input.setNotice((current) => current || success);
    } catch (nextError) {
      input.setError(messageOf(nextError));
    } finally {
      input.setBusy(false);
    }
  }

  return {
    queryClient,
    operationPending: operationMutation.isPending,
    performMutation,
  };
}
