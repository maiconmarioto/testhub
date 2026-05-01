import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { AiConnection, AuditEntry, SecurityStatus } from '../types';
import { queryKeys } from './queryKeys';

export function useSystemQueries() {
  return {
    aiConnections: useQuery({
      queryKey: queryKeys.aiConnections,
      queryFn: () => api<AiConnection[]>('/api/ai/connections').catch(() => []),
    }),
    security: useQuery({
      queryKey: queryKeys.security,
      queryFn: () =>
        api<SecurityStatus>('/api/system/security').catch(() => null),
    }),
    audit: useQuery({
      queryKey: queryKeys.audit,
      queryFn: () => api<AuditEntry[]>('/api/audit?limit=40').catch(() => []),
    }),
  };
}
