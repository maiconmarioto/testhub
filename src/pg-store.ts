import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { desc, eq, lt } from 'drizzle-orm';
import { ensureDir } from './fs-utils.js';
import { aiConnections, environments, projects, runs, suites } from './db/schema.js';
import type { AiConnection, Database, Environment, Project, RunRecord, Store, Suite } from './store.js';
import { decryptSecret, decryptVariables, encryptSecret, encryptVariables, maskVariables } from './secrets.js';

const { Pool } = pg;

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

  async read(): Promise<Database> {
    const [projectRows, environmentRows, suiteRows, runRows, aiRows] = await Promise.all([
      this.db.select().from(projects),
      this.db.select().from(environments),
      this.db.select().from(suites),
      this.db.select().from(runs).orderBy(desc(runs.createdAt)),
      this.db.select().from(aiConnections),
    ]);
    return {
      projects: projectRows.map(rowToProject),
      environments: environmentRows.map(rowToEnvironmentSafe),
      suites: suiteRows.map(rowToSuite),
      runs: runRows.map(rowToRun),
      aiConnections: aiRows.map(rowToAiSafe),
    };
  }

  async createProject(input: { name: string; description?: string }): Promise<Project> {
    const now = new Date();
    const project = { id: randomUUID(), name: input.name, description: input.description ?? null, status: 'active', createdAt: now, updatedAt: now };
    await this.db.insert(projects).values(project);
    return rowToProject(project);
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

  async createSuite(input: { projectId: string; name: string; type: 'web' | 'api'; specContent: string }): Promise<Suite> {
    const now = new Date();
    const specPath = path.join(this.suitesDir, `${input.name.replace(/[^a-zA-Z0-9._-]/g, '_')}-${Date.now()}.yaml`);
    fs.writeFileSync(specPath, input.specContent, 'utf8');
    const suite = { id: randomUUID(), projectId: input.projectId, name: input.name, type: input.type, specPath, status: 'active', createdAt: now, updatedAt: now };
    await this.db.insert(suites).values(suite);
    return rowToSuite(suite);
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

  async deleteRunsBefore(cutoffIso: string): Promise<number> {
    const rows = await this.db.delete(runs).where(lt(runs.createdAt, new Date(cutoffIso))).returning({ id: runs.id });
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

function rowToProject(row: { id: string; name: string; description?: string | null; status: string; createdAt: Date | string; updatedAt: Date | string }): Project {
  return { id: row.id, name: row.name, description: row.description ?? undefined, status: row.status as Project['status'], createdAt: toIso(row.createdAt), updatedAt: toIso(row.updatedAt) };
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
