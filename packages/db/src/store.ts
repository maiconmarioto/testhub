import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { ensureDir, writeJson } from '../../shared/src/fs-utils.js';
import { decryptSecret, decryptVariables, encryptSecret, encryptVariables, maskVariables } from './secrets.js';

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
}

const emptyDb: Database = {
  users: [],
  organizations: [],
  memberships: [],
  sessions: [],
  passwordResetTokens: [],
  personalAccessTokens: [],
  projects: [],
  environments: [],
  suites: [],
  runs: [],
  aiConnections: [],
};

const LEGACY_ORGANIZATION_ID = 'legacy-local';

export class JsonStore {
  public readonly rootDir: string;
  private readonly dbPath: string;

  constructor(rootDir = process.env.TESTHUB_DATA_DIR ?? '.testhub-data') {
    this.rootDir = path.resolve(rootDir);
    this.dbPath = path.join(this.rootDir, 'db.json');
    ensureDir(this.rootDir);
    ensureDir(this.suitesDir);
    ensureDir(this.runsDir);
    if (!fs.existsSync(this.dbPath)) writeJson(this.dbPath, emptyDb);
  }

  get suitesDir(): string {
    return path.join(this.rootDir, 'suites');
  }

  get runsDir(): string {
    return path.join(this.rootDir, 'runs');
  }

  read(): Database {
    const db = JSON.parse(fs.readFileSync(this.dbPath, 'utf8')) as Partial<Database>;
    return {
      users: db.users ?? [],
      organizations: db.organizations ?? [],
      memberships: db.memberships ?? [],
      sessions: db.sessions ?? [],
      passwordResetTokens: db.passwordResetTokens ?? [],
      personalAccessTokens: db.personalAccessTokens ?? [],
      projects: (db.projects ?? []).map((project) => ({
        ...project,
        organizationId: project.organizationId ?? LEGACY_ORGANIZATION_ID,
      })),
      environments: db.environments ?? [],
      suites: db.suites ?? [],
      runs: db.runs ?? [],
      aiConnections: (db.aiConnections ?? []).map((connection) => ({
        ...connection,
        organizationId: connection.organizationId ?? LEGACY_ORGANIZATION_ID,
      })),
    };
  }

  write(db: Database): void {
    writeJson(this.dbPath, db);
  }

  getProject(id: string): Project | undefined {
    return this.read().projects.find((project) => project.id === id && project.status !== 'inactive');
  }

  createProject(input: { organizationId: string; name: string; description?: string; retentionDays?: number; cleanupArtifacts?: boolean }): Project {
    const db = this.read();
    const now = nowIso();
    const project: Project = {
      id: randomUUID(),
      organizationId: input.organizationId,
      name: input.name,
      description: input.description,
      retentionDays: input.retentionDays,
      cleanupArtifacts: input.cleanupArtifacts,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };
    db.projects.push(project);
    this.write(db);
    return project;
  }

  createUser(input: { email: string; name?: string; passwordHash: string }): User {
    const db = this.read();
    const email = normalizeEmail(input.email);
    if (db.users.some((user) => user.email === email && user.status === 'active')) throw new Error('Email ja cadastrado');
    const now = nowIso();
    const user: User = {
      id: randomUUID(),
      email,
      name: input.name,
      passwordHash: input.passwordHash,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };
    db.users.push(user);
    this.write(db);
    return user;
  }

  listUsers(): User[] {
    return this.read().users.filter((user) => user.status === 'active');
  }

  hasActiveUsers(): boolean {
    return this.read().users.some((user) => user.status === 'active');
  }

  findUserByEmail(email: string): User | undefined {
    const normalized = normalizeEmail(email);
    return this.read().users.find((user) => user.email === normalized && user.status === 'active');
  }

  findUserById(id: string): User | undefined {
    return this.read().users.find((user) => user.id === id && user.status === 'active');
  }

  updateUserProfile(userId: string, input: { email?: string; name?: string }): User | undefined {
    const db = this.read();
    const index = db.users.findIndex((user) => user.id === userId && user.status === 'active');
    if (index === -1) return undefined;
    const email = input.email ? normalizeEmail(input.email) : db.users[index].email;
    if (db.users.some((user) => user.id !== userId && user.email === email && user.status === 'active')) throw new Error('Email ja cadastrado');
    const user: User = {
      ...db.users[index],
      email,
      name: input.name ?? db.users[index].name,
      updatedAt: nowIso(),
    };
    db.users[index] = user;
    this.write(db);
    return user;
  }

  updateUserPassword(userId: string, passwordHash: string): User | undefined {
    const db = this.read();
    const index = db.users.findIndex((user) => user.id === userId && user.status === 'active');
    if (index === -1) return undefined;
    const user: User = {
      ...db.users[index],
      passwordHash,
      updatedAt: nowIso(),
    };
    db.users[index] = user;
    this.write(db);
    return user;
  }

  createOrganization(input: { name: string; slug?: string }): Organization {
    const db = this.read();
    const now = nowIso();
    const baseSlug = slugify(input.slug ?? input.name);
    let slug = baseSlug;
    for (let attempt = 2; db.organizations.some((organization) => organization.slug === slug); attempt += 1) {
      slug = `${baseSlug}-${attempt}`;
    }
    const organization: Organization = {
      id: randomUUID(),
      name: input.name,
      slug,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };
    db.organizations.push(organization);
    this.write(db);
    return organization;
  }

  listOrganizations(): Organization[] {
    return this.read().organizations.filter((organization) => organization.status === 'active');
  }

  listOrganizationsForUser(userId: string): Organization[] {
    const db = this.read();
    const organizationIds = new Set(db.memberships.filter((membership) => membership.userId === userId).map((membership) => membership.organizationId));
    return db.organizations.filter((organization) => organizationIds.has(organization.id) && organization.status === 'active');
  }

  createMembership(input: { userId: string; organizationId: string; role: MembershipRole }): OrganizationMembership {
    const db = this.read();
    const existing = db.memberships.find((membership) => membership.userId === input.userId && membership.organizationId === input.organizationId);
    if (existing) return existing;
    const now = nowIso();
    const membership: OrganizationMembership = {
      id: randomUUID(),
      userId: input.userId,
      organizationId: input.organizationId,
      role: input.role,
      createdAt: now,
      updatedAt: now,
    };
    db.memberships.push(membership);
    this.write(db);
    return membership;
  }

  updateMembershipRole(userId: string, organizationId: string, role: MembershipRole): OrganizationMembership | undefined {
    const db = this.read();
    const index = db.memberships.findIndex((membership) => membership.userId === userId && membership.organizationId === organizationId);
    if (index === -1) return undefined;
    const membership: OrganizationMembership = { ...db.memberships[index], role, updatedAt: nowIso() };
    db.memberships[index] = membership;
    this.write(db);
    return membership;
  }

  deleteMembership(userId: string, organizationId: string): boolean {
    const db = this.read();
    const before = db.memberships.length;
    db.memberships = db.memberships.filter((membership) => !(membership.userId === userId && membership.organizationId === organizationId));
    if (db.memberships.length === before) return false;
    this.write(db);
    return true;
  }

  listMembershipsForUser(userId: string): OrganizationMembership[] {
    return this.read().memberships.filter((membership) => membership.userId === userId);
  }

  findMembership(userId: string, organizationId: string): OrganizationMembership | undefined {
    return this.read().memberships.find((membership) => membership.userId === userId && membership.organizationId === organizationId);
  }

  listMembershipsForOrganization(organizationId: string): OrganizationMembership[] {
    return this.read().memberships.filter((membership) => membership.organizationId === organizationId);
  }

  createSession(input: { userId: string; organizationId: string; tokenHash: string; expiresAt: string }): AuthSession {
    const db = this.read();
    const session: AuthSession = {
      id: randomUUID(),
      userId: input.userId,
      organizationId: input.organizationId,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      createdAt: nowIso(),
    };
    db.sessions.push(session);
    this.write(db);
    return session;
  }

  findSessionByTokenHash(tokenHash: string): AuthSession | undefined {
    const now = nowIso();
    return this.read().sessions.find((session) => session.tokenHash === tokenHash && session.expiresAt > now);
  }

  deleteSession(id: string): boolean {
    const db = this.read();
    const before = db.sessions.length;
    db.sessions = db.sessions.filter((session) => session.id !== id);
    if (db.sessions.length === before) return false;
    this.write(db);
    return true;
  }

  deleteSessionsForUser(userId: string): number {
    const db = this.read();
    const before = db.sessions.length;
    db.sessions = db.sessions.filter((session) => session.userId !== userId);
    const deleted = before - db.sessions.length;
    if (deleted > 0) this.write(db);
    return deleted;
  }

  createPasswordResetToken(input: { userId: string; tokenHash: string; expiresAt: string }): PasswordResetToken {
    const db = this.read();
    const resetToken: PasswordResetToken = {
      id: randomUUID(),
      userId: input.userId,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      usedAt: undefined,
      createdAt: nowIso(),
    };
    db.passwordResetTokens.push(resetToken);
    this.write(db);
    return resetToken;
  }

  findPasswordResetByTokenHash(tokenHash: string): PasswordResetToken | undefined {
    const now = nowIso();
    const resetToken = this.read().passwordResetTokens.find((item) => item.tokenHash === tokenHash && item.expiresAt > now && !item.usedAt);
    return resetToken ? { ...resetToken, usedAt: resetToken.usedAt } : undefined;
  }

  markPasswordResetUsed(id: string): PasswordResetToken | undefined {
    const db = this.read();
    const index = db.passwordResetTokens.findIndex((resetToken) => resetToken.id === id);
    if (index === -1) return undefined;
    if (db.passwordResetTokens[index].usedAt) return undefined;
    if (db.passwordResetTokens[index].expiresAt <= nowIso()) return undefined;
    const resetToken: PasswordResetToken = {
      ...db.passwordResetTokens[index],
      usedAt: nowIso(),
    };
    db.passwordResetTokens[index] = resetToken;
    this.write(db);
    return resetToken;
  }

  createPersonalAccessToken(input: { userId: string; name: string; tokenHash: string; token: string; organizationIds?: string[]; defaultOrganizationId: string }): PersonalAccessToken {
    const db = this.read();
    const now = nowIso();
    const token: PersonalAccessToken = {
      id: randomUUID(),
      userId: input.userId,
      name: input.name,
      tokenHash: input.tokenHash,
      token: encryptSecret(input.token),
      tokenPreview: tokenPreview(input.token),
      organizationIds: input.organizationIds,
      defaultOrganizationId: input.defaultOrganizationId,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };
    db.personalAccessTokens.push(token);
    this.write(db);
    return { ...token, token: input.token };
  }

  listPersonalAccessTokensForUser(userId: string): PersonalAccessToken[] {
    return this.read().personalAccessTokens
      .filter((token) => token.userId === userId && token.status === 'active')
      .map((token) => ({ ...token, token: decryptSecret(token.token) }));
  }

  findPersonalAccessTokenByHash(tokenHash: string): PersonalAccessToken | undefined {
    const token = this.read().personalAccessTokens.find((item) => item.tokenHash === tokenHash && item.status === 'active');
    return token ? { ...token, token: decryptSecret(token.token) } : undefined;
  }

  revokePersonalAccessToken(userId: string, tokenId: string): boolean {
    const db = this.read();
    const index = db.personalAccessTokens.findIndex((token) => token.id === tokenId && token.userId === userId && token.status === 'active');
    if (index === -1) return false;
    db.personalAccessTokens[index] = { ...db.personalAccessTokens[index], status: 'inactive', updatedAt: nowIso() };
    this.write(db);
    return true;
  }

  touchPersonalAccessToken(tokenId: string): PersonalAccessToken | undefined {
    const db = this.read();
    const index = db.personalAccessTokens.findIndex((token) => token.id === tokenId && token.status === 'active');
    if (index === -1) return undefined;
    const token = { ...db.personalAccessTokens[index], lastUsedAt: nowIso(), updatedAt: nowIso() };
    db.personalAccessTokens[index] = token;
    this.write(db);
    return { ...token, token: decryptSecret(token.token) };
  }

  listProjectsForOrganization(organizationId: string): Project[] {
    return this.read().projects.filter((project) => project.organizationId === organizationId && project.status !== 'inactive');
  }

  updateProject(id: string, input: { name: string; description?: string; retentionDays?: number; cleanupArtifacts?: boolean }): Project | undefined {
    const db = this.read();
    const index = db.projects.findIndex((project) => project.id === id && project.status !== 'inactive');
    if (index === -1) return undefined;
    const project: Project = {
      ...db.projects[index],
      name: input.name,
      description: input.description,
      retentionDays: input.retentionDays,
      cleanupArtifacts: input.cleanupArtifacts,
      updatedAt: nowIso(),
    };
    db.projects[index] = project;
    this.write(db);
    return project;
  }

  archiveProject(id: string): boolean {
    const db = this.read();
    const project = db.projects.find((item) => item.id === id && item.status !== 'inactive');
    if (!project) return false;
    const now = nowIso();
    db.projects = db.projects.map((item) => item.id === id ? { ...item, status: 'inactive', updatedAt: now } : item);
    db.environments = db.environments.map((item) => item.projectId === id ? { ...item, status: 'inactive', updatedAt: now } : item);
    db.suites = db.suites.map((item) => item.projectId === id ? { ...item, status: 'inactive', updatedAt: now } : item);
    db.runs = db.runs.map((item) => item.projectId === id ? { ...item, status: 'deleted', finishedAt: item.finishedAt ?? now } : item);
    this.write(db);
    return true;
  }

  createEnvironment(input: { projectId: string; name: string; baseUrl: string; variables?: Record<string, string> }): Environment {
    const db = this.read();
    const now = nowIso();
    const environment: Environment = {
      id: randomUUID(),
      projectId: input.projectId,
      name: input.name,
      baseUrl: input.baseUrl,
      variables: encryptVariables(input.variables),
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };
    db.environments.push(environment);
    this.write(db);
    return { ...environment, variables: maskVariables(environment.variables) };
  }

  updateEnvironment(id: string, input: { name: string; baseUrl: string; variables?: Record<string, string> }): Environment | undefined {
    const db = this.read();
    const index = db.environments.findIndex((environment) => environment.id === id && environment.status !== 'inactive');
    if (index === -1) return undefined;
    const environment: Environment = {
      ...db.environments[index],
      name: input.name,
      baseUrl: input.baseUrl,
      variables: encryptVariables(input.variables),
      updatedAt: nowIso(),
    };
    db.environments[index] = environment;
    this.write(db);
    return { ...environment, variables: maskVariables(environment.variables) };
  }

  archiveEnvironment(id: string): boolean {
    const db = this.read();
    const environment = db.environments.find((item) => item.id === id && item.status !== 'inactive');
    if (!environment) return false;
    const now = nowIso();
    db.environments = db.environments.map((item) => item.id === id ? { ...item, status: 'inactive', updatedAt: now } : item);
    db.runs = db.runs.map((item) => item.environmentId === id ? { ...item, status: 'deleted', finishedAt: item.finishedAt ?? now } : item);
    this.write(db);
    return true;
  }

  createSuite(input: { projectId: string; name: string; type: 'web' | 'api'; specContent: string }): Suite {
    const db = this.read();
    const now = nowIso();
    const suite: Suite = {
      id: randomUUID(),
      projectId: input.projectId,
      name: input.name,
      type: input.type,
      specPath: path.join(this.suitesDir, `${input.name.replace(/[^a-zA-Z0-9._-]/g, '_')}-${Date.now()}.yaml`),
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };
    fs.writeFileSync(suite.specPath, input.specContent, 'utf8');
    db.suites.push(suite);
    this.write(db);
    return suite;
  }

  getSuiteContent(id: string): (Suite & { specContent: string }) | undefined {
    const suite = this.read().suites.find((item) => item.id === id && item.status !== 'inactive');
    if (!suite) return undefined;
    return {
      ...suite,
      specContent: fs.existsSync(suite.specPath) ? fs.readFileSync(suite.specPath, 'utf8') : '',
    };
  }

  updateSuite(id: string, input: { name: string; type: 'web' | 'api'; specContent: string }): Suite | undefined {
    const db = this.read();
    const index = db.suites.findIndex((suite) => suite.id === id && suite.status !== 'inactive');
    if (index === -1) return undefined;
    const current = db.suites[index];
    const suite: Suite = {
      ...current,
      name: input.name,
      type: input.type,
      updatedAt: nowIso(),
    };
    fs.writeFileSync(suite.specPath, input.specContent, 'utf8');
    db.suites[index] = suite;
    this.write(db);
    return suite;
  }

  createRun(input: { projectId: string; environmentId: string; suiteId: string }): RunRecord {
    const db = this.read();
    const run: RunRecord = {
      id: randomUUID(),
      projectId: input.projectId,
      environmentId: input.environmentId,
      suiteId: input.suiteId,
      status: 'queued',
      createdAt: nowIso(),
    };
    db.runs.unshift(run);
    this.write(db);
    return run;
  }

  updateRun(id: string, patch: Partial<RunRecord>): RunRecord {
    const db = this.read();
    const index = db.runs.findIndex((run) => run.id === id);
    if (index === -1) throw new Error(`Run nao encontrada: ${id}`);
    db.runs[index] = { ...db.runs[index], ...patch };
    this.write(db);
    return db.runs[index];
  }

  archiveRunsBefore(cutoffIso: string, options: { projectId?: string; cleanupArtifacts?: boolean; runsDir?: string } = {}): number {
    const db = this.read();
    let archived = 0;
    db.runs = db.runs.map((run) => {
      if (run.createdAt >= cutoffIso || run.status === 'deleted') return run;
      if (options.projectId && run.projectId !== options.projectId) return run;
      archived += 1;
      if (options.cleanupArtifacts) cleanupRunArtifacts(options.runsDir ?? this.runsDir, run.reportPath, run.reportHtmlPath);
      return { ...run, status: 'deleted', finishedAt: run.finishedAt ?? nowIso() };
    });
    this.write(db);
    return archived;
  }

  upsertAiConnection(input: Omit<AiConnection, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): AiConnection {
    const db = this.read();
    const now = nowIso();
    const existing = input.id ? db.aiConnections.findIndex((connection) => connection.id === input.id && connection.organizationId === input.organizationId) : -1;
    const connection: AiConnection = {
      id: input.id ?? randomUUID(),
      organizationId: input.organizationId,
      name: input.name,
      provider: input.provider,
      apiKey: input.apiKey ? encryptSecret(input.apiKey) : undefined,
      model: input.model,
      baseUrl: input.baseUrl,
      enabled: input.enabled,
      createdAt: existing >= 0 ? db.aiConnections[existing].createdAt : now,
      updatedAt: now,
    };
    if (existing >= 0) db.aiConnections[existing] = connection;
    else db.aiConnections.push(connection);
    this.write(db);
    return { ...connection, apiKey: connection.apiKey ? '[REDACTED]' : undefined };
  }

  listAiConnectionsForOrganization(organizationId: string): AiConnection[] {
    return this.read().aiConnections
      .filter((connection) => connection.organizationId === organizationId)
      .map((connection) => ({ ...connection, apiKey: connection.apiKey ? '[REDACTED]' : undefined }));
  }

  getEnvironmentVariables(environmentId: string): Record<string, string> {
    const environment = this.read().environments.find((item) => item.id === environmentId);
    return decryptVariables(environment?.variables);
  }

  getAiConnection(organizationId: string, connectionId?: string): AiConnection | undefined {
    const connection = connectionId
      ? this.read().aiConnections.find((item) => item.id === connectionId && item.organizationId === organizationId)
      : this.read().aiConnections.find((item) => item.enabled && item.organizationId === organizationId);
    if (!connection) return undefined;
    return { ...connection, apiKey: connection.apiKey ? decryptSecret(connection.apiKey) : undefined };
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'team';
}

function tokenPreview(token: string): string {
  return `${token.slice(0, 10)}...${token.slice(-6)}`;
}

function cleanupRunArtifacts(allowedRoot: string, ...paths: Array<string | undefined>): void {
  const root = path.resolve(allowedRoot);
  for (const item of paths.filter(Boolean)) {
    const target = path.resolve(item!);
    if (!target.startsWith(root)) continue;
    if (!fs.existsSync(target)) continue;
    const dir = fs.statSync(target).isDirectory() ? target : path.dirname(target);
    if (dir === root) continue;
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
