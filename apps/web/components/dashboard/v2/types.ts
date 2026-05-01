export type Project = { id: string; name: string; description?: string; retentionDays?: number; cleanupArtifacts?: boolean };
export type Environment = { id: string; projectId: string; name: string; baseUrl: string; variables?: Record<string, string> };
export type Suite = { id: string; projectId: string; name: string; type: 'api' | 'web'; specPath?: string };
export type AiConnection = { id: string; name: string; provider: 'openrouter' | 'openai' | 'anthropic'; apiKey?: string; model: string; baseUrl?: string; enabled: boolean };
export type SecurityStatus = {
  oidc: { configured: boolean; issuer: string | null };
  auth: { apiTokenEnabled: boolean; rbacRole: string; mode: 'off' | 'token' | 'oidc' | 'local' };
  secrets: { defaultKey: boolean; blockedInProduction: boolean };
  network: { allowedHosts: string[]; allowAllWhenEmpty: boolean };
  retention: { days: number };
};
export type Role = 'admin' | 'editor' | 'viewer';
export type Organization = { id: string; name: string; slug?: string; status?: string; createdAt?: string; updatedAt?: string };
export type AuthMe = { user: { id?: string; email: string; name?: string; status?: string }; organization: { id: string; name: string; slug?: string; status?: string }; membership: { id?: string; role: Role }; organizations: Organization[] };
export type OrganizationMember = {
  user: { id: string; email: string; name?: string };
  membership: { id: string; role: Role };
};
export type UserManagementItem = {
  user: { id: string; email: string; name?: string; status: string; createdAt: string; updatedAt: string };
  memberships: Array<{ id: string; userId: string; organizationId: string; role: Role; createdAt: string; updatedAt: string }>;
  organizations: Organization[];
};
export type PersonalAccessToken = {
  id: string;
  userId: string;
  name: string;
  token: string;
  tokenPreview: string;
  tokenMasked: string;
  organizationIds?: string[];
  defaultOrganizationId: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  lastUsedAt?: string;
};
export type FlowLibraryItem = {
  id: string;
  organizationId: string;
  namespace: string;
  name: string;
  displayName?: string;
  description?: string;
  projectIds?: string[];
  params?: Record<string, string | number | boolean>;
  steps: unknown[];
  status: 'active' | 'inactive';
  createdAt: string;
  updatedAt: string;
};
export type FlowDraft = { id: string; namespace: string; name: string; displayName: string; description: string; projectIds: string[]; params: string; steps: string };
export type AuditEntry = { id: string; action: string; actor: string; status: 'ok' | 'blocked' | 'error'; target?: string; createdAt: string; detail?: Record<string, unknown> };
export type RunStatus = 'queued' | 'running' | 'passed' | 'failed' | 'error' | 'canceled' | 'deleted';
export type RunProgress = {
  phase: 'queued' | 'starting' | 'running' | 'test' | 'step' | 'artifacts' | 'finished' | 'failed' | 'skipped' | 'error';
  totalTests: number;
  completedTests: number;
  currentTest?: string;
  currentStep?: string;
  passed: number;
  failed: number;
  error: number;
  updatedAt: string;
};
export type Run = {
  id: string;
  projectId: string;
  environmentId: string;
  suiteId: string;
  status: RunStatus;
  summary?: { total?: number; passed?: number; failed?: number; error?: number; uploadedArtifacts?: Array<{ key: string; bucket: string; localPath: string }> } | null;
  error?: string | null;
  reportPath?: string | null;
  reportHtmlPath?: string | null;
  createdAt?: string;
  startedAt?: string | null;
  finishedAt?: string | null;
  progress?: RunProgress | null;
  heartbeatAt?: string | null;
};
export type Artifact = { type: string; path: string; label?: string };
export type RunReport = {
  artifacts?: Artifact[];
  results?: Array<{
    name: string;
    status: RunStatus;
    startedAt?: string;
    durationMs?: number;
    error?: string;
    artifacts?: Artifact[];
    steps?: Array<{ index?: number; name: string; status: RunStatus; error?: string; startedAt?: string; durationMs?: number; artifacts?: Artifact[] }>;
  }>;
};
export type EvidenceTab = 'overview' | 'timeline' | 'artifacts' | 'payload';
export type MenuSheet = 'evidence' | null;
export type V2View = 'run' | 'projects' | 'suites' | 'flows' | 'settings' | 'docs';
export type SuiteWithContent = Suite & { specContent: string };
export type ValidationResult = { valid: true; type: 'api' | 'web'; name: string; tests: number } | { valid: false; error: string };
export type WizardDraft = {
  projectName: string;
  projectDescription: string;
  environmentName: string;
  baseUrl: string;
  variables: string;
  suiteName: string;
  suiteType: Suite['type'];
  specContent: string;
};
export type OpenApiDraft = { name: string; spec: string; baseUrl: string; authTemplate: 'none' | 'bearer' | 'apiKey'; headers: string; tags: string; selectedOperations: string; includeBodyExamples: boolean };
export type MembershipEdit = Record<string, Record<string, Role | ''>>;
export type FlowPreviewRow = { index: number; title: string; detail: string };
export type FlowStepTemplate = { id: string; label: string; description: string; step: unknown };
export type FlowStepAction =
  | 'goto'
  | 'click'
  | 'fill'
  | 'select'
  | 'check'
  | 'press'
  | 'waitFor'
  | 'expectText'
  | 'expectUrlContains'
  | 'expectVisible'
  | 'expectHidden'
  | 'expectAttribute'
  | 'expectValue'
  | 'expectCount'
  | 'uploadFile'
  | 'use'
  | 'extract';
export type FlowSelectorMode = 'label' | 'text' | 'role' | 'testId' | 'css' | 'placeholder' | 'selector' | 'textObject';
export type YamlValidationMode = 'syntax' | 'spec' | 'flowSteps' | 'flowParams';
export type ConsoleSection =
  | 'run'
  | 'projects'
  | 'suites'
  | 'flows'
  | 'docs'
  | 'settings';
export type ProjectDraft = {
  id: string;
  name: string;
  description: string;
  retentionDays: string;
  cleanupArtifacts: boolean;
};
export type EnvironmentDraft = {
  id: string;
  name: string;
  baseUrl: string;
  variables: string;
};
export type SuiteDraft = {
  id: string;
  name: string;
  type: Suite['type'];
  specContent: string;
};
export type MemberDraft = {
  email: string;
  name: string;
  role: OrganizationMember['membership']['role'];
  temporaryPassword: string;
};
export type ProfileDraft = {
  name: string;
  email: string;
  currentPassword: string;
  newPassword: string;
};
export type OrganizationDraft = { name: string };
export type TokenDraft = {
  name: string;
  scope: 'all' | 'selected';
  organizationIds: string[];
};
export type AiDraft = {
  id: string;
  name: string;
  provider: AiConnection['provider'];
  apiKey: string;
  model: string;
  baseUrl: string;
  enabled: boolean;
};
