import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { FlowLibraryItem } from '../types';
import { queryKeys } from './queryKeys';

export function useFlowQueries() {
  return {
    flows: useQuery({
      queryKey: queryKeys.flows,
      queryFn: () =>
        api<FlowLibraryItem[]>('/api/flows', {
          redirectOnUnauthorized: false,
        }).catch(() => []),
    }),
  };
}
