'use client';

import { api } from '@/lib/api';
import type { Environment, Project, Suite } from '../../types';
import { parseVars } from '../../shared/formUtils';
import type { V2WorkspaceActionsInput } from './workspaceActionTypes';

export function useV2WizardActions(input: V2WorkspaceActionsInput) {
  const {
    setProjectId,
    setEnvironmentId,
    setSuiteId,
    setSelectedRunId,
    wizardDraft,
    setWizardOpen,
    setWizardStep,
    performMutation,
  } = input;

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

  return { finishWizard };
}
