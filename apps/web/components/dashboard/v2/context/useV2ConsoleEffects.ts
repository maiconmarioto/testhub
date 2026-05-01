'use client';

import {
  type Dispatch,
  type SetStateAction,
  useEffect,
  useRef,
} from 'react';
import { api } from '@/lib/api';
import type {
  AuthMe,
  ConsoleSection,
  Environment,
  MembershipEdit,
  Organization,
  ProfileDraft,
  Project,
  ProjectDraft,
  SecurityStatus,
  Suite,
  SuiteDraft,
  SuiteWithContent,
  UserManagementItem,
  ValidationResult,
} from '../types';
import { mergeMembershipEdit, messageOf } from '../shared';

export function useV2ConsoleEffects(input: {
  section: ConsoleSection;
  me: AuthMe | null;
  projects: Project[];
  projectId: string;
  environmentId: string;
  projectEnvs: Environment[];
  projectSuites: Suite[];
  suiteId: string;
  selectedRunId: string;
  security: SecurityStatus | null;
  canAdmin: boolean;
  managedUsers: UserManagementItem[];
  organizations: Organization[];
  setProfileDraft: Dispatch<SetStateAction<ProfileDraft>>;
  setProjectDraft: Dispatch<SetStateAction<ProjectDraft>>;
  setCleanupDays: Dispatch<SetStateAction<string>>;
  setMembershipEdit: Dispatch<SetStateAction<MembershipEdit>>;
  setSuiteDraft: Dispatch<SetStateAction<SuiteDraft>>;
  setValidation: Dispatch<SetStateAction<ValidationResult | null>>;
  setError: Dispatch<SetStateAction<string>>;
  setEnvironmentId: Dispatch<SetStateAction<string>>;
  setSuiteId: Dispatch<SetStateAction<string>>;
  setSelectedRunId: Dispatch<SetStateAction<string>>;
}) {
  const queryAppliedRef = useRef(false);
  const suiteAutoLoadRef = useRef('');

  useEffect(() => {
    input.setProfileDraft((current) => ({
      name:
        current.name === '' || current.name === input.me?.user.name
          ? (input.me?.user.name ?? '')
          : current.name,
      email:
        current.email === '' || current.email === input.me?.user.email
          ? (input.me?.user.email ?? '')
          : current.email,
      currentPassword: current.currentPassword,
      newPassword: current.newPassword,
    }));
  }, [input.me?.user.email, input.me?.user.name, input.setProfileDraft]);

  useEffect(() => {
    const current = input.projects.find((project) => project.id === input.projectId);
    input.setProjectDraft({
      id: current?.id ?? '',
      name: current?.name ?? '',
      description: current?.description ?? '',
      retentionDays: String(
        current?.retentionDays ?? input.security?.retention.days ?? 30,
      ),
      cleanupArtifacts: Boolean(current?.cleanupArtifacts),
    });
  }, [input.projectId, input.projects, input.security?.retention.days, input.setProjectDraft]);

  useEffect(() => {
    if (input.security?.retention.days)
      input.setCleanupDays(String(input.security.retention.days));
  }, [input.security?.retention.days, input.setCleanupDays]);

  useEffect(() => {
    if (!input.canAdmin) {
      input.setMembershipEdit({});
      return;
    }
    input.setMembershipEdit((current) =>
      mergeMembershipEdit(current, input.managedUsers, input.organizations),
    );
  }, [input.canAdmin, input.managedUsers, input.organizations, input.setMembershipEdit]);

  useEffect(() => {
    if (
      input.section !== 'suites' ||
      !input.suiteId ||
      suiteAutoLoadRef.current === input.suiteId
    )
      return;
    const suite = input.projectSuites.find((item) => item.id === input.suiteId);
    if (!suite) return;
    suiteAutoLoadRef.current = input.suiteId;
    api<SuiteWithContent>(`/api/suites/${suite.id}`)
      .then((loaded) => {
        input.setSuiteDraft({
          id: loaded.id,
          name: loaded.name,
          type: loaded.type,
          specContent: loaded.specContent,
        });
        input.setValidation(null);
      })
      .catch((nextError) => input.setError(messageOf(nextError)));
  }, [input.section, input.suiteId, input.projectSuites, input.setSuiteDraft, input.setValidation, input.setError]);

  useEffect(() => {
    input.setEnvironmentId((current) =>
      current && input.projectEnvs.some((env) => env.id === current)
        ? current
        : (input.projectEnvs[0]?.id ?? ''),
    );
    input.setSuiteId((current) =>
      current && input.projectSuites.some((suite) => suite.id === current)
        ? current
        : (input.projectSuites[0]?.id ?? ''),
    );
  }, [input.projectId, input.projectEnvs, input.projectSuites, input.setEnvironmentId, input.setSuiteId]);

  useEffect(() => {
    if (queryAppliedRef.current || !input.projectId || input.projects.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    const queryEnvironment = params.get('environment');
    const querySuite = params.get('suite');
    const queryRun = params.get('run');

    if (
      queryEnvironment &&
      input.projectEnvs.some((env) => env.id === queryEnvironment)
    )
      input.setEnvironmentId(queryEnvironment);
    if (querySuite && input.projectSuites.some((suite) => suite.id === querySuite))
      input.setSuiteId(querySuite);
    if (queryRun) input.setSelectedRunId(queryRun);
    queryAppliedRef.current = true;
  }, [
    input.projectId,
    input.projectEnvs,
    input.projectSuites,
    input.projects.length,
    input.setEnvironmentId,
    input.setSelectedRunId,
    input.setSuiteId,
  ]);

  useEffect(() => {
    if (!input.projectId || typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    params.set('project', input.projectId);
    if (input.environmentId) params.set('environment', input.environmentId);
    else params.delete('environment');
    if (input.suiteId) params.set('suite', input.suiteId);
    else params.delete('suite');
    if (input.selectedRunId) params.set('run', input.selectedRunId);
    else params.delete('run');

    const query = params.toString();
    const nextUrl = query
      ? `${window.location.pathname}?${query}`
      : window.location.pathname;
    const currentUrl = `${window.location.pathname}${window.location.search}`;
    if (nextUrl !== currentUrl) window.history.replaceState(null, '', nextUrl);
  }, [input.projectId, input.environmentId, input.suiteId, input.selectedRunId]);
}
