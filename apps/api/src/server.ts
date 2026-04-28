#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import { z, ZodError } from 'zod';
import { buildFailurePrompt, buildFixPrompt, buildTestSuggestionPrompt, callAi } from '../../../packages/ai/src/ai.js';
import { createResetToken, createSessionToken, hashPassword, hashToken, resetExpiresAt, sessionExpiresAt, verifyPassword } from '../../../packages/db/src/auth.js';
import { cleanupOldRuns } from '../../../packages/db/src/cleanup.js';
import { auditCsv, readAudit, writeAudit } from '../../../packages/db/src/audit.js';
import { createRunQueue } from '../../../packages/shared/src/jobs.js';
import { openApiToSuite } from '../../../packages/spec/src/openapi-import.js';
import { parseSpecContent, SpecValidationError } from '../../../packages/spec/src/spec.js';
import { redactDeep } from '../../../packages/shared/src/redact.js';
import { executeRun } from '../../worker/src/run-executor.js';
import { maskVariables } from '../../../packages/db/src/secrets.js';
import { actorFromAuthorization, actorLabel, authMode, hasPermission, isDefaultSecretKey, isHostAllowed, retentionDays, systemSecurityStatus, type AuthActor, type Permission } from '../../../packages/db/src/security.js';
import { createStore } from '../../../packages/db/src/store-factory.js';
import type { Database, Environment, Project, RunRecord, Suite, User } from '../../../packages/db/src/store.js';

const sessionCookieName = 'testhub_session';
const passwordSchema = z.string().min(8).max(200);

const openApiDocument = {
  openapi: '3.0.3',
  info: {
    title: 'TestHub API',
    description: 'REST API para projetos, ambientes, suites, runs, artifacts e AI opcional.',
    version: '0.1.0',
  },
  tags: [
    { name: 'system' },
    { name: 'projects' },
    { name: 'environments' },
    { name: 'suites' },
    { name: 'runs' },
    { name: 'artifacts' },
    { name: 'ai' },
  ],
  paths: {
    '/': { get: { tags: ['system'], summary: 'Service metadata', responses: { '200': { description: 'OK' } } } },
    '/api/health': { get: { tags: ['system'], summary: 'Health check', responses: { '200': { description: 'OK' } } } },
    '/api/projects': {
      get: { tags: ['projects'], summary: 'List projects', responses: { '200': { description: 'OK' } } },
      post: { tags: ['projects'], summary: 'Create project', responses: { '201': { description: 'Created' } } },
    },
    '/api/projects/{id}': {
      get: { tags: ['projects'], summary: 'Get project', responses: { '200': { description: 'OK' }, '404': { description: 'Not found' } } },
      put: { tags: ['projects'], summary: 'Update project', responses: { '200': { description: 'OK' }, '404': { description: 'Not found' } } },
      delete: { tags: ['projects'], summary: 'Soft delete project and child records', responses: { '204': { description: 'Archived' }, '404': { description: 'Not found' } } },
    },
    '/api/environments': {
      get: { tags: ['environments'], summary: 'List environments', responses: { '200': { description: 'OK' } } },
      post: { tags: ['environments'], summary: 'Create environment', responses: { '201': { description: 'Created' } } },
    },
    '/api/environments/{id}': {
      get: { tags: ['environments'], summary: 'Get environment', responses: { '200': { description: 'OK' }, '404': { description: 'Not found' } } },
      put: { tags: ['environments'], summary: 'Update environment', responses: { '200': { description: 'OK' }, '404': { description: 'Not found' } } },
      delete: { tags: ['environments'], summary: 'Soft delete environment and child runs', responses: { '204': { description: 'Archived' }, '404': { description: 'Not found' } } },
    },
    '/api/suites': {
      get: { tags: ['suites'], summary: 'List suites', responses: { '200': { description: 'OK' } } },
      post: { tags: ['suites'], summary: 'Create suite', responses: { '201': { description: 'Created' } } },
    },
    '/api/suites/{id}': {
      get: { tags: ['suites'], summary: 'Get suite with spec content', responses: { '200': { description: 'OK' }, '404': { description: 'Not found' } } },
      put: { tags: ['suites'], summary: 'Update suite spec content', responses: { '200': { description: 'OK' }, '404': { description: 'Not found' } } },
    },
    '/api/import/openapi': { post: { tags: ['suites'], summary: 'Import OpenAPI as API suite', responses: { '201': { description: 'Created' } } } },
    '/api/spec/validate': { post: { tags: ['suites'], summary: 'Validate TestHub YAML spec', responses: { '200': { description: 'Valid' }, '400': { description: 'Invalid' } } } },
    '/api/runs': {
      get: { tags: ['runs'], summary: 'List runs', responses: { '200': { description: 'OK' } } },
      post: { tags: ['runs'], summary: 'Create run', responses: { '202': { description: 'Queued' } } },
    },
    '/api/runs/{id}': { get: { tags: ['runs'], summary: 'Get run', responses: { '200': { description: 'OK' }, '404': { description: 'Not found' } } } },
    '/api/runs/{id}/cancel': { post: { tags: ['runs'], summary: 'Cancel run', responses: { '200': { description: 'OK' } } } },
    '/api/runs/{id}/report': { get: { tags: ['runs'], summary: 'Get run JSON report', responses: { '200': { description: 'OK' }, '404': { description: 'Not found' } } } },
    '/artifacts': { get: { tags: ['artifacts'], summary: 'Stream local artifact', responses: { '200': { description: 'Artifact stream' } } } },
    '/api/ai/connections': {
      get: { tags: ['ai'], summary: 'List AI connections', responses: { '200': { description: 'OK' } } },
      post: { tags: ['ai'], summary: 'Create or update AI connection', responses: { '201': { description: 'Created' } } },
    },
    '/api/ai/{kind}': { post: { tags: ['ai'], summary: 'Run AI assistant task', responses: { '200': { description: 'OK' } } } },
    '/api/cleanup': { post: { tags: ['system'], summary: 'Delete old runs and local artifacts', responses: { '200': { description: 'OK' } } } },
    '/api/system/security': { get: { tags: ['system'], summary: 'Security status', responses: { '200': { description: 'OK' } } } },
    '/api/audit': { get: { tags: ['system'], summary: 'Audit log', responses: { '200': { description: 'OK' } } } },
  },
};

export function createApp() {
  const store = createStore();
  const runQueue = createRunQueue();
  const app = Fastify({ logger: true });

  app.register(cookie);
  app.register(cors, {
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });
  app.register(swagger, {
    mode: 'static',
    specification: {
      document: openApiDocument,
    },
  });
  app.register(swaggerUi, { routePrefix: '/docs' });

  app.setErrorHandler((error, _req, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({
        error: 'ValidationError',
        issues: error.issues,
      });
    }
    return reply.send(error);
  });

  async function actorFromRequest(req: FastifyRequest): Promise<AuthActor | null> {
    if (authMode() !== 'local') return actorFromAuthorization(req.headers.authorization);
    const token = tokenFromRequest(req);
    if (!token) return null;
    const session = await store.findSessionByTokenHash(hashToken(token));
    if (!session) return null;
    const user = await store.findUserById(session.userId);
    const membership = user ? await store.findMembership(user.id, session.organizationId) : undefined;
    if (!user || !membership) return null;
    return {
      id: user.id,
      userId: user.id,
      organizationId: session.organizationId,
      email: user.email,
      name: user.name,
      role: membership.role,
      source: 'local',
    };
  }

  function requireOrganization(actor?: AuthActor): string {
    if (!actor) throw new Error('Unauthorized');
    if (actor.source === 'local' && authMode() !== 'off') {
      if (!actor.organizationId) throw new Error('Local actor sem organizacao');
      return actor.organizationId;
    }
    return actor.organizationId ?? 'legacy-local';
  }

  async function getDb(): Promise<Database> {
    return store.read();
  }

  async function getProjectInActorOrg(projectId: string, actor?: AuthActor): Promise<Project | undefined> {
    const organizationId = requireOrganization(actor);
    const project = await store.getProject(projectId);
    return project?.organizationId === organizationId ? project : undefined;
  }

  async function getEnvironmentInActorOrg(environmentId: string, actor?: AuthActor): Promise<Environment | undefined> {
    const db = await getDb();
    const organizationId = requireOrganization(actor);
    const environment = db.environments.find((item) => item.id === environmentId && item.status !== 'inactive');
    if (!environment) return undefined;
    const project = db.projects.find((item) => item.id === environment.projectId && item.status !== 'inactive');
    return project?.organizationId === organizationId ? environment : undefined;
  }

  async function getSuiteInActorOrg(suiteId: string, actor?: AuthActor): Promise<Suite | undefined> {
    const db = await getDb();
    const organizationId = requireOrganization(actor);
    const suite = db.suites.find((item) => item.id === suiteId && item.status !== 'inactive');
    if (!suite) return undefined;
    const project = db.projects.find((item) => item.id === suite.projectId && item.status !== 'inactive');
    return project?.organizationId === organizationId ? suite : undefined;
  }

  async function getRunInActorOrg(runId: string, actor?: AuthActor): Promise<RunRecord | undefined> {
    const db = await getDb();
    const organizationId = requireOrganization(actor);
    const run = db.runs.find((item) => item.id === runId && item.status !== 'deleted');
    if (!run) return undefined;
    const project = db.projects.find((item) => item.id === run.projectId && item.status !== 'inactive');
    return project?.organizationId === organizationId ? run : undefined;
  }

  app.addHook('preHandler', async (req, reply) => {
    if (isPublicRoute(req.url)) return;
    if (authMode() === 'local' && (await getDb()).users.length === 0) {
      return reply.code(401).send({ error: 'SetupRequired', setupRequired: true });
    }
    const actor = await actorFromRequest(req);
    if (!actor) return reply.code(401).send({ error: 'Unauthorized' });
    req.actor = actor;
    const permission = permissionFor(req.method, req.url);
    if (permission && !hasPermission(actor.role, permission)) {
      writeAudit({
        action: `rbac.denied ${req.method} ${req.url.split('?')[0]}`,
        actor: actorLabel(actor),
        actorRole: actor.role,
        status: 'blocked',
        detail: { permission },
      }, store.rootDir);
      return reply.code(403).send({ error: `Papel ${actor.role} nao permite ${permission}` });
    }
  });

  app.addHook('onResponse', async (req, reply) => {
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return;
    if (req.url.startsWith('/docs') || req.url.startsWith('/api/health')) return;
    const actor = req.actor ?? null;
    writeAudit({
      action: `${req.method} ${req.url.split('?')[0]}`,
      actor: actorLabel(actor),
      actorRole: actor?.role,
      status: reply.statusCode >= 400 ? 'error' : 'ok',
      detail: { statusCode: reply.statusCode, payload: redactDeep(req.body) },
    }, store.rootDir);
  });

  app.get('/', {
    schema: {
      tags: ['system'],
      summary: 'Service metadata',
    },
  }, async () => ({
    service: 'testhub-api',
    status: 'ok',
    docs: '/docs',
    openapi: '/openapi.json',
    health: '/api/health',
    dashboard: process.env.TESTHUB_WEB_URL ?? 'http://localhost:3333',
  }));

  app.get('/openapi.json', {
    schema: {
      tags: ['system'],
      summary: 'OpenAPI document',
    },
  }, async () => openApiDocument);

  app.get('/api/health', {
    schema: {
      tags: ['system'],
      summary: 'Health check',
    },
  }, async () => ({ ok: true }));

  app.get('/api/system/security', { schema: { tags: ['system'], summary: 'Security status' } }, async () => systemSecurityStatus());

  app.post('/api/auth/register', { schema: { tags: ['system'], summary: 'Register local account' } }, async (req, reply) => {
    const input = z.object({
      email: z.string().email(),
      name: z.string().min(1).max(200).optional(),
      password: passwordSchema,
      organizationName: z.string().min(1).max(200),
    }).parse(req.body);
    if ((await getDb()).users.length > 0 && process.env.TESTHUB_ALLOW_PUBLIC_SIGNUP !== 'true') {
      return reply.code(403).send({ error: 'Cadastro publico desabilitado' });
    }
    const existing = await store.findUserByEmail(input.email);
    if (existing) return reply.code(409).send({ error: 'Email ja cadastrado' });

    const user = await store.createUser({
      email: input.email,
      name: input.name,
      passwordHash: await hashPassword(input.password),
    });
    const organization = await store.createOrganization({ name: input.organizationName });
    const membership = await store.createMembership({ userId: user.id, organizationId: organization.id, role: 'admin' });
    const token = createSessionToken();
    const expiresAt = sessionExpiresAt();
    await store.createSession({ userId: user.id, organizationId: organization.id, tokenHash: hashToken(token), expiresAt });
    setSessionCookie(reply, token, expiresAt);
    return reply.code(201).send({ user: publicUser(user), organization, membership, token });
  });

  app.post('/api/auth/login', { schema: { tags: ['system'], summary: 'Login local account' } }, async (req, reply) => {
    const input = z.object({
      email: z.string().email(),
      password: passwordSchema,
    }).parse(req.body);
    const user = await store.findUserByEmail(input.email);
    if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
    const memberships = await store.listMembershipsForUser(user.id);
    const membership = memberships[0];
    if (!membership) return reply.code(403).send({ error: 'Usuario sem organizacao' });
    const token = createSessionToken();
    const expiresAt = sessionExpiresAt();
    await store.createSession({ userId: user.id, organizationId: membership.organizationId, tokenHash: hashToken(token), expiresAt });
    setSessionCookie(reply, token, expiresAt);
    return { user: publicUser(user), membership, token };
  });

  app.get('/api/auth/me', { schema: { tags: ['system'], summary: 'Current local account' } }, async (req, reply) => {
    const actor = req.actor;
    if (!actor?.userId || !actor.organizationId) return reply.code(401).send({ error: 'Unauthorized' });
    const user = await store.findUserById(actor.userId);
    const organizations = await store.listOrganizationsForUser(actor.userId);
    const organization = organizations.find((item) => item.id === actor.organizationId);
    const membership = await store.findMembership(actor.userId, actor.organizationId);
    if (!user || !organization || !membership) return reply.code(401).send({ error: 'Unauthorized' });
    return { user: publicUser(user), organization, membership, organizations };
  });

  app.post('/api/auth/logout', { schema: { tags: ['system'], summary: 'Logout local account' } }, async (req, reply) => {
    const token = tokenFromRequest(req);
    if (authMode() === 'local' && token) {
      const session = await store.findSessionByTokenHash(hashToken(token));
      if (session) await store.deleteSession(session.id);
    }
    clearSessionCookie(reply);
    return reply.code(204).send();
  });

  app.post('/api/auth/password-reset/request', { schema: { tags: ['system'], summary: 'Request password reset' } }, async (req, reply) => {
    const input = z.object({ email: z.string().email() }).parse(req.body);
    const user = await store.findUserByEmail(input.email);
    const body: { resetToken?: string } = {};
    if (user) {
      const resetToken = createResetToken();
      await store.createPasswordResetToken({ userId: user.id, tokenHash: hashToken(resetToken), expiresAt: resetExpiresAt() });
      if (process.env.NODE_ENV !== 'production' || process.env.TESTHUB_ALLOW_DISPLAY_RESET === 'true') body.resetToken = resetToken;
    }
    return reply.code(202).send(body);
  });

  app.post('/api/auth/password-reset/confirm', { schema: { tags: ['system'], summary: 'Confirm password reset' } }, async (req, reply) => {
    const input = z.object({
      resetToken: z.string().min(1),
      password: passwordSchema,
    }).parse(req.body);
    const resetToken = await store.findPasswordResetByTokenHash(hashToken(input.resetToken));
    if (!resetToken) return reply.code(400).send({ error: 'Token invalido ou expirado' });
    const usedToken = await store.markPasswordResetUsed(resetToken.id);
    if (!usedToken) return reply.code(400).send({ error: 'Token invalido ou expirado' });
    const user = await store.updateUserPassword(usedToken.userId, await hashPassword(input.password));
    if (!user) return reply.code(400).send({ error: 'Token invalido ou expirado' });
    return reply.code(204).send();
  });

  app.get('/api/audit', { schema: { tags: ['system'], summary: 'Audit log' } }, async (req) => {
    const query = z.object({
      limit: z.coerce.number().int().min(1).max(500).default(50),
      actor: z.string().optional(),
      action: z.string().optional(),
      status: z.enum(['ok', 'blocked', 'error']).optional(),
    }).parse(req.query);
    return readAudit(query, store.rootDir);
  });

  app.get('/api/audit/export', { schema: { tags: ['system'], summary: 'Audit CSV export' } }, async (req, reply) => {
    const query = z.object({
      limit: z.coerce.number().int().min(1).max(5000).default(1000),
      actor: z.string().optional(),
      action: z.string().optional(),
      status: z.enum(['ok', 'blocked', 'error']).optional(),
    }).parse(req.query);
    reply.header('content-type', 'text/csv; charset=utf-8');
    reply.header('content-disposition', 'attachment; filename="testhub-audit.csv"');
    return auditCsv(readAudit(query, store.rootDir));
  });

  app.get('/api/projects', { schema: { tags: ['projects'], summary: 'List projects' } }, async (req) => store.listProjectsForOrganization(requireOrganization(req.actor)));
  app.post('/api/projects', { schema: { tags: ['projects'], summary: 'Create project' } }, async (req, reply) => {
    const input = z.object({
      name: z.string().min(1),
      description: z.string().optional(),
      retentionDays: z.number().int().min(1).optional(),
      cleanupArtifacts: z.boolean().optional(),
    }).parse(req.body);
    const organizationId = requireOrganization(req.actor);
    return reply.code(201).send(await store.createProject({ organizationId, ...input }));
  });
  app.get('/api/projects/:id', { schema: { tags: ['projects'], summary: 'Get project' } }, async (req, reply) => {
    const params = z.object({ id: z.string() }).parse(req.params);
    const project = await getProjectInActorOrg(params.id, req.actor);
    if (!project) return reply.code(404).send({ error: 'Projeto nao encontrado' });
    return project;
  });
  app.put('/api/projects/:id', { schema: { tags: ['projects'], summary: 'Update project' } }, async (req, reply) => {
    const params = z.object({ id: z.string() }).parse(req.params);
    const input = z.object({
      name: z.string().min(1),
      description: z.string().optional(),
      retentionDays: z.number().int().min(1).optional(),
      cleanupArtifacts: z.boolean().optional(),
    }).parse(req.body);
    const existing = await getProjectInActorOrg(params.id, req.actor);
    if (!existing) return reply.code(404).send({ error: 'Projeto nao encontrado' });
    const project = await store.updateProject(params.id, input);
    if (!project) return reply.code(404).send({ error: 'Projeto nao encontrado' });
    return project;
  });
  app.delete('/api/projects/:id', { schema: { tags: ['projects'], summary: 'Soft delete project and child records' } }, async (req, reply) => {
    const params = z.object({ id: z.string() }).parse(req.params);
    const project = await getProjectInActorOrg(params.id, req.actor);
    if (!project) return reply.code(404).send({ error: 'Projeto nao encontrado' });
    const archived = await store.archiveProject(params.id);
    if (!archived) return reply.code(404).send({ error: 'Projeto nao encontrado' });
    return reply.code(204).send();
  });

  app.get('/api/environments', { schema: { tags: ['environments'], summary: 'List environments' } }, async (req, reply) => {
    const query = z.object({ projectId: z.string().optional() }).parse(req.query);
    const organizationId = requireOrganization(req.actor);
    const db = await getDb();
    if (query.projectId && !db.projects.some((project) => project.id === query.projectId && project.organizationId === organizationId && project.status !== 'inactive')) {
      return reply.code(404).send({ error: 'Projeto nao encontrado' });
    }
    const projectIds = new Set(db.projects.filter((project) => project.organizationId === organizationId && project.status !== 'inactive').map((project) => project.id));
    return db.environments
      .filter((environment) => environment.status !== 'inactive' && projectIds.has(environment.projectId) && (!query.projectId || environment.projectId === query.projectId))
      .map((environment) => ({ ...environment, variables: maskVariables(environment.variables) }));
  });
  app.get('/api/environments/:id', { schema: { tags: ['environments'], summary: 'Get environment' } }, async (req, reply) => {
    const params = z.object({ id: z.string() }).parse(req.params);
    const environment = await getEnvironmentInActorOrg(params.id, req.actor);
    if (!environment) return reply.code(404).send({ error: 'Ambiente nao encontrado' });
    return { ...environment, variables: maskVariables(environment.variables) };
  });
  app.post('/api/environments', { schema: { tags: ['environments'], summary: 'Create environment' } }, async (req, reply) => {
    const input = z.object({
      projectId: z.string(),
      name: z.string().min(1),
      baseUrl: z.string().url(),
      variables: z.record(z.string()).optional(),
    }).parse(req.body);
    if (process.env.NODE_ENV === 'production' && isDefaultSecretKey() && input.variables && Object.keys(input.variables).length > 0) {
      return reply.code(400).send({ error: 'TESTHUB_SECRET_KEY default bloqueia gravacao de secrets em producao.' });
    }
    const project = await getProjectInActorOrg(input.projectId, req.actor);
    if (!project) return reply.code(404).send({ error: 'Projeto nao encontrado' });
    return reply.code(201).send(await store.createEnvironment(input));
  });
  app.put('/api/environments/:id', { schema: { tags: ['environments'], summary: 'Update environment' } }, async (req, reply) => {
    const params = z.object({ id: z.string() }).parse(req.params);
    const input = z.object({
      name: z.string().min(1),
      baseUrl: z.string().url(),
      variables: z.record(z.string()).optional(),
    }).parse(req.body);
    if (process.env.NODE_ENV === 'production' && isDefaultSecretKey() && input.variables && Object.keys(input.variables).length > 0) {
      return reply.code(400).send({ error: 'TESTHUB_SECRET_KEY default bloqueia gravacao de secrets em producao.' });
    }
    const existing = await getEnvironmentInActorOrg(params.id, req.actor);
    if (!existing) return reply.code(404).send({ error: 'Ambiente nao encontrado' });
    const environment = await store.updateEnvironment(params.id, input);
    if (!environment) return reply.code(404).send({ error: 'Ambiente nao encontrado' });
    return environment;
  });
  app.delete('/api/environments/:id', { schema: { tags: ['environments'], summary: 'Soft delete environment and child runs' } }, async (req, reply) => {
    const params = z.object({ id: z.string() }).parse(req.params);
    const environment = await getEnvironmentInActorOrg(params.id, req.actor);
    if (!environment) return reply.code(404).send({ error: 'Ambiente nao encontrado' });
    const archived = await store.archiveEnvironment(params.id);
    if (!archived) return reply.code(404).send({ error: 'Ambiente nao encontrado' });
    return reply.code(204).send();
  });

  app.get('/api/suites', { schema: { tags: ['suites'], summary: 'List suites' } }, async (req, reply) => {
    const query = z.object({ projectId: z.string().optional() }).parse(req.query);
    const organizationId = requireOrganization(req.actor);
    const db = await getDb();
    if (query.projectId && !db.projects.some((project) => project.id === query.projectId && project.organizationId === organizationId && project.status !== 'inactive')) {
      return reply.code(404).send({ error: 'Projeto nao encontrado' });
    }
    const projectIds = new Set(db.projects.filter((project) => project.organizationId === organizationId && project.status !== 'inactive').map((project) => project.id));
    return db.suites.filter((suite) => suite.status !== 'inactive' && projectIds.has(suite.projectId) && (!query.projectId || suite.projectId === query.projectId));
  });
  app.get('/api/suites/:id', { schema: { tags: ['suites'], summary: 'Get suite with spec content' } }, async (req, reply) => {
    const params = z.object({ id: z.string() }).parse(req.params);
    const existing = await getSuiteInActorOrg(params.id, req.actor);
    if (!existing) return reply.code(404).send({ error: 'Suite nao encontrada' });
    const suite = await store.getSuiteContent(params.id);
    if (!suite) return reply.code(404).send({ error: 'Suite nao encontrada' });
    return suite;
  });
  app.post('/api/suites', { schema: { tags: ['suites'], summary: 'Create suite' } }, async (req, reply) => {
    const input = z.object({
      projectId: z.string(),
      name: z.string().min(1),
      type: z.enum(['web', 'api']),
      specContent: z.string().min(1),
    }).parse(req.body);
    const project = await getProjectInActorOrg(input.projectId, req.actor);
    if (!project) return reply.code(404).send({ error: 'Projeto nao encontrado' });
    return reply.code(201).send(await store.createSuite(input));
  });
  app.put('/api/suites/:id', { schema: { tags: ['suites'], summary: 'Update suite spec content' } }, async (req, reply) => {
    const params = z.object({ id: z.string() }).parse(req.params);
    const input = z.object({
      name: z.string().min(1),
      type: z.enum(['web', 'api']),
      specContent: z.string().min(1),
    }).parse(req.body);
    const existing = await getSuiteInActorOrg(params.id, req.actor);
    if (!existing) return reply.code(404).send({ error: 'Suite nao encontrada' });
    const suite = await store.updateSuite(params.id, input);
    if (!suite) return reply.code(404).send({ error: 'Suite nao encontrada' });
    return suite;
  });

  app.post('/api/spec/validate', { schema: { tags: ['suites'], summary: 'Validate TestHub YAML spec' } }, async (req, reply) => {
    const input = z.object({ specContent: z.string().min(1) }).parse(req.body);
    try {
      const spec = parseSpecContent(input.specContent);
      return {
        valid: true,
        type: spec.type,
        name: spec.name,
        tests: spec.tests.length,
      };
    } catch (error) {
      if (error instanceof SpecValidationError) {
        return reply.code(400).send({ valid: false, error: error.message });
      }
      throw error;
    }
  });

  app.post('/api/import/openapi', { schema: { tags: ['suites'], summary: 'Import OpenAPI as API suite' } }, async (req, reply) => {
    const input = z.object({
      projectId: z.string(),
      name: z.string().min(1).default('openapi-import'),
      spec: z.unknown(),
      baseUrl: z.string().optional(),
      headers: z.record(z.string()).optional(),
      authTemplate: z.enum(['none', 'bearer', 'apiKey']).optional(),
      selectedOperations: z.array(z.string()).optional(),
      tags: z.array(z.string()).optional(),
      includeBodyExamples: z.boolean().optional(),
    }).parse(req.body);
    try {
      const project = await getProjectInActorOrg(input.projectId, req.actor);
      if (!project) return reply.code(404).send({ error: 'Projeto nao encontrado' });
      const specContent = openApiToSuite(input.spec, input.name, input);
      return reply.code(201).send(await store.createSuite({ projectId: input.projectId, name: input.name, type: 'api', specContent }));
    } catch (error) {
      return reply.code(400).send({ error: messageOf(error) });
    }
  });

  app.get('/api/runs', { schema: { tags: ['runs'], summary: 'List runs' } }, async (req, reply) => {
    const query = z.object({ projectId: z.string().optional() }).parse(req.query);
    const organizationId = requireOrganization(req.actor);
    const db = await getDb();
    if (query.projectId && !db.projects.some((project) => project.id === query.projectId && project.organizationId === organizationId && project.status !== 'inactive')) {
      return reply.code(404).send({ error: 'Projeto nao encontrado' });
    }
    const projectIds = new Set(db.projects.filter((project) => project.organizationId === organizationId && project.status !== 'inactive').map((project) => project.id));
    return db.runs.filter((run) => run.status !== 'deleted' && projectIds.has(run.projectId) && (!query.projectId || run.projectId === query.projectId));
  });
  app.get('/api/runs/:id', { schema: { tags: ['runs'], summary: 'Get run' } }, async (req, reply) => {
    const params = z.object({ id: z.string() }).parse(req.params);
    const run = await getRunInActorOrg(params.id, req.actor);
    if (!run) return reply.code(404).send({ error: 'Run nao encontrada' });
    return run;
  });
  app.post('/api/runs', { schema: { tags: ['runs'], summary: 'Create run' } }, async (req, reply) => {
    const input = z.object({ projectId: z.string(), environmentId: z.string(), suiteId: z.string() }).parse(req.body);
    const project = await getProjectInActorOrg(input.projectId, req.actor);
    if (!project) return reply.code(404).send({ error: 'Projeto nao encontrado' });
    const environment = await getEnvironmentInActorOrg(input.environmentId, req.actor);
    const suite = await getSuiteInActorOrg(input.suiteId, req.actor);
    if (!environment || !suite) return reply.code(400).send({ error: 'Environment ou suite invalido' });
    if (environment.projectId !== input.projectId || suite.projectId !== input.projectId) {
      return reply.code(400).send({ error: 'Environment e suite precisam pertencer ao projeto informado' });
    }
    if (!isHostAllowed(environment.baseUrl)) {
      writeAudit({
        action: 'run.blocked.host_allowlist',
        actor: actorLabel(req.actor ?? null),
        actorRole: req.actor?.role,
        target: environment.baseUrl,
        status: 'blocked',
      }, store.rootDir);
      return reply.code(403).send({ error: `Host fora da allowlist: ${new URL(environment.baseUrl).hostname}` });
    }
    const createdRun = await store.createRun(input);
    if (runQueue) await runQueue.add('run', { runId: createdRun.id });
    else void executeRun(store, createdRun.id);
    return reply.code(202).send(createdRun);
  });
  app.post('/api/runs/:id/cancel', { schema: { tags: ['runs'], summary: 'Cancel run' } }, async (req, reply) => {
    const params = z.object({ id: z.string() }).parse(req.params);
    const run = await getRunInActorOrg(params.id, req.actor);
    if (!run) return reply.code(404).send({ error: 'Run nao encontrada' });
    if (!['queued', 'running'].includes(run.status)) return run;
    if (runQueue) {
      const jobs = await runQueue.getJobs(['waiting', 'delayed', 'prioritized']);
      await Promise.all(jobs.filter((job) => job.data.runId === params.id).map((job) => job.remove()));
    }
    return store.updateRun(params.id, { status: 'canceled', finishedAt: new Date().toISOString() });
  });
  app.get('/api/runs/:id/report', { schema: { tags: ['runs'], summary: 'Get run JSON report' } }, async (req, reply) => {
    const params = z.object({ id: z.string() }).parse(req.params);
    const run = await getRunInActorOrg(params.id, req.actor);
    if (!run?.reportPath || !fs.existsSync(run.reportPath)) return reply.code(404).send({ error: 'Report nao encontrado' });
    return JSON.parse(fs.readFileSync(run.reportPath, 'utf8'));
  });

  app.post('/api/cleanup', { schema: { tags: ['system'], summary: 'Delete old runs and local artifacts' } }, async (req, reply) => {
    const input = z.object({
      projectId: z.string().optional(),
      days: z.number().int().min(1).optional(),
      cleanupArtifacts: z.boolean().optional(),
    }).parse(req.body ?? {});
    if (!input.projectId) return reply.code(400).send({ error: 'projectId obrigatorio para cleanup via API' });
    const project = await getProjectInActorOrg(input.projectId, req.actor);
    if (!project) return reply.code(404).send({ error: 'Projeto nao encontrado' });
    const days = input.days ?? project?.retentionDays ?? retentionDays();
    const cleanupArtifacts = input.cleanupArtifacts ?? project?.cleanupArtifacts ?? false;
    return reply.send(await cleanupOldRuns(store, days, { projectId: input.projectId, cleanupArtifacts }));
  });

  app.get('/artifacts', { schema: { tags: ['artifacts'], summary: 'Stream local artifact' } }, async (req, reply) => {
    const query = z.object({ path: z.string() }).parse(req.query);
    const requested = path.resolve(query.path);
    const allowedRoots = [path.resolve('.testhub-runs'), path.resolve(store.rootDir)];
    if (!allowedRoots.some((root) => requested.startsWith(root))) return reply.code(403).send({ error: 'Artifact fora de area permitida' });
    const matchingRun = (await getDb()).runs.find((run) => [run.reportPath, run.reportHtmlPath].filter(Boolean).map((item) => path.resolve(String(item))).includes(requested));
    if (matchingRun && !(await getRunInActorOrg(matchingRun.id, req.actor))) return reply.code(404).send({ error: 'Artifact nao encontrado' });
    if (!fs.existsSync(requested)) return reply.code(404).send({ error: 'Artifact nao encontrado' });
    const contentType = contentTypeFor(requested);
    if (contentType) reply.type(contentType);
    return reply.send(fs.createReadStream(requested));
  });

  app.get('/api/ai/connections', { schema: { tags: ['ai'], summary: 'List AI connections' } }, async () => (
    await store.read()
  ).aiConnections.map((connection) => ({ ...connection, apiKey: connection.apiKey ? '[REDACTED]' : undefined })));
  app.post('/api/ai/connections', { schema: { tags: ['ai'], summary: 'Create or update AI connection' } }, async (req, reply) => {
    const input = z.object({
      id: z.string().optional(),
      name: z.string().min(1),
      provider: z.enum(['openrouter', 'openai', 'anthropic']),
      apiKey: z.string().optional(),
      model: z.string().min(1),
      baseUrl: z.string().url().optional(),
      enabled: z.boolean().default(true),
    }).parse(req.body);
    if (process.env.NODE_ENV === 'production' && isDefaultSecretKey() && input.apiKey) {
      return reply.code(400).send({ error: 'TESTHUB_SECRET_KEY default bloqueia gravacao de API key em producao.' });
    }
    return reply.code(201).send(await store.upsertAiConnection(input));
  });
  app.post('/api/ai/:kind', { schema: { tags: ['ai'], summary: 'Run AI assistant task' } }, async (req, reply) => {
    const params = z.object({ kind: z.enum(['explain-failure', 'suggest-test-fix', 'suggest-test-cases']) }).parse(req.params);
    const body = z.object({ connectionId: z.string().optional(), context: z.unknown() }).parse(req.body);
    const connection = await store.getAiConnection(body.connectionId);
    if (!connection) return reply.code(400).send({ error: 'Nenhuma AI connection habilitada' });
    const context = redactDeep(body.context);
    const prompt = params.kind === 'explain-failure'
      ? buildFailurePrompt(context)
      : params.kind === 'suggest-test-fix'
        ? buildFixPrompt(context)
        : buildTestSuggestionPrompt(context);
    const result = await callAi(connection, prompt);
    writeAudit({
      action: `ai.${params.kind}`,
      actor: actorLabel(req.actor ?? null),
      actorRole: req.actor?.role,
      status: 'ok',
      detail: { provider: result.provider, model: result.model, prompt: redactDeep(prompt), output: redactDeep(result.output) },
    }, store.rootDir);
    return result;
  });

  app.post('/api/ai/apply-test-fix', { schema: { tags: ['ai'], summary: 'Apply approved AI test fix' } }, async (req, reply) => {
    const input = z.object({
      suiteId: z.string(),
      name: z.string().min(1),
      type: z.enum(['web', 'api']),
      specContent: z.string().min(1),
      approved: z.boolean(),
      reason: z.string().optional(),
    }).parse(req.body);
    if (!input.approved) return reply.code(400).send({ error: 'Aprovacao humana obrigatoria.' });
    const existing = await getSuiteInActorOrg(input.suiteId, req.actor);
    if (!existing) return reply.code(404).send({ error: 'Suite nao encontrada' });
    const suite = await store.updateSuite(input.suiteId, { name: input.name, type: input.type, specContent: input.specContent });
    if (!suite) return reply.code(404).send({ error: 'Suite nao encontrada' });
    writeAudit({
      action: 'ai.apply-test-fix',
      actor: actorLabel(req.actor ?? null),
      actorRole: req.actor?.role,
      target: input.suiteId,
      status: 'ok',
      detail: { reason: input.reason },
    }, store.rootDir);
    return suite;
  });

  return app;
}

declare module 'fastify' {
  interface FastifyRequest {
    actor?: AuthActor;
  }
}

function isPublicRoute(url: string): boolean {
  const path = url.split('?')[0];
  return path === '/'
    || path === '/api/health'
    || path === '/docs'
    || path.startsWith('/docs/')
    || path === '/openapi.json'
    || path === '/api/system/security'
    || path === '/api/auth/register'
    || path === '/api/auth/login'
    || path === '/api/auth/logout'
    || path === '/api/auth/password-reset/request'
    || path === '/api/auth/password-reset/confirm';
}

function tokenFromRequest(req: FastifyRequest): string | undefined {
  const authorization = req.headers.authorization;
  const bearer = authorization?.startsWith('Bearer ') ? authorization.slice('Bearer '.length).trim() : undefined;
  return bearer || req.cookies?.[sessionCookieName];
}

function publicUser(user: User): Omit<User, 'passwordHash'> {
  const { passwordHash: _passwordHash, ...safeUser } = user;
  return safeUser;
}

function setSessionCookie(reply: FastifyReply, token: string, expiresAt: string): void {
  reply.setCookie(sessionCookieName, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    expires: new Date(expiresAt),
  });
}

function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(sessionCookieName, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });
}

function permissionFor(method: string, url: string): Permission | null {
  if (method === 'GET') return url.startsWith('/api/audit') ? 'audit:read' : null;
  if (url.startsWith('/api/projects')) return 'project:write';
  if (url.startsWith('/api/environments')) return 'environment:write';
  if (url.startsWith('/api/suites') || url.startsWith('/api/import/openapi') || url.startsWith('/api/spec/validate')) return 'suite:write';
  if (url.startsWith('/api/runs')) return 'run:write';
  if (url.startsWith('/api/ai/connections') || url.startsWith('/api/cleanup')) return 'settings:write';
  if (url.startsWith('/api/ai/')) return 'ai:write';
  return null;
}

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function contentTypeFor(filePath: string): string | undefined {
  if (filePath.endsWith('.webm')) return 'video/webm';
  if (filePath.endsWith('.json')) return 'application/json; charset=utf-8';
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.xml')) return 'application/xml; charset=utf-8';
  if (filePath.endsWith('.png')) return 'image/png';
  if (filePath.endsWith('.log')) return 'text/plain; charset=utf-8';
  return undefined;
}

const isCliEntry = process.argv.some((arg) => arg.endsWith('apps/api/src/server.ts') || arg.endsWith('apps/api/src/server.js'));

if (isCliEntry) {
  const app = createApp();
  const port = Number(process.env.PORT ?? 4321);
  await app.listen({ port, host: '0.0.0.0' });
  console.log(`TestHub API: http://localhost:${port}`);
}
