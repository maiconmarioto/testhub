import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Environment, Project, Run, RunReport, Suite } from '../types';
import { queryKeys } from './queryKeys';

export function useProjectQueries() {
  return {
    projects: useQuery({
      queryKey: queryKeys.projects,
      queryFn: () => api<Project[]>('/api/projects'),
    }),
    environments: useQuery({
      queryKey: queryKeys.environments,
      queryFn: () => api<Environment[]>('/api/environments'),
    }),
    suites: useQuery({
      queryKey: queryKeys.suites,
      queryFn: () => api<Suite[]>('/api/suites'),
    }),
    runs: useQuery({
      queryKey: queryKeys.runs,
      queryFn: () => api<Run[]>('/api/runs'),
      refetchInterval: 3000,
    }),
  };
}

export function useRunReportQuery(run?: Run) {
  return useQuery({
    queryKey: queryKeys.runReport(run?.id ?? ''),
    queryFn: () => api<RunReport>(`/api/runs/${run!.id}/report`),
    enabled: Boolean(run?.id && run.reportPath),
  });
}
