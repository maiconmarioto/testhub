'use client';

import { useMemo } from 'react';
import { useAuthQueries } from '../query/useAuthQueries';
import { useFlowQueries } from '../query/useFlowQueries';
import { useProjectQueries, useRunReportQuery } from '../query/useProjectQueries';
import { useSystemQueries } from '../query/useSystemQueries';
import type {
  AiConnection,
  AuditEntry,
  Environment,
  FlowLibraryItem,
  Organization,
  OrganizationMember,
  PersonalAccessToken,
  Project,
  Run,
  Suite,
  UserManagementItem,
} from '../types';
import { collectArtifacts, summarize } from '../shared/runUtils';

const emptyMembers: OrganizationMember[] = [];
const emptyTokens: PersonalAccessToken[] = [];
const emptyProjects: Project[] = [];
const emptyEnvs: Environment[] = [];
const emptySuites: Suite[] = [];
const emptyRuns: Run[] = [];
const emptyFlows: FlowLibraryItem[] = [];
const emptyAiConnections: AiConnection[] = [];
const emptyAudit: AuditEntry[] = [];
const emptyOrganizations: Organization[] = [];
const emptyUsers: UserManagementItem[] = [];

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
  const members = authQueries.members.data ?? emptyMembers;
  const personalTokens = authQueries.personalTokens.data ?? emptyTokens;
  const projects = projectQueries.projects.data ?? emptyProjects;
  const envs = projectQueries.environments.data ?? emptyEnvs;
  const suites = projectQueries.suites.data ?? emptySuites;
  const runs = projectQueries.runs.data ?? emptyRuns;
  const flowLibrary = flowQueries.flows.data ?? emptyFlows;
  const aiConnections = systemQueries.aiConnections.data ?? emptyAiConnections;
  const security = systemQueries.security.data ?? null;
  const audit = systemQueries.audit.data ?? emptyAudit;

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
    ? (authQueries.organizations.data ?? emptyOrganizations)
    : (me?.organizations ?? emptyOrganizations);
  const managedUsers = canAdmin ? (authQueries.users.data ?? emptyUsers) : emptyUsers;
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
