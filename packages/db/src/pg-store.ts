import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { and, desc, eq, gt, isNull, lt, ne, sql } from 'drizzle-orm';
import { ensureDir } from '../../shared/src/fs-utils.js';
import { aiConnections, environments, memberships, organizations, passwordResetTokens, projects, runs, sessions, suites, users } from './schema.js';
import type { AiConnection, AuthSession, Database, Environment, MembershipRole, Organization, OrganizationMembership, PasswordResetToken, Project, RunRecord, Store, Suite, User } from './store.js';
import { decryptSecret, decryptVariables, encryptSecret, encryptVariables, maskVariables } from './secrets.js';

const { Pool } = pg;
const LEGACY_ORGANIZATION_ID = 'legacy-local';

export class PgStore implements Store {
  public readonly rootDir: string;
  private readonly pool: pg.Pool;
  private readonly db;

  constructor(connectionString = process.env.DATABASE_URL!, rootDir = process.env.TESTHUB_DATA_DIR ?? '.testhub-data') {
    this.rootDir = path.resolve(rootDir);
    ensureDir(this.suitesDir);
    ensureDir(this.runsDir);
    this.pool = new Pool({ connectionString });
    this.db = drizzle(this.pool);
  }

  get suitesDir(): string {
    return path.join(this.rootDir, 'suites');
  }

  get runsDir(): string {
    return path.join(this.rootDir, 'runs');
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async read(): Promise<Database> {
    const [userRows, organizationRows, membershipRows, sessionRows, passwordResetRows, projectRows, environmentRows, suiteRows, runRows, aiRows] = await Promise.all([
      this.db.select().from(users),
      this.db.select().from(organizations),
      this.db.select().from(memberships),
      this.db.select().from(sessions),
      this.db.select().from(passwordResetTokens),
      this.db.select().from(projects),
      this.db.select().from(environments),
      this.db.select().from(suites),
      this.db.select().from(runs).orderBy(desc(runs.createdAt)),
      this.db.select().from(aiConnections),
    ]);
    return {
      users: userRows.map(rowToUser),
      organizations: organizationRows.map(rowToOrganization),
      memberships: membershipRows.map(rowToMembership),
      sessions: sessionRows.map(rowToSession),
      passwordResetTokens: passwordResetRows.map(rowToPasswordResetToken),
      projects: projectRows.map(rowToProject),
      environments: environmentRows.map(rowToEnvironmentSafe),
      suites: suiteRows.map(rowToSuite),
      runs: runRows.map(rowToRun),
      aiConnections: aiRows.map(rowToAiSafe),
    };
  }

  async getProject(id: string): Promise<Project | undefined> {
    const [project] = await this.db.select().from(projects).where(and(eq(projects.id, id), ne(projects.status, 'inactive')));
    return project ? rowToProject(project) : undefined;
  }

  async createProject(input: { organizationId: string; name: string; description?: string; retentionDays?: number; cleanupArtifacts?: boolean }): Promise<Project> {
    const now = new Date();
    const project = {
      id: randomUUID(),
      organizationId: input.organizationId,
      name: input.name,
      description: input.description ?? null,
      retentionDays: input.retentionDays ?? null,
      cleanupArtifacts: input.cleanupArtifacts ?? null,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };
    await this.db.insert(projects).values(project);
    return rowToProject(project);
  }

  async createUser(input: { email: string; name?: string; passwordHash: string }): Promise<User> {
    const now = new Date();
    const email = normalizeEmail(input.email);
    const [existing] = await this.db.select({ id: users.id }).from(users).where(eq(sql<string>`lower(${users.email})`, email));
    if (existing) throw new Error('Email ja cadastrado');
    const user = {
      id: randomUUID(),
      email,
      name: input.name ?? null,
      passwordHash: input.passwordHash,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };
    try {
      await this.db.insert(users).values(user);
    } catch (error) {
      if (isUniqueViolation(error)) throw new Error('Email ja cadastrado');
      throw error;
    }
    return rowToUser(user);
  }

  async hasActiveUsers(): Promise<boolean> {
    const [user] = await this.db.select({ id: users.id }).from(users).where(eq(users.status, 'active')).limit(1);
    return Boolean(user);
  }

  async findUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await this.db.select().from(users).where(and(eq(sql<string>`lower(${users.email})`, normalizeEmail(email)), eq(users.status, 'active')));
    return user ? rowToUser(user) : undefined;
  }

  async findUserById(id: string): Promise<User | undefined> {
    const [user] = await this.db.select().from(users).where(and(eq(users.id, id), eq(users.status, 'active')));
    return user ? rowToUser(user) : undefined;
  }

  async updateUserPassword(userId: string, passwordHash: string): Promise<User | undefined> {
    const [user] = await this.db.update(users)
      .set({ passwordHash, updatedAt: new Date() })
      .where(and(eq(users.id, userId), eq(users.status, 'active')))
      .returning();
    return user ? rowToUser(user) : undefined;
  }

  async createOrganization(input: { name: string; slug?: string }): Promise<Organization> {
    const baseSlug = slugify(input.slug ?? input.name);
    for (let attempt = 1; attempt <= 20; attempt += 1) {
      const now = new Date();
      const slug = attempt === 1 ? baseSlug : `${baseSlug}-${attempt}`;
      const [existing] = await this.db.select({ id: organizations.id }).from(organizations).where(eq(organizations.slug, slug));
      if (existing) continue;
      const organization = {
        id: randomUUID(),
        name: input.name,
        slug,
        status: 'active',
        createdAt: now,
        updatedAt: now,
      };
      try {
        await this.db.insert(organizations).values(organization);
        return rowToOrganization(organization);
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
      }
    }
    throw new Error('Slug de organizacao ja cadastrado');
  }

  async listOrganizationsForUser(userId: string): Promise<Organization[]> {
    const [membershipRows, organizationRows] = await Promise.all([
      this.db.select().from(memberships).where(eq(memberships.userId, userId)),
      this.db.select().from(organizations).where(eq(organizations.status, 'active')),
    ]);
    const organizationIds = new Set(membershipRows.map((membership) => membership.organizationId));
    return organizationRows.filter((organization) => organizationIds.has(organization.id)).map(rowToOrganization);
  }

  async createMembership(input: { userId: string; organizationId: string; role: MembershipRole }): Promise<OrganizationMembership> {
    const existing = await this.findMembership(input.userId, input.organizationId);
    if (existing) return existing;
    const now = new Date();
    const membership = {
      id: randomUUID(),
      userId: input.userId,
      organizationId: input.organizationId,
      role: input.role,
      createdAt: now,
      updatedAt: now,
    };
    try {
      await this.db.insert(memberships).values(membership);
    } catch (error) {
      if (isUniqueViolation(error)) {
        const duplicate = await this.findMembership(input.userId, input.organizationId);
        if (duplicate) return duplicate;
      }
      throw error;
    }
    return rowToMembership(membership);
  }

  async listMembershipsForUser(userId: string): Promise<OrganizationMembership[]> {
    const rows = await this.db.select().from(memberships).where(eq(memberships.userId, userId));
    return rows.map(rowToMembership);
  }

  async findMembership(userId: string, organizationId: string): Promise<OrganizationMembership | undefined> {
    const [membership] = await this.db.select().from(memberships).where(and(eq(memberships.userId, userId), eq(memberships.organizationId, organizationId)));
    return membership ? rowToMembership(membership) : undefined;
  }

  async listMembershipsForOrganization(organizationId: string): Promise<OrganizationMembership[]> {
    const rows = await this.db.select().from(memberships).where(eq(memberships.organizationId, organizationId));
    return rows.map(rowToMembership);
  }

  async createSession(input: { userId: string; organizationId: string; tokenHash: string; expiresAt: string }): Promise<AuthSession> {
    const [existing] = await this.db.select({ id: sessions.id }).from(sessions).where(eq(sessions.tokenHash, input.tokenHash));
    if (existing) throw new Error('Sessao ja cadastrada');
    const session = {
      id: randomUUID(),
      userId: input.userId,
      organizationId: input.organizationId,
      tokenHash: input.tokenHash,
      expiresAt: new Date(input.expiresAt),
      createdAt: new Date(),
      lastUsedAt: null,
    };
    try {
      await this.db.insert(sessions).values(session);
    } catch (error) {
      if (isUniqueViolation(error)) throw new Error('Sessao ja cadastrada');
      throw error;
    }
    return rowToSession(session);
  }

  async findSessionByTokenHash(tokenHash: string): Promise<AuthSession | undefined> {
    const [session] = await this.db.select().from(sessions).where(eq(sessions.tokenHash, tokenHash));
    if (!session || session.expiresAt <= new Date()) return undefined;
    return rowToSession(session);
  }

  async deleteSession(id: string): Promise<boolean> {
    const deleted = await this.db.delete(sessions).where(eq(sessions.id, id)).returning({ id: sessions.id });
    return deleted.length > 0;
  }

  async createPasswordResetToken(input: { userId: string; tokenHash: string; expiresAt: string }): Promise<PasswordResetToken> {
    const [existing] = await this.db.select({ id: passwordResetTokens.id }).from(passwordResetTokens).where(eq(passwordResetTokens.tokenHash, input.tokenHash));
    if (existing) throw new Error('Token de reset ja cadastrado');
    const resetToken = {
      id: randomUUID(),
      userId: input.userId,
      tokenHash: input.tokenHash,
      expiresAt: new Date(input.expiresAt),
      usedAt: null,
      createdAt: new Date(),
    };
    try {
      await this.db.insert(passwordResetTokens).values(resetToken);
    } catch (error) {
      if (isUniqueViolation(error)) throw new Error('Token de reset ja cadastrado');
      throw error;
    }
    return rowToPasswordResetToken(resetToken);
  }

  async findPasswordResetByTokenHash(tokenHash: string): Promise<PasswordResetToken | undefined> {
    const [resetToken] = await this.db.select().from(passwordResetTokens).where(eq(passwordResetTokens.tokenHash, tokenHash));
    if (!resetToken || resetToken.expiresAt <= new Date() || resetToken.usedAt) return undefined;
    return rowToPasswordResetToken(resetToken);
  }

  async markPasswordResetUsed(id: string): Promise<PasswordResetToken | undefined> {
    const [resetToken] = await this.db.update(passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(and(eq(passwordResetTokens.id, id), isNull(passwordResetTokens.usedAt), gt(passwordResetTokens.expiresAt, new Date())))
      .returning();
    if (resetToken) return rowToPasswordResetToken(resetToken);
    return undefined;
  }

  async listProjectsForOrganization(organizationId: string): Promise<Project[]> {
    const rows = await this.db.select().from(projects).where(and(eq(projects.organizationId, organizationId), ne(projects.status, 'inactive')));
    return rows.map(rowToProject);
  }

  async updateProject(id: string, input: { name: string; description?: string; retentionDays?: number; cleanupArtifacts?: boolean }): Promise<Project | undefined> {
    const [project] = await this.db.update(projects)
      .set({
        name: input.name,
        description: input.description ?? null,
        retentionDays: input.retentionDays ?? null,
        cleanupArtifacts: input.cleanupArtifacts ?? null,
        updatedAt: new Date(),
      })
      .where(and(eq(projects.id, id), ne(projects.status, 'inactive')))
      .returning();
    return project ? rowToProject(project) : undefined;
  }

  async archiveProject(id: string): Promise<boolean> {
    const now = new Date();
    const archived = await this.db.update(projects).set({ status: 'inactive', updatedAt: now }).where(and(eq(projects.id, id), ne(projects.status, 'inactive'))).returning({ id: projects.id });
    if (archived.length === 0) return false;
    await this.db.update(environments).set({ status: 'inactive', updatedAt: now }).where(eq(environments.projectId, id));
    await this.db.update(suites).set({ status: 'inactive', updatedAt: now }).where(eq(suites.projectId, id));
    await this.db.update(runs).set({ status: 'deleted', finishedAt: now }).where(eq(runs.projectId, id));
    return true;
  }

  async createEnvironment(input: { projectId: string; name: string; baseUrl: string; variables?: Record<string, string> }): Promise<Environment> {
    const now = new Date();
    const environment = {
      id: randomUUID(),
      projectId: input.projectId,
      name: input.name,
      baseUrl: input.baseUrl,
      variables: encryptVariables(input.variables),
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };
    await this.db.insert(environments).values(environment);
    return rowToEnvironmentSafe(environment);
  }

  async updateEnvironment(id: string, input: { name: string; baseUrl: string; variables?: Record<string, string> }): Promise<Environment | undefined> {
    const [environment] = await this.db.update(environments)
      .set({
        name: input.name,
        baseUrl: input.baseUrl,
        variables: encryptVariables(input.variables),
        updatedAt: new Date(),
      })
      .where(and(eq(environments.id, id), ne(environments.status, 'inactive')))
      .returning();
    return environment ? rowToEnvironmentSafe(environment) : undefined;
  }

  async archiveEnvironment(id: string): Promise<boolean> {
    const now = new Date();
    const archived = await this.db.update(environments)
      .set({ status: 'inactive', updatedAt: now })
      .where(and(eq(environments.id, id), ne(environments.status, 'inactive')))
      .returning({ id: environments.id });
    if (archived.length === 0) return false;
    await this.db.update(runs).set({ status: 'deleted', finishedAt: now }).where(eq(runs.environmentId, id));
    return true;
  }

  async createSuite(input: { projectId: string; name: string; type: 'web' | 'api'; specContent: string }): Promise<Suite> {
    const now = new Date();
    const specPath = path.join(this.suitesDir, `${input.name.replace(/[^a-zA-Z0-9._-]/g, '_')}-${Date.now()}.yaml`);
    fs.writeFileSync(specPath, input.specContent, 'utf8');
    const suite = { id: randomUUID(), projectId: input.projectId, name: input.name, type: input.type, specPath, status: 'active', createdAt: now, updatedAt: now };
    await this.db.insert(suites).values(suite);
    return rowToSuite(suite);
  }

  async getSuiteContent(id: string): Promise<(Suite & { specContent: string }) | undefined> {
    const [suite] = await this.db.select().from(suites).where(and(eq(suites.id, id), ne(suites.status, 'inactive')));
    if (!suite) return undefined;
    return {
      ...rowToSuite(suite),
      specContent: fs.existsSync(suite.specPath) ? fs.readFileSync(suite.specPath, 'utf8') : '',
    };
  }

  async updateSuite(id: string, input: { name: string; type: 'web' | 'api'; specContent: string }): Promise<Suite | undefined> {
    const [current] = await this.db.select().from(suites).where(and(eq(suites.id, id), ne(suites.status, 'inactive')));
    if (!current) return undefined;
    fs.writeFileSync(current.specPath, input.specContent, 'utf8');
    const [suite] = await this.db.update(suites)
      .set({ name: input.name, type: input.type, updatedAt: new Date() })
      .where(eq(suites.id, id))
      .returning();
    return suite ? rowToSuite(suite) : undefined;
  }

  async createRun(input: { projectId: string; environmentId: string; suiteId: string }): Promise<RunRecord> {
    const now = new Date();
    const run = { id: randomUUID(), projectId: input.projectId, environmentId: input.environmentId, suiteId: input.suiteId, status: 'queued', createdAt: now };
    await this.db.insert(runs).values(run);
    return rowToRun(run);
  }

  async updateRun(id: string, patch: Partial<RunRecord>): Promise<RunRecord> {
    const values: Partial<typeof runs.$inferInsert> = {};
    if (patch.status) values.status = patch.status;
    if (patch.reportPath !== undefined) values.reportPath = patch.reportPath;
    if (patch.reportHtmlPath !== undefined) values.reportHtmlPath = patch.reportHtmlPath;
    if (patch.error !== undefined) values.error = patch.error;
    if (patch.summary !== undefined) values.summary = patch.summary;
    if (patch.startedAt !== undefined) values.startedAt = new Date(patch.startedAt);
    if (patch.finishedAt !== undefined) values.finishedAt = new Date(patch.finishedAt);
    const [row] = await this.db.update(runs).set(values).where(eq(runs.id, id)).returning();
    if (!row) throw new Error(`Run nao encontrada: ${id}`);
    return rowToRun(row);
  }

  async archiveRunsBefore(cutoffIso: string, options: { projectId?: string; cleanupArtifacts?: boolean; runsDir?: string } = {}): Promise<number> {
    const conditions = [lt(runs.createdAt, new Date(cutoffIso)), ne(runs.status, 'deleted')];
    if (options.projectId) conditions.push(eq(runs.projectId, options.projectId));
    const rows = await this.db.update(runs).set({ status: 'deleted', finishedAt: new Date() }).where(and(...conditions)).returning({ id: runs.id });
    return rows.length;
  }

  async upsertAiConnection(input: Omit<AiConnection, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<AiConnection> {
    const now = new Date();
    const existing = input.id ? (await this.db.select().from(aiConnections).where(eq(aiConnections.id, input.id)))[0] : undefined;
    const connection = {
      id: input.id ?? randomUUID(),
      name: input.name,
      provider: input.provider,
      apiKey: input.apiKey ? encryptSecret(input.apiKey) : existing?.apiKey,
      model: input.model,
      baseUrl: input.baseUrl,
      enabled: String(input.enabled),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    if (existing) await this.db.update(aiConnections).set(connection).where(eq(aiConnections.id, connection.id));
    else await this.db.insert(aiConnections).values(connection);
    return rowToAiSafe(connection);
  }

  async getEnvironmentVariables(environmentId: string): Promise<Record<string, string>> {
    const [environment] = await this.db.select().from(environments).where(eq(environments.id, environmentId));
    return decryptVariables(environment?.variables ?? undefined);
  }

  async getAiConnection(connectionId?: string): Promise<AiConnection | undefined> {
    const rows = await this.db.select().from(aiConnections);
    const connection = connectionId ? rows.find((item) => item.id === connectionId) : rows.find((item) => item.enabled === 'true');
    if (!connection) return undefined;
    return { ...rowToAiSafe(connection), apiKey: connection.apiKey ? decryptSecret(connection.apiKey) : undefined };
  }
}

function rowToUser(row: { id: string; email: string; name?: string | null; passwordHash: string; status: string; createdAt: Date | string; updatedAt: Date | string }): User {
  return {
    id: row.id,
    email: row.email,
    name: row.name ?? undefined,
    passwordHash: row.passwordHash,
    status: row.status as User['status'],
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function rowToOrganization(row: { id: string; name: string; slug: string; status: string; createdAt: Date | string; updatedAt: Date | string }): Organization {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    status: row.status as Organization['status'],
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function rowToMembership(row: { id: string; organizationId: string; userId: string; role: string; createdAt: Date | string; updatedAt: Date | string }): OrganizationMembership {
  return {
    id: row.id,
    organizationId: row.organizationId,
    userId: row.userId,
    role: row.role as OrganizationMembership['role'],
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function rowToSession(row: { id: string; userId: string; organizationId: string; tokenHash: string; expiresAt: Date | string; createdAt: Date | string; lastUsedAt?: Date | string | null }): AuthSession {
  return {
    id: row.id,
    userId: row.userId,
    organizationId: row.organizationId,
    tokenHash: row.tokenHash,
    expiresAt: toIso(row.expiresAt),
    createdAt: toIso(row.createdAt),
    lastUsedAt: row.lastUsedAt ? toIso(row.lastUsedAt) : undefined,
  };
}

function rowToPasswordResetToken(row: { id: string; userId: string; tokenHash: string; expiresAt: Date | string; usedAt?: Date | string | null; createdAt: Date | string }): PasswordResetToken {
  return {
    id: row.id,
    userId: row.userId,
    tokenHash: row.tokenHash,
    expiresAt: toIso(row.expiresAt),
    usedAt: row.usedAt ? toIso(row.usedAt) : undefined,
    createdAt: toIso(row.createdAt),
  };
}

function rowToProject(row: { id: string; organizationId?: string | null; name: string; description?: string | null; retentionDays?: number | null; cleanupArtifacts?: boolean | null; status: string; createdAt: Date | string; updatedAt: Date | string }): Project {
  return {
    id: row.id,
    organizationId: row.organizationId ?? LEGACY_ORGANIZATION_ID,
    name: row.name,
    description: row.description ?? undefined,
    retentionDays: row.retentionDays ?? undefined,
    cleanupArtifacts: row.cleanupArtifacts ?? undefined,
    status: row.status as Project['status'],
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function rowToEnvironmentSafe(row: { id: string; projectId: string; name: string; baseUrl: string; status: string; variables?: Record<string, string> | null; createdAt: Date | string; updatedAt: Date | string }): Environment {
  return { id: row.id, projectId: row.projectId, name: row.name, baseUrl: row.baseUrl, status: row.status as Environment['status'], variables: maskVariables(row.variables ?? undefined), createdAt: toIso(row.createdAt), updatedAt: toIso(row.updatedAt) };
}

function rowToSuite(row: { id: string; projectId: string; name: string; type: string; specPath: string; status: string; createdAt: Date | string; updatedAt: Date | string }): Suite {
  return { id: row.id, projectId: row.projectId, name: row.name, type: row.type as Suite['type'], specPath: row.specPath, status: row.status as Suite['status'], createdAt: toIso(row.createdAt), updatedAt: toIso(row.updatedAt) };
}

function rowToRun(row: Record<string, unknown>): RunRecord {
  return {
    id: String(row.id),
    projectId: String(row.projectId),
    environmentId: String(row.environmentId),
    suiteId: String(row.suiteId),
    status: row.status as RunRecord['status'],
    reportPath: row.reportPath as string | undefined,
    reportHtmlPath: row.reportHtmlPath as string | undefined,
    error: row.error as string | undefined,
    createdAt: toIso(row.createdAt as Date | string),
    startedAt: row.startedAt ? toIso(row.startedAt as Date | string) : undefined,
    finishedAt: row.finishedAt ? toIso(row.finishedAt as Date | string) : undefined,
    summary: row.summary,
  };
}

function rowToAiSafe(row: { id: string; name: string; provider: string; apiKey?: string | null; model: string; baseUrl?: string | null; enabled: string | boolean; createdAt: Date | string; updatedAt: Date | string }): AiConnection {
  return { id: row.id, name: row.name, provider: row.provider as AiConnection['provider'], apiKey: row.apiKey ? '[REDACTED]' : undefined, model: row.model, baseUrl: row.baseUrl ?? undefined, enabled: row.enabled === true || row.enabled === 'true', createdAt: toIso(row.createdAt), updatedAt: toIso(row.updatedAt) };
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
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

function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  if ('code' in error && error.code === '23505') return true;
  if ('cause' in error) return isUniqueViolation(error.cause);
  return false;
}
