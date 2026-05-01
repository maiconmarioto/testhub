'use client';

import { type ReactNode } from 'react';
import { api } from '@/lib/api';
import { defaultSpec } from '../constants';
import { V2ConsoleContext, type V2ConsoleContextValue } from './V2ConsoleContext';
import { useV2ConsoleEffects } from './useV2ConsoleEffects';
import { useV2ConsoleDerivedData } from './useV2ConsoleDerivedData';
import { useV2ConsoleLocalState } from './useV2ConsoleLocalState';
import { useV2ConsoleMutationRunner } from './useV2ConsoleMutationRunner';
import { useV2FlowActions } from './actions/useV2FlowActions';
import { useV2SettingsActions } from './actions/useV2SettingsActions';
import { useV2SystemActions } from './actions/useV2SystemActions';
import type {
  ConsoleSection,
  Environment,
  Project,
  Run,
  Suite,
  SuiteWithContent,
  ValidationResult,
} from '../types';
import {
  latestRun,
  messageOf,
  parseVars,
  runSummary,
  shortId,
  splitList,
} from '../shared';

export function V2ConsoleProvider({
  section,
  children,
}: {
  section: ConsoleSection;
  children: ReactNode;
}) {
  const {
    projectId,
    setProjectId,
    environmentId,
    setEnvironmentId,
    suiteId,
    setSuiteId,
    selectedRunId,
    setSelectedRunId,
    suiteSearch,
    setSuiteSearch,
    suiteTypeFilter,
    setSuiteTypeFilter,
    tab,
    setTab,
    busy,
    setBusy,
    error,
    setError,
    notice,
    setNotice,
    openSheet,
    setOpenSheet,
    projectDraft,
    setProjectDraft,
    openApiDraft,
    setOpenApiDraft,
    suiteDraft,
    setSuiteDraft,
    envDraft,
    setEnvDraft,
    aiDraft,
    setAiDraft,
    memberDraft,
    setMemberDraft,
    profileDraft,
    setProfileDraft,
    orgDraft,
    setOrgDraft,
    membershipEdit,
    setMembershipEdit,
    tokenDraft,
    setTokenDraft,
    flowDraft,
    setFlowDraft,
    aiOutput,
    setAiOutput,
    cleanupDays,
    setCleanupDays,
    cleanupResult,
    setCleanupResult,
    validation,
    setValidation,
    approvedAiPatch,
    setApprovedAiPatch,
    wizardOpen,
    setWizardOpen,
    suitePreviewOpen,
    setSuitePreviewOpen,
    suitePreview,
    setSuitePreview,
    wizardStep,
    setWizardStep,
    wizardDraft,
    setWizardDraft,
  } = useV2ConsoleLocalState();

  const {
    me,
    members,
    personalTokens,
    projects,
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
  } = useV2ConsoleDerivedData({
    projectId,
    environmentId,
    suiteId,
    selectedRunId,
  });

  async function logout() {
    setBusy(true);
    setError('');
    try {
      await api('/api/auth/logout', { method: 'POST', body: '{}' }).catch(
        () => undefined,
      );
      window.localStorage.removeItem('testhub.token');
      window.location.assign('/login');
    } catch (nextError) {
      setError(messageOf(nextError));
      setBusy(false);
    }
  }

  useV2ConsoleEffects({
    section,
    me,
    projects,
    projectId,
    environmentId,
    projectEnvs,
    projectSuites,
    suiteId,
    selectedRunId,
    security,
    canAdmin,
    managedUsers,
    organizations,
    setProfileDraft,
    setProjectDraft,
    setCleanupDays,
    setMembershipEdit,
    setSuiteDraft,
    setValidation,
    setError,
    setEnvironmentId,
    setSuiteId,
    setSelectedRunId,
  });

  const { operationPending, performMutation, queryClient } =
    useV2ConsoleMutationRunner({
      setBusy,
      setError,
      setNotice,
    });
  const { editFlow, saveFlow, archiveFlow } = useV2FlowActions({
    flowDraft,
    setFlowDraft,
    performMutation,
    queryClient,
  });
  const {
    editAiConnection,
    saveAiConnection,
    explainFailure,
    runAi,
    cleanupRuns,
  } = useV2SystemActions({
    aiDraft,
    setAiDraft,
    setAiOutput,
    cleanupDays,
    setCleanupResult,
    projectId,
    selectedProject,
    selectedSuite,
    selectedEnv,
    report,
    performMutation,
  });
  const {
    createMember,
    saveProfile,
    createOrganization,
    switchOrganization,
    setEditedMembership,
    saveUserMemberships,
    createPersonalToken,
    revokePersonalToken,
  } = useV2SettingsActions({
    me,
    memberDraft,
    setMemberDraft,
    profileDraft,
    setProfileDraft,
    orgDraft,
    setOrgDraft,
    membershipEdit,
    setMembershipEdit,
    tokenDraft,
    setTokenDraft,
    setNotice,
    performMutation,
    queryClient,
  });

  async function runSuite() {
    if (!projectId || !environmentId || !suiteId) {
      setError('Projeto, ambiente e suite obrigatórios.');
      return;
    }
    await runSuiteFor({ projectId, environmentId, suiteId });
  }

  async function runSuiteFor(input: {
    projectId: string;
    environmentId: string;
    suiteId: string;
  }) {
    await performMutation(async () => {
      const run = await api<Run>('/api/runs', {
        method: 'POST',
        body: JSON.stringify(input),
      });
      setSuiteId(run.suiteId);
      setEnvironmentId(run.environmentId);
      setSelectedRunId(run.id);
      setTab('overview');
    }, 'Execução enviada.');
  }

  function selectSuite(suite: Suite, nextEnvironmentId = environmentId) {
    setSuiteId(suite.id);
    if (nextEnvironmentId) setEnvironmentId(nextEnvironmentId);
    const run = latestRun(projectRuns, {
      suiteId: suite.id,
      environmentId: nextEnvironmentId || undefined,
    });
    setSelectedRunId(run?.id ?? '');
    setTab('overview');
  }

  async function cancelRun(run: Run) {
    await performMutation(
      () => api(`/api/runs/${run.id}/cancel`, { method: 'POST', body: '{}' }),
      'Execução cancelada.',
    );
  }

  async function deleteRun(run: Run) {
    if (
      !window.confirm(
        `Excluir run ${shortId(run.id)}? Esta ação oculta a execução desta seleção.`,
      )
    )
      return;
    await performMutation(async () => {
      await api(`/api/runs/${run.id}`, { method: 'DELETE' });
      setSelectedRunId(current => (current === run.id ? '' : current));
    }, 'Run excluída.');
  }

  async function loadSuite(suite: Suite) {
    await performMutation(async () => {
      const loaded = await api<SuiteWithContent>(`/api/suites/${suite.id}`);
      setSuiteDraft({
        id: loaded.id,
        name: loaded.name,
        type: loaded.type,
        specContent: loaded.specContent,
      });
      setSuiteId(loaded.id);
      setSelectedRunId('');
      setTab('overview');
      setValidation(null);
    }, `Editando ${suite.name}.`);
  }

  async function openSuitePreview() {
    if (!selectedSuite) {
      setError('Selecione uma suite para visualizar.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const loaded = await api<SuiteWithContent>(
        `/api/suites/${selectedSuite.id}`,
      );
      setSuitePreview(loaded);
      setSuitePreviewOpen(true);
    } catch (nextError) {
      setError(messageOf(nextError));
    } finally {
      setBusy(false);
    }
  }

  function newSuiteDraft() {
    setSuiteDraft({ id: '', name: '', type: 'api', specContent: defaultSpec });
    setValidation(null);
  }

  async function validateSpec(showNotice = true): Promise<boolean> {
    if (!suiteDraft.specContent.trim()) {
      setValidation({ valid: false, error: 'YAML obrigatório.' });
      return false;
    }
    try {
      const result = await api<ValidationResult>('/api/spec/validate', {
        method: 'POST',
        body: JSON.stringify({
          specContent: suiteDraft.specContent,
          projectId: projectId || undefined,
        }),
      });
      setValidation(result);
      if (showNotice && result.valid) setNotice('Spec valida.');
      return result.valid;
    } catch (nextError) {
      setValidation({ valid: false, error: messageOf(nextError) });
      return false;
    }
  }

  async function saveSuite() {
    if (!projectId) return;
    const valid = await validateSpec(false);
    if (!valid) return;
    const payload = {
      name: suiteDraft.name,
      type: suiteDraft.type,
      specContent: suiteDraft.specContent,
    };
    await performMutation(
      async () => {
        if (suiteDraft.id && approvedAiPatch) {
          await api('/api/ai/apply-test-fix', {
            method: 'POST',
            body: JSON.stringify({
              suiteId: suiteDraft.id,
              approved: true,
              reason: 'Aprovado na UI',
              ...payload,
            }),
          });
          setApprovedAiPatch(false);
        } else if (suiteDraft.id) {
          await api(`/api/suites/${suiteDraft.id}`, {
            method: 'PUT',
            body: JSON.stringify(payload),
          });
        } else {
          const suite = await api<Suite>('/api/suites', {
            method: 'POST',
            body: JSON.stringify({ projectId, ...payload }),
          });
          setSuiteDraft(current => ({ ...current, id: suite.id }));
          setSuiteId(suite.id);
        }
      },
      suiteDraft.id ? 'Suite atualizada.' : 'Suite criada.',
    );
  }

  function editEnvironment(env: Environment) {
    setEnvDraft({
      id: env.id,
      name: env.name,
      baseUrl: env.baseUrl,
      variables: Object.entries(env.variables ?? {})
        .map(([key, value]) => `${key}=${value}`)
        .join('\n'),
    });
    setEnvironmentId(env.id);
    setSelectedRunId('');
    setTab('overview');
  }

  function newEnvironmentDraft() {
    setEnvDraft({ id: '', name: '', baseUrl: '', variables: '' });
  }

  async function saveEnvironment() {
    if (!projectId) return;
    const payload = {
      name: envDraft.name,
      baseUrl: envDraft.baseUrl,
      variables: parseVars(envDraft.variables),
    };
    await performMutation(
      async () => {
        if (envDraft.id) {
          await api(`/api/environments/${envDraft.id}`, {
            method: 'PUT',
            body: JSON.stringify(payload),
          });
        } else {
          const env = await api<Environment>('/api/environments', {
            method: 'POST',
            body: JSON.stringify({ projectId, ...payload }),
          });
          setEnvDraft(current => ({ ...current, id: env.id }));
          setEnvironmentId(env.id);
        }
      },
      envDraft.id ? 'Ambiente atualizado.' : 'Ambiente criado.',
    );
  }

  async function archiveEnvironment(env: Environment) {
    if (
      !window.confirm(
        `Arquivar ambiente "${env.name}"? Runs vinculadas ficam ocultas.`,
      )
    )
      return;
    await performMutation(
      () => api(`/api/environments/${env.id}`, { method: 'DELETE' }),
      'Ambiente arquivado.',
    );
    if (envDraft.id === env.id) newEnvironmentDraft();
  }

  async function saveProject() {
    const payload = {
      name: projectDraft.name.trim(),
      description: projectDraft.description.trim() || undefined,
      retentionDays: Number(projectDraft.retentionDays) || undefined,
      cleanupArtifacts: projectDraft.cleanupArtifacts,
    };
    if (!payload.name) return;
    await performMutation(
      async () => {
        if (projectDraft.id) {
          await api<Project>(`/api/projects/${projectDraft.id}`, {
            method: 'PUT',
            body: JSON.stringify(payload),
          });
        } else {
          const project = await api<Project>('/api/projects', {
            method: 'POST',
            body: JSON.stringify(payload),
          });
          setProjectId(project.id);
        }
      },
      projectDraft.id ? 'Projeto atualizado.' : 'Projeto criado.',
    );
  }

  async function archiveProject(project: Project) {
    if (
      !window.confirm(
        `Arquivar projeto "${project.name}"? Ambientes, suites e runs vinculadas ficam ocultas.`,
      )
    )
      return;
    await performMutation(
      () => api(`/api/projects/${project.id}`, { method: 'DELETE' }),
      'Projeto arquivado.',
    );
    if (project.id === projectId) {
      setProjectId('');
      setEnvironmentId('');
      setSuiteId('');
      setSelectedRunId('');
    }
  }

  async function importOpenApi() {
    if (!projectId || !openApiDraft.spec.trim()) return;
    await performMutation(async () => {
      const parsed = JSON.parse(openApiDraft.spec);
      const suite = await api<Suite>('/api/import/openapi', {
        method: 'POST',
        body: JSON.stringify({
          projectId,
          name: openApiDraft.name || 'openapi-import',
          spec: parsed,
          baseUrl: openApiDraft.baseUrl || undefined,
          authTemplate: openApiDraft.authTemplate,
          headers: parseVars(openApiDraft.headers),
          tags: splitList(openApiDraft.tags),
          selectedOperations: splitList(openApiDraft.selectedOperations),
          includeBodyExamples: openApiDraft.includeBodyExamples,
        }),
      });
      setSuiteId(suite.id);
      setSelectedRunId('');
    }, 'OpenAPI importado.');
  }

  async function finishWizard() {
    await performMutation(async () => {
      const project = await api<Project>('/api/projects', {
        method: 'POST',
        body: JSON.stringify({
          name: wizardDraft.projectName,
          description: wizardDraft.projectDescription || undefined,
        }),
      });
      const environment = await api<Environment>('/api/environments', {
        method: 'POST',
        body: JSON.stringify({
          projectId: project.id,
          name: wizardDraft.environmentName,
          baseUrl: wizardDraft.baseUrl,
          variables: parseVars(wizardDraft.variables),
        }),
      });
      const suite = await api<Suite>('/api/suites', {
        method: 'POST',
        body: JSON.stringify({
          projectId: project.id,
          name: wizardDraft.suiteName,
          type: wizardDraft.suiteType,
          specContent: wizardDraft.specContent,
        }),
      });
      setProjectId(project.id);
      setEnvironmentId(environment.id);
      setSuiteId(suite.id);
      setSelectedRunId('');
      setWizardOpen(false);
      setWizardStep(0);
    }, 'Workspace criado.');
  }

  const value: V2ConsoleContextValue = {
      projects,
      projectEnvs,
      projectSuites,
      projectRuns,
      scopedRuns,
      selectedProject,
      selectedSuite,
      selectedEnv,
      selectedRun,
      stats,
      report,
      artifacts,
      videos,
      payloads,
      suiteSearch,
      suiteTypeFilter,
      busy: busy || operationPending,
      error,
      notice,
      role,
      canWrite,
      canAdmin,
      projectId,
      environmentId,
      suiteId,
      selectedRunId,
      tab,
      setTab,
      setSuiteSearch,
      setSuiteTypeFilter,
      openSheet,
      setOpenSheet,
      setProjectId,
      setEnvironmentId,
      setSuiteId,
      setSelectedRunId,
      projectDraft,
      setProjectDraft,
      envDraft,
      setEnvDraft,
      suiteDraft,
      setSuiteDraft,
      validation,
      openApiDraft,
      setOpenApiDraft,
      approvedAiPatch,
      setApprovedAiPatch,
      me,
      members,
      organizations,
      managedUsers,
      memberDraft,
      setMemberDraft,
      profileDraft,
      setProfileDraft,
      orgDraft,
      setOrgDraft,
      membershipEdit,
      personalTokens,
      tokenDraft,
      setTokenDraft,
      aiConnections,
      aiDraft,
      setAiDraft,
      security,
      audit,
      cleanupDays,
      setCleanupDays,
      cleanupResult,
      flowLibrary,
      flowDraft,
      setFlowDraft,
      aiOutput,
      wizardOpen,
      setWizardOpen,
      wizardStep,
      setWizardStep,
      wizardDraft,
      setWizardDraft,
      suitePreviewOpen,
      setSuitePreviewOpen,
      suitePreview,
      runSuite,
      runSuiteFor,
      selectSuite,
      deleteRun,
      cancelRun,
      openSuitePreview,
      saveProject,
      archiveProject,
      editEnvironment,
      newEnvironmentDraft,
      saveEnvironment,
      archiveEnvironment,
      loadSuite,
      newSuiteDraft,
      validateSpec,
      saveSuite,
      importOpenApi,
      createMember,
      saveProfile,
      createOrganization,
      switchOrganization,
      setEditedMembership,
      saveUserMemberships,
      createPersonalToken,
      revokePersonalToken,
      editAiConnection,
      saveAiConnection,
      cleanupRuns,
      editFlow,
      saveFlow,
      archiveFlow,
      logout,
      explainFailure,
      runAi,
      finishWizard,
  };

  return (
    <V2ConsoleContext.Provider value={value}>
      {children}
    </V2ConsoleContext.Provider>
  );
}

export { useV2Actions, useV2Console, useV2Drafts, useV2Selection } from './useV2Console';
