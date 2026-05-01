'use client';

import { useContext } from 'react';
import { V2ConsoleContext } from './V2ConsoleContext';

export function useV2Console() {
  const context = useContext(V2ConsoleContext);
  if (!context)
    throw new Error('useV2Console must be used within V2ConsoleProvider');
  return context;
}

export function useV2Selection() {
  const context = useV2Console();
  return {
    projects: context.projects,
    projectEnvs: context.projectEnvs,
    projectSuites: context.projectSuites,
    projectRuns: context.projectRuns,
    scopedRuns: context.scopedRuns,
    selectedProject: context.selectedProject,
    selectedSuite: context.selectedSuite,
    selectedEnv: context.selectedEnv,
    selectedRun: context.selectedRun,
    projectId: context.projectId,
    environmentId: context.environmentId,
    suiteId: context.suiteId,
    selectedRunId: context.selectedRunId,
    setProjectId: context.setProjectId,
    setEnvironmentId: context.setEnvironmentId,
    setSuiteId: context.setSuiteId,
    setSelectedRunId: context.setSelectedRunId,
  };
}

export function useV2Drafts() {
  const context = useV2Console();
  return {
    projectDraft: context.projectDraft,
    setProjectDraft: context.setProjectDraft,
    envDraft: context.envDraft,
    setEnvDraft: context.setEnvDraft,
    suiteDraft: context.suiteDraft,
    setSuiteDraft: context.setSuiteDraft,
    openApiDraft: context.openApiDraft,
    setOpenApiDraft: context.setOpenApiDraft,
    memberDraft: context.memberDraft,
    setMemberDraft: context.setMemberDraft,
    profileDraft: context.profileDraft,
    setProfileDraft: context.setProfileDraft,
    orgDraft: context.orgDraft,
    setOrgDraft: context.setOrgDraft,
    tokenDraft: context.tokenDraft,
    setTokenDraft: context.setTokenDraft,
    aiDraft: context.aiDraft,
    setAiDraft: context.setAiDraft,
    flowDraft: context.flowDraft,
    setFlowDraft: context.setFlowDraft,
    wizardDraft: context.wizardDraft,
    setWizardDraft: context.setWizardDraft,
  };
}

export function useV2Actions() {
  const context = useV2Console();
  return {
    runSuite: context.runSuite,
    runSuiteFor: context.runSuiteFor,
    selectSuite: context.selectSuite,
    deleteRun: context.deleteRun,
    cancelRun: context.cancelRun,
    openSuitePreview: context.openSuitePreview,
    saveProject: context.saveProject,
    archiveProject: context.archiveProject,
    editEnvironment: context.editEnvironment,
    newEnvironmentDraft: context.newEnvironmentDraft,
    saveEnvironment: context.saveEnvironment,
    archiveEnvironment: context.archiveEnvironment,
    loadSuite: context.loadSuite,
    newSuiteDraft: context.newSuiteDraft,
    validateSpec: context.validateSpec,
    saveSuite: context.saveSuite,
    importOpenApi: context.importOpenApi,
    createMember: context.createMember,
    saveProfile: context.saveProfile,
    createOrganization: context.createOrganization,
    switchOrganization: context.switchOrganization,
    setEditedMembership: context.setEditedMembership,
    saveUserMemberships: context.saveUserMemberships,
    createPersonalToken: context.createPersonalToken,
    revokePersonalToken: context.revokePersonalToken,
    editAiConnection: context.editAiConnection,
    saveAiConnection: context.saveAiConnection,
    cleanupRuns: context.cleanupRuns,
    editFlow: context.editFlow,
    saveFlow: context.saveFlow,
    archiveFlow: context.archiveFlow,
    logout: context.logout,
    explainFailure: context.explainFailure,
    runAi: context.runAi,
    finishWizard: context.finishWizard,
  };
}
