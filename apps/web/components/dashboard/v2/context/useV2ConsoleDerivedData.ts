'use client';

import { useMemo } from 'react';
import { useAuthQueries } from '../query/useAuthQueries';
import { useFlowQueries } from '../query/useFlowQueries';
import { useProjectQueries, useRunReportQuery } from '../query/useProjectQueries';
import { useSystemQueries } from '../query/useSystemQueries';
import type { Environment, Run, Suite } from '../types';
import { collectArtifacts, summarize } from '../shared';

export function useV2ConsoleDerivedData(input: {
  projectId: string;
  environmentId: string;
  suiteId: string;
  selectedRunId: string;
}) {
  const authQueries = useAuthQueries();
  const projectQueries = useProjectQueries();
  const flowQueries = useFlowQueries();
  const systemQueries = useSystemQueries();

  const me = authQueries.me.data ?? null;
  const members = authQueries.members.data ?? [];
  const personalTokens = authQueries.personalTokens.data ?? [];
  const projects = projectQueries.projects.data ?? [];
  const envs = projectQueries.environments.data ?? [];
  const suites = projectQueries.suites.data ?? [];
  const runs = projectQueries.runs.data ?? [];
  const flowLibrary = flowQueries.flows.data ?? [];
  const aiConnections = systemQueries.aiConnections.data ?? [];
  const security = systemQueries.security.data ?? null;
  const audit = systemQueries.audit.data ?? [];

  const projectEnvs = useMemo(
    () => envs.filter((env: Environment) => env.projectId === input.projectId),
    [envs, input.projectId],
  );
  const projectSuites = useMemo(
    () => suites.filter((suite: Suite) => suite.projectId === input.projectId),
    [suites, input.projectId],
  );
  const projectRuns = useMemo(
    () => runs.filter((run: Run) => run.projectId === input.projectId),
    [runs, input.projectId],
  );
  const selectedSuite = projectSuites.find((suite) => suite.id === input.suiteId);
  const selectedEnv = projectEnvs.find((env) => env.id === input.environmentId);
  const selectedProject = projects.find((project) => project.id === input.projectId);
  const scopedRuns = useMemo(
    () =>
      projectRuns.filter(
        (run) =>
          run.suiteId === input.suiteId &&
          run.environmentId === input.environmentId,
      ),
    [projectRuns, input.suiteId, input.environmentId],
  );
  const selectedRun =
    scopedRuns.find((run) => run.id === input.selectedRunId) ?? scopedRuns[0];
  const reportQuery = useRunReportQuery(selectedRun);
  const report = reportQuery.data ?? null;
  const role = (
    me
      ? me.membership.role
      : security?.auth.mode && security.auth.mode !== 'local'
        ? security.auth.rbacRole
        : 'viewer'
  ) as 'admin' | 'editor' | 'viewer';
  const canWrite = role === 'admin' || role === 'editor';
  const canAdmin = role === 'admin';
  const organizations = canAdmin
    ? (authQueries.organizations.data ?? [])
    : (me?.organizations ?? []);
  const managedUsers = canAdmin ? (authQueries.users.data ?? []) : [];
  const stats = summarize(scopedRuns);
  const artifacts = collectArtifacts(report);
  const videos = artifacts.filter((artifact) => artifact.type === 'video');
  const payloads = artifacts.filter(
    (artifact) => artifact.type === 'request' || artifact.type === 'response',
  );

  return {
    me,
    members,
    personalTokens,
    projects,
    envs,
    suites,
    runs,
    flowLibrary,
    aiConnections,
    security,
    audit,
    projectEnvs,
    projectSuites,
    projectRuns,
    selectedSuite,
    selectedEnv,
    selectedProject,
    scopedRuns,
    selectedRun,
    report,
    role,
    canWrite,
    canAdmin,
    organizations,
    managedUsers,
    stats,
    artifacts,
    videos,
    payloads,
  };
}
