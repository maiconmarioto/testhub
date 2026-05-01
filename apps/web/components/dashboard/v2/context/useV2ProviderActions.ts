'use client';

import type { Dispatch, SetStateAction } from 'react';
import { api } from '@/lib/api';
import type {
  AiConnection,
  AiDraft,
  AuthMe,
  Environment,
  FlowDraft,
  MemberDraft,
  MembershipEdit,
  OpenApiDraft,
  Organization,
  OrganizationDraft,
  Project,
  ProjectDraft,
  ProfileDraft,
  Run,
  RunReport,
  Suite,
  SuiteDraft,
  SuiteWithContent,
  TokenDraft,
  UserManagementItem,
  ValidationResult,
  WizardDraft,
} from '../types';
import { messageOf } from '../shared/formUtils';
import { useV2FlowActions } from './actions/useV2FlowActions';
import { useV2SettingsActions } from './actions/useV2SettingsActions';
import { useV2SystemActions } from './actions/useV2SystemActions';
import { useV2WorkspaceActions } from './actions/useV2WorkspaceActions';
import { useV2ConsoleMutationRunner } from './useV2ConsoleMutationRunner';

export function useV2ProviderActions(input: {
  projectId: string;
  setProjectId: Dispatch<SetStateAction<string>>;
  environmentId: string;
  setEnvironmentId: Dispatch<SetStateAction<string>>;
  suiteId: string;
  setSuiteId: Dispatch<SetStateAction<string>>;
  setSelectedRunId: Dispatch<SetStateAction<string>>;
  setTab: Dispatch<SetStateAction<'overview' | 'timeline' | 'artifacts' | 'payload'>>;
  setError: Dispatch<SetStateAction<string>>;
  setBusy: Dispatch<SetStateAction<boolean>>;
  setNotice: Dispatch<SetStateAction<string>>;
  projectRuns: Run[];
  selectedProject?: Project;
  selectedSuite?: Suite;
  selectedEnv?: Environment;
  report: RunReport | null;
  suiteDraft: SuiteDraft;
  setSuiteDraft: Dispatch<SetStateAction<SuiteDraft>>;
  validation: ValidationResult | null;
  setValidation: Dispatch<SetStateAction<ValidationResult | null>>;
  approvedAiPatch: boolean;
  setApprovedAiPatch: Dispatch<SetStateAction<boolean>>;
  envDraft: { id: string; name: string; baseUrl: string; variables: string };
  setEnvDraft: Dispatch<SetStateAction<{ id: string; name: string; baseUrl: string; variables: string }>>;
  projectDraft: ProjectDraft;
  openApiDraft: OpenApiDraft;
  wizardDraft: WizardDraft;
  setWizardOpen: Dispatch<SetStateAction<boolean>>;
  setWizardStep: Dispatch<SetStateAction<number>>;
  setSuitePreview: Dispatch<SetStateAction<SuiteWithContent | null>>;
  setSuitePreviewOpen: Dispatch<SetStateAction<boolean>>;
  flowDraft: FlowDraft;
  setFlowDraft: Dispatch<SetStateAction<FlowDraft>>;
  aiDraft: AiDraft;
  setAiDraft: Dispatch<SetStateAction<AiDraft>>;
  setAiOutput: Dispatch<SetStateAction<string>>;
  cleanupDays: string;
  setCleanupResult: Dispatch<SetStateAction<string>>;
  me: AuthMe | null;
  memberDraft: MemberDraft;
  setMemberDraft: Dispatch<SetStateAction<MemberDraft>>;
  profileDraft: ProfileDraft;
  setProfileDraft: Dispatch<SetStateAction<ProfileDraft>>;
  orgDraft: OrganizationDraft;
  setOrgDraft: Dispatch<SetStateAction<OrganizationDraft>>;
  membershipEdit: MembershipEdit;
  setMembershipEdit: Dispatch<SetStateAction<MembershipEdit>>;
  tokenDraft: TokenDraft;
  setTokenDraft: Dispatch<SetStateAction<TokenDraft>>;
}) {
  const { operationPending, performMutation, queryClient } =
    useV2ConsoleMutationRunner({
      setBusy: input.setBusy,
      setError: input.setError,
      setNotice: input.setNotice,
    });

  async function logout() {
    input.setBusy(true);
    input.setError('');
    try {
      await api('/api/auth/logout', { method: 'POST', body: '{}' }).catch(
        () => undefined,
      );
      window.localStorage.removeItem('testhub.token');
      window.location.assign('/login');
    } catch (nextError) {
      input.setError(messageOf(nextError));
      input.setBusy(false);
    }
  }

  const flowActions = useV2FlowActions({
    flowDraft: input.flowDraft,
    setFlowDraft: input.setFlowDraft,
    performMutation,
    queryClient,
  });
  const systemActions = useV2SystemActions({
    aiDraft: input.aiDraft,
    setAiDraft: input.setAiDraft,
    setAiOutput: input.setAiOutput,
    cleanupDays: input.cleanupDays,
    setCleanupResult: input.setCleanupResult,
    projectId: input.projectId,
    selectedProject: input.selectedProject,
    selectedSuite: input.selectedSuite,
    selectedEnv: input.selectedEnv,
    report: input.report,
    performMutation,
  });
  const settingsActions = useV2SettingsActions({
    me: input.me,
    memberDraft: input.memberDraft,
    setMemberDraft: input.setMemberDraft,
    profileDraft: input.profileDraft,
    setProfileDraft: input.setProfileDraft,
    orgDraft: input.orgDraft,
    setOrgDraft: input.setOrgDraft,
    membershipEdit: input.membershipEdit,
    setMembershipEdit: input.setMembershipEdit,
    tokenDraft: input.tokenDraft,
    setTokenDraft: input.setTokenDraft,
    setNotice: input.setNotice,
    performMutation,
    queryClient,
  });
  const workspaceActions = useV2WorkspaceActions({
    projectId: input.projectId,
    setProjectId: input.setProjectId,
    environmentId: input.environmentId,
    setEnvironmentId: input.setEnvironmentId,
    suiteId: input.suiteId,
    setSuiteId: input.setSuiteId,
    setSelectedRunId: input.setSelectedRunId,
    setTab: input.setTab,
    setError: input.setError,
    setBusy: input.setBusy,
    setNotice: input.setNotice,
    projectRuns: input.projectRuns,
    selectedSuite: input.selectedSuite,
    suiteDraft: input.suiteDraft,
    setSuiteDraft: input.setSuiteDraft,
    validation: input.validation,
    setValidation: input.setValidation,
    approvedAiPatch: input.approvedAiPatch,
    setApprovedAiPatch: input.setApprovedAiPatch,
    envDraft: input.envDraft,
    setEnvDraft: input.setEnvDraft,
    projectDraft: input.projectDraft,
    openApiDraft: input.openApiDraft,
    wizardDraft: input.wizardDraft,
    setWizardOpen: input.setWizardOpen,
    setWizardStep: input.setWizardStep,
    setSuitePreview: input.setSuitePreview,
    setSuitePreviewOpen: input.setSuitePreviewOpen,
    performMutation,
  });

  return {
    operationPending,
    logout,
    ...flowActions,
    ...systemActions,
    ...settingsActions,
    ...workspaceActions,
  };
}
