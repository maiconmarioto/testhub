import type { FlowLibraryItem, RunProgress, WebFlow } from '../../shared/src/types.js';

export type EntityStatus = 'active' | 'inactive';
export type RunStatus = 'queued' | 'running' | 'passed' | 'failed' | 'error' | 'canceled' | 'deleted';
export type UserStatus = 'active' | 'disabled';
export type MembershipRole = 'admin' | 'editor' | 'viewer';

export interface User {
  id: string;
  email: string;
  name?: string;
  passwordHash: string;
  status: UserStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  status: EntityStatus;
  createdAt: string;
  updatedAt: string;
}

export interface OrganizationMembership {
  id: string;
  organizationId: string;
  userId: string;
  role: MembershipRole;
  createdAt: string;
  updatedAt: string;
}

export interface AuthSession {
  id: string;
  userId: string;
  organizationId: string;
  tokenHash: string;
  expiresAt: string;
  createdAt: string;
  lastUsedAt?: string;
}

export interface PasswordResetToken {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: string;
  usedAt?: string;
  createdAt: string;
}

export interface PersonalAccessToken {
  id: string;
  userId: string;
  name: string;
  tokenHash: string;
  token: string;
  tokenPreview: string;
  organizationIds?: string[];
  defaultOrganizationId: string;
  status: EntityStatus;
  createdAt: string;
  updatedAt: string;
  lastUsedAt?: string;
}

export interface Project {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  retentionDays?: number;
  cleanupArtifacts?: boolean;
  status: EntityStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Environment {
  id: string;
  projectId: string;
  name: string;
  baseUrl: string;
  status: EntityStatus;
  variables?: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export interface Suite {
  id: string;
  projectId: string;
  name: string;
  type: 'web' | 'api';
  specPath: string;
  specContent?: string;
  status: EntityStatus;
  createdAt: string;
  updatedAt: string;
}

export interface RunRecord {
  id: string;
  projectId: string;
  environmentId: string;
  suiteId: string;
  status: RunStatus;
  reportPath?: string;
  reportHtmlPath?: string;
  error?: string;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  summary?: unknown;
  progress?: RunProgress;
  heartbeatAt?: string;
}

export interface AiConnection {
  id: string;
  organizationId: string;
  name: string;
  provider: 'openrouter' | 'openai' | 'anthropic';
  apiKey?: string;
  model: string;
  baseUrl?: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Database {
  users: User[];
  organizations: Organization[];
  memberships: OrganizationMembership[];
  sessions: AuthSession[];
  passwordResetTokens: PasswordResetToken[];
  personalAccessTokens: PersonalAccessToken[];
  projects: Project[];
  environments: Environment[];
  suites: Suite[];
  runs: RunRecord[];
  aiConnections: AiConnection[];
  flowLibrary: FlowLibraryItem[];
}

export interface Store {
  rootDir: string;
  suitesDir: string;
  runsDir: string;
  read(): Promise<Database> | Database;
  getProject(id: string): Promise<Project | undefined> | Project | undefined;
  createProject(input: { organizationId: string; name: string; description?: string; retentionDays?: number; cleanupArtifacts?: boolean }): Promise<Project> | Project;
  updateProject(id: string, input: { name: string; description?: string; retentionDays?: number; cleanupArtifacts?: boolean }): Promise<Project | undefined> | Project | undefined;
  archiveProject(id: string): Promise<boolean> | boolean;
  createEnvironment(input: { projectId: string; name: string; baseUrl: string; variables?: Record<string, string> }): Promise<Environment> | Environment;
  updateEnvironment(id: string, input: { name: string; baseUrl: string; variables?: Record<string, string> }): Promise<Environment | undefined> | Environment | undefined;
  archiveEnvironment(id: string): Promise<boolean> | boolean;
  createSuite(input: { projectId: string; name: string; type: 'web' | 'api'; specContent: string }): Promise<Suite> | Suite;
  getSuiteContent(id: string): Promise<(Suite & { specContent: string }) | undefined> | (Suite & { specContent: string }) | undefined;
  updateSuite(id: string, input: { name: string; type: 'web' | 'api'; specContent: string }): Promise<Suite | undefined> | Suite | undefined;
  createRun(input: { projectId: string; environmentId: string; suiteId: string }): Promise<RunRecord> | RunRecord;
  updateRun(id: string, patch: Partial<RunRecord>): Promise<RunRecord> | RunRecord;
  archiveRunsBefore?(cutoffIso: string, options?: { projectId?: string; cleanupArtifacts?: boolean; runsDir?: string }): Promise<number> | number;
  upsertAiConnection(input: Omit<AiConnection, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<AiConnection> | AiConnection;
  listAiConnectionsForOrganization(organizationId: string): Promise<AiConnection[]> | AiConnection[];
  getEnvironmentVariables(environmentId: string): Promise<Record<string, string>> | Record<string, string>;
  getAiConnection(organizationId: string, connectionId?: string): Promise<AiConnection | undefined> | AiConnection | undefined;
  createUser(input: { email: string; name?: string; passwordHash: string }): Promise<User> | User;
  listUsers(): Promise<User[]> | User[];
  hasActiveUsers(): Promise<boolean> | boolean;
  findUserByEmail(email: string): Promise<User | undefined> | User | undefined;
  findUserById(id: string): Promise<User | undefined> | User | undefined;
  updateUserProfile(userId: string, input: { email?: string; name?: string }): Promise<User | undefined> | User | undefined;
  updateUserPassword(userId: string, passwordHash: string): Promise<User | undefined> | User | undefined;
  createOrganization(input: { name: string; slug?: string }): Promise<Organization> | Organization;
  listOrganizations(): Promise<Organization[]> | Organization[];
  listOrganizationsForUser(userId: string): Promise<Organization[]> | Organization[];
  createMembership(input: { userId: string; organizationId: string; role: MembershipRole }): Promise<OrganizationMembership> | OrganizationMembership;
  updateMembershipRole(userId: string, organizationId: string, role: MembershipRole): Promise<OrganizationMembership | undefined> | OrganizationMembership | undefined;
  deleteMembership(userId: string, organizationId: string): Promise<boolean> | boolean;
  listMembershipsForUser(userId: string): Promise<OrganizationMembership[]> | OrganizationMembership[];
  findMembership(userId: string, organizationId: string): Promise<OrganizationMembership | undefined> | OrganizationMembership | undefined;
  listMembershipsForOrganization(organizationId: string): Promise<OrganizationMembership[]> | OrganizationMembership[];
  createSession(input: { userId: string; organizationId: string; tokenHash: string; expiresAt: string }): Promise<AuthSession> | AuthSession;
  findSessionByTokenHash(tokenHash: string): Promise<AuthSession | undefined> | AuthSession | undefined;
  deleteSession(id: string): Promise<boolean> | boolean;
  deleteSessionsForUser(userId: string): Promise<number> | number;
  createPasswordResetToken(input: { userId: string; tokenHash: string; expiresAt: string }): Promise<PasswordResetToken> | PasswordResetToken;
  findPasswordResetByTokenHash(tokenHash: string): Promise<PasswordResetToken | undefined> | PasswordResetToken | undefined;
  markPasswordResetUsed(id: string): Promise<PasswordResetToken | undefined> | PasswordResetToken | undefined;
  createPersonalAccessToken(input: { userId: string; name: string; tokenHash: string; token: string; organizationIds?: string[]; defaultOrganizationId: string }): Promise<PersonalAccessToken> | PersonalAccessToken;
  listPersonalAccessTokensForUser(userId: string): Promise<PersonalAccessToken[]> | PersonalAccessToken[];
  findPersonalAccessTokenByHash(tokenHash: string): Promise<PersonalAccessToken | undefined> | PersonalAccessToken | undefined;
  revokePersonalAccessToken(userId: string, tokenId: string): Promise<boolean> | boolean;
  touchPersonalAccessToken(tokenId: string): Promise<PersonalAccessToken | undefined> | PersonalAccessToken | undefined;
  listProjectsForOrganization(organizationId: string): Promise<Project[]> | Project[];
  listFlowsForOrganization(organizationId: string, namespace?: string): Promise<FlowLibraryItem[]> | FlowLibraryItem[];
  getFlow(id: string): Promise<FlowLibraryItem | undefined> | FlowLibraryItem | undefined;
  upsertFlow(input: Omit<FlowLibraryItem, 'id' | 'status' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<FlowLibraryItem> | FlowLibraryItem;
  archiveFlow(organizationId: string, id: string): Promise<boolean> | boolean;
}
