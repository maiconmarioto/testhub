'use client';

import type { Dispatch, SetStateAction } from 'react';
import type { Environment, OpenApiDraft, Project, ProjectDraft, Run, Suite, SuiteDraft, SuiteWithContent, ValidationResult, WizardDraft } from '../../types';

export type PerformMutation = (operation: () => Promise<unknown>, success?: string) => Promise<void>;

export type V2WorkspaceActionsInput = {
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
  selectedSuite?: Suite;
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
  performMutation: PerformMutation;
};
