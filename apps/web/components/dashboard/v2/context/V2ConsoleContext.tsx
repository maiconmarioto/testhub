'use client';

import {
  createContext,
  type Dispatch,
  type SetStateAction,
} from 'react';
import type {
  AiConnection,
  AiDraft,
  AuditEntry,
  AuthMe,
  EnvironmentDraft,
  Environment,
  EvidenceTab,
  FlowDraft,
  FlowLibraryItem,
  MemberDraft,
  MembershipEdit,
  MenuSheet,
  OpenApiDraft,
  Organization,
  OrganizationDraft,
  OrganizationMember,
  PersonalAccessToken,
  ProfileDraft,
  Project,
  ProjectDraft,
  Role,
  Run,
  RunReport,
  SecurityStatus,
  Suite,
  SuiteDraft,
  SuiteWithContent,
  TokenDraft,
  UserManagementItem,
  ValidationResult,
} from '../types';
import { collectArtifacts, summarize } from '../shared';

export type V2ConsoleContextValue = {
  projects: Project[];
  projectEnvs: Environment[];
  projectSuites: Suite[];
  projectRuns: Run[];
  scopedRuns: Run[];
  selectedProject?: Project;
  selectedSuite?: Suite;
  selectedEnv?: Environment;
  selectedRun?: Run;
  stats: ReturnType<typeof summarize>;
  report: RunReport | null;
  artifacts: ReturnType<typeof collectArtifacts>;
  videos: ReturnType<typeof collectArtifacts>;
  payloads: ReturnType<typeof collectArtifacts>;
  suiteSearch: string;
  suiteTypeFilter: 'all' | Suite['type'];
  busy: boolean;
  error: string;
  notice: string;
  role: 'admin' | 'editor' | 'viewer';
  canWrite: boolean;
  canAdmin: boolean;
  projectId: string;
  environmentId: string;
  suiteId: string;
  selectedRunId: string;
  tab: EvidenceTab;
  setTab: Dispatch<SetStateAction<EvidenceTab>>;
  setSuiteSearch: Dispatch<SetStateAction<string>>;
  setSuiteTypeFilter: Dispatch<SetStateAction<'all' | Suite['type']>>;
  openSheet: MenuSheet;
  setOpenSheet: Dispatch<SetStateAction<MenuSheet>>;
  setProjectId: Dispatch<SetStateAction<string>>;
  setEnvironmentId: Dispatch<SetStateAction<string>>;
  setSuiteId: Dispatch<SetStateAction<string>>;
  setSelectedRunId: Dispatch<SetStateAction<string>>;
  projectDraft: ProjectDraft;
  setProjectDraft: Dispatch<SetStateAction<ProjectDraft>>;
  envDraft: EnvironmentDraft;
  setEnvDraft: Dispatch<SetStateAction<EnvironmentDraft>>;
  suiteDraft: SuiteDraft;
  setSuiteDraft: Dispatch<SetStateAction<SuiteDraft>>;
  validation: ValidationResult | null;
  openApiDraft: OpenApiDraft;
  setOpenApiDraft: Dispatch<SetStateAction<OpenApiDraft>>;
  approvedAiPatch: boolean;
  setApprovedAiPatch: Dispatch<SetStateAction<boolean>>;
  me: AuthMe | null;
  members: OrganizationMember[];
  organizations: Organization[];
  managedUsers: UserManagementItem[];
  memberDraft: MemberDraft;
  setMemberDraft: Dispatch<SetStateAction<MemberDraft>>;
  profileDraft: ProfileDraft;
  setProfileDraft: Dispatch<SetStateAction<ProfileDraft>>;
  orgDraft: OrganizationDraft;
  setOrgDraft: Dispatch<SetStateAction<OrganizationDraft>>;
  membershipEdit: MembershipEdit;
  personalTokens: PersonalAccessToken[];
  tokenDraft: TokenDraft;
  setTokenDraft: Dispatch<SetStateAction<TokenDraft>>;
  aiConnections: AiConnection[];
  aiDraft: AiDraft;
  setAiDraft: Dispatch<SetStateAction<AiDraft>>;
  security: SecurityStatus | null;
  audit: AuditEntry[];
  cleanupDays: string;
  setCleanupDays: Dispatch<SetStateAction<string>>;
  cleanupResult: string;
  flowLibrary: FlowLibraryItem[];
  flowDraft: FlowDraft;
  setFlowDraft: Dispatch<SetStateAction<FlowDraft>>;
  aiOutput: string;
  wizardOpen: boolean;
  setWizardOpen: Dispatch<SetStateAction<boolean>>;
  wizardStep: number;
  setWizardStep: Dispatch<SetStateAction<number>>;
  wizardDraft: {
    projectName: string;
    projectDescription: string;
    environmentName: string;
    baseUrl: string;
    variables: string;
    suiteName: string;
    suiteType: Suite['type'];
    specContent: string;
  };
  setWizardDraft: Dispatch<
    SetStateAction<{
      projectName: string;
      projectDescription: string;
      environmentName: string;
      baseUrl: string;
      variables: string;
      suiteName: string;
      suiteType: Suite['type'];
      specContent: string;
    }>
  >;
  suitePreviewOpen: boolean;
  setSuitePreviewOpen: Dispatch<SetStateAction<boolean>>;
  suitePreview: SuiteWithContent | null;
  runSuite: () => Promise<void>;
  runSuiteFor: (input: {
    projectId: string;
    environmentId: string;
    suiteId: string;
  }) => Promise<void>;
  selectSuite: (suite: Suite, nextEnvironmentId?: string) => void;
  deleteRun: (run: Run) => Promise<void>;
  cancelRun: (run: Run) => Promise<void>;
  openSuitePreview: () => Promise<void>;
  saveProject: () => Promise<void>;
  archiveProject: (project: Project) => Promise<void>;
  editEnvironment: (env: Environment) => void;
  newEnvironmentDraft: () => void;
  saveEnvironment: () => Promise<void>;
  archiveEnvironment: (env: Environment) => Promise<void>;
  loadSuite: (suite: Suite) => Promise<void>;
  newSuiteDraft: () => void;
  validateSpec: (showNotice?: boolean) => Promise<boolean>;
  saveSuite: () => Promise<void>;
  importOpenApi: () => Promise<void>;
  createMember: () => Promise<void>;
  saveProfile: () => Promise<void>;
  createOrganization: () => Promise<void>;
  switchOrganization: (organizationId: string) => Promise<void>;
  setEditedMembership: (
    userId: string,
    organizationId: string,
    roleValue: Role | '',
  ) => void;
  saveUserMemberships: (userId: string) => Promise<void>;
  createPersonalToken: () => Promise<void>;
  revokePersonalToken: (tokenId: string) => Promise<void>;
  editAiConnection: (connection: AiConnection) => void;
  saveAiConnection: () => Promise<void>;
  cleanupRuns: () => Promise<void>;
  editFlow: (flow: FlowLibraryItem) => void;
  saveFlow: () => Promise<void>;
  archiveFlow: (flowId: string) => Promise<void>;
  logout: () => Promise<void>;
  explainFailure: (run?: Run) => Promise<void>;
  runAi: (
    kind: 'explain-failure' | 'suggest-test-fix' | 'suggest-test-cases',
    run?: Run,
    success?: string,
  ) => Promise<void>;
  finishWizard: () => Promise<void>;
};

export const V2ConsoleContext = createContext<V2ConsoleContextValue | null>(null);
