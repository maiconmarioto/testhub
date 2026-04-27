import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { ensureDir, writeJson } from '../../shared/src/fs-utils.js';
import { decryptSecret, decryptVariables, encryptSecret, encryptVariables, maskVariables } from './secrets.js';

export type EntityStatus = 'active' | 'inactive';
export type RunStatus = 'queued' | 'running' | 'passed' | 'failed' | 'error' | 'canceled' | 'deleted';

export interface Project {
  id: string;
  name: string;
  description?: string;
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
  createProject(input: { name: string; description?: string }): Promise<Project> | Project;
  updateProject(id: string, input: { name: string; description?: string }): Promise<Project | undefined> | Project | undefined;
  archiveProject(id: string): Promise<boolean> | boolean;
  createEnvironment(input: { projectId: string; name: string; baseUrl: string; variables?: Record<string, string> }): Promise<Environment> | Environment;
  createSuite(input: { projectId: string; name: string; type: 'web' | 'api'; specContent: string }): Promise<Suite> | Suite;
  getSuiteContent(id: string): Promise<(Suite & { specContent: string }) | undefined> | (Suite & { specContent: string }) | undefined;
  updateSuite(id: string, input: { name: string; type: 'web' | 'api'; specContent: string }): Promise<Suite | undefined> | Suite | undefined;
  createRun(input: { projectId: string; environmentId: string; suiteId: string }): Promise<RunRecord> | RunRecord;
  updateRun(id: string, patch: Partial<RunRecord>): Promise<RunRecord> | RunRecord;
  archiveRunsBefore?(cutoffIso: string): Promise<number> | number;
  upsertAiConnection(input: Omit<AiConnection, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<AiConnection> | AiConnection;
  getEnvironmentVariables(environmentId: string): Promise<Record<string, string>> | Record<string, string>;
  getAiConnection(connectionId?: string): Promise<AiConnection | undefined> | AiConnection | undefined;
}

const emptyDb: Database = {
  projects: [],
  environments: [],
  suites: [],
  runs: [],
  aiConnections: [],
};

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
    return JSON.parse(fs.readFileSync(this.dbPath, 'utf8')) as Database;
  }

  write(db: Database): void {
    writeJson(this.dbPath, db);
  }

  getProject(id: string): Project | undefined {
    return this.read().projects.find((project) => project.id === id && project.status !== 'inactive');
  }

  createProject(input: { name: string; description?: string }): Project {
    const db = this.read();
    const now = nowIso();
    const project: Project = {
      id: randomUUID(),
      name: input.name,
      description: input.description,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };
    db.projects.push(project);
    this.write(db);
    return project;
  }

  updateProject(id: string, input: { name: string; description?: string }): Project | undefined {
    const db = this.read();
    const index = db.projects.findIndex((project) => project.id === id && project.status !== 'inactive');
    if (index === -1) return undefined;
    const project: Project = {
      ...db.projects[index],
      name: input.name,
      description: input.description,
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

  archiveRunsBefore(cutoffIso: string): number {
    const db = this.read();
    let archived = 0;
    db.runs = db.runs.map((run) => {
      if (run.createdAt >= cutoffIso || run.status === 'deleted') return run;
      archived += 1;
      return { ...run, status: 'deleted', finishedAt: run.finishedAt ?? nowIso() };
    });
    this.write(db);
    return archived;
  }

  upsertAiConnection(input: Omit<AiConnection, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): AiConnection {
    const db = this.read();
    const now = nowIso();
    const existing = input.id ? db.aiConnections.findIndex((connection) => connection.id === input.id) : -1;
    const connection: AiConnection = {
      id: input.id ?? randomUUID(),
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

  getEnvironmentVariables(environmentId: string): Record<string, string> {
    const environment = this.read().environments.find((item) => item.id === environmentId);
    return decryptVariables(environment?.variables);
  }

  getAiConnection(connectionId?: string): AiConnection | undefined {
    const connection = connectionId
      ? this.read().aiConnections.find((item) => item.id === connectionId)
      : this.read().aiConnections.find((item) => item.enabled);
    if (!connection) return undefined;
    return { ...connection, apiKey: connection.apiKey ? decryptSecret(connection.apiKey) : undefined };
  }
}

function nowIso(): string {
  return new Date().toISOString();
}
