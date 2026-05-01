'use client';

import { useState } from 'react';
import { defaultFlowDraft, defaultSpec } from '../constants';
import type {
  AiConnection,
  EvidenceTab,
  FlowDraft,
  MembershipEdit,
  MenuSheet,
  OpenApiDraft,
  OrganizationMember,
  Suite,
  SuiteWithContent,
  ValidationResult,
} from '../types';

export function useV2ConsoleLocalState() {
  const [projectId, setProjectId] = useState('');
  const [environmentId, setEnvironmentId] = useState('');
  const [suiteId, setSuiteId] = useState('');
  const [selectedRunId, setSelectedRunId] = useState('');
  const [suiteSearch, setSuiteSearch] = useState('');
  const [suiteTypeFilter, setSuiteTypeFilter] = useState<'all' | Suite['type']>('all');
  const [tab, setTab] = useState<EvidenceTab>('overview');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [openSheet, setOpenSheet] = useState<MenuSheet>(null);
  const [projectDraft, setProjectDraft] = useState({
    id: '',
    name: '',
    description: '',
    retentionDays: '30',
    cleanupArtifacts: false,
  });
  const [openApiDraft, setOpenApiDraft] = useState<OpenApiDraft>({
    name: 'openapi-import',
    spec: '',
    baseUrl: '',
    authTemplate: 'none',
    headers: '',
    tags: '',
    selectedOperations: '',
    includeBodyExamples: true,
  });
  const [suiteDraft, setSuiteDraft] = useState({
    id: '',
    name: '',
    type: 'api' as 'api' | 'web',
    specContent: defaultSpec,
  });
  const [envDraft, setEnvDraft] = useState({
    id: '',
    name: '',
    baseUrl: '',
    variables: '',
  });
  const [aiDraft, setAiDraft] = useState({
    id: '',
    name: 'OpenRouter',
    provider: 'openrouter' as AiConnection['provider'],
    apiKey: '',
    model: 'openai/gpt-4o-mini',
    baseUrl: 'https://openrouter.ai/api/v1',
    enabled: true,
  });
  const [memberDraft, setMemberDraft] = useState({
    email: '',
    name: '',
    role: 'viewer' as OrganizationMember['membership']['role'],
    temporaryPassword: '',
  });
  const [profileDraft, setProfileDraft] = useState({
    name: '',
    email: '',
    currentPassword: '',
    newPassword: '',
  });
  const [orgDraft, setOrgDraft] = useState({ name: '' });
  const [membershipEdit, setMembershipEdit] = useState<MembershipEdit>({});
  const [tokenDraft, setTokenDraft] = useState({
    name: 'mcp-local',
    scope: 'all' as 'all' | 'selected',
    organizationIds: [] as string[],
  });
  const [flowDraft, setFlowDraft] = useState<FlowDraft>(defaultFlowDraft);
  const [aiOutput, setAiOutput] = useState('');
  const [cleanupDays, setCleanupDays] = useState('30');
  const [cleanupResult, setCleanupResult] = useState('');
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [approvedAiPatch, setApprovedAiPatch] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [suitePreviewOpen, setSuitePreviewOpen] = useState(false);
  const [suitePreview, setSuitePreview] = useState<SuiteWithContent | null>(null);
  const [wizardStep, setWizardStep] = useState(0);
  const [wizardDraft, setWizardDraft] = useState({
    projectName: '',
    projectDescription: '',
    environmentName: 'local',
    baseUrl: 'http://host.docker.internal:3000',
    variables: '',
    suiteName: 'api-health-smoke',
    suiteType: 'api' as Suite['type'],
    specContent: defaultSpec,
  });

  return {
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
  };
}
