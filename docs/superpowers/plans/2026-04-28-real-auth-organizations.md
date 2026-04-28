# Real Auth And Organizations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build real local authentication for TestHub with login, user creation, simple no-email password reset, organization/team membership, and organization-scoped sharing for projects, environments, suites, runs, AI settings, and audit.

**Architecture:** Keep the current Fastify API, Next.js UI, and Store abstraction. Add local users, organizations, memberships, sessions, and reset tokens to `packages/db`; make the API resolve an authenticated actor from an HttpOnly cookie or bearer session token; scope all project-owned resources through the actor's selected organization. Preserve `TESTHUB_AUTH_MODE=token|oidc|off` compatibility, but make `local` the real web mode.

**Tech Stack:** TypeScript, Node `crypto.scrypt`, Fastify, `@fastify/cookie`, Zod, Next.js client components, Drizzle/Postgres, JSON store, Vitest, Playwright.

---

## Current State

- API auth exists in `packages/db/src/security.ts`, but defaults to `off` unless `TESTHUB_TOKEN` or OIDC env vars are set.
- RBAC is role-only and global: `admin|editor|viewer`, with no user, no session, and no organization boundary.
- UI stores a bearer/OIDC token manually in `localStorage` via `ApiTokenControl` in `apps/web/components/dashboard/v2-console.tsx`.
- `Project`, `Environment`, `Suite`, and `RunRecord` have no `organizationId`; all users would see all data.
- `PgStore` and `JsonStore` both exist, so every schema/store change must land in both implementations.
- PRD Phase 5 says OIDC/Auth.js, simple RBAC, encrypted secrets, redaction, audit, and retention. Secrets, redaction, audit, and retention are partial; user/session/org auth is missing.

## Scope Decision

This plan implements the security/platform slice, not every remaining PRD item across runner, MCP, AI, and storage. It covers the PRD security gaps and matures existing project/environment/suite/run sharing so teams can use the product with real accounts.

## File Structure

- Modify `package.json`: add `@fastify/cookie`.
- Modify `packages/db/src/store.ts`: add auth/org types and Store methods; add `organizationId` to project-owned entities.
- Modify `packages/db/src/schema.ts`: add Postgres tables and org-scoping columns.
- Modify `packages/db/src/migrate.ts`: create new tables and idempotent columns.
- Modify `packages/db/src/pg-store.ts`: implement Store auth/org methods and org-scoped read helpers.
- Modify `packages/db/src/security.ts`: keep env/token/OIDC helpers, extend actor shape with `organizationId`, and delegate local sessions to auth helpers.
- Create `packages/db/src/auth.ts`: password hashing, session token hashing, reset token hashing, auth service helpers.
- Modify `apps/api/src/server.ts`: add cookie support, auth routes, actor resolution, org-scoped authorization, resource access checks, OpenAPI paths.
- Modify `apps/mcp/src/mcp.ts`: send `TESTHUB_TOKEN` as before; document that local session tokens can also be supplied.
- Create `apps/web/lib/api.ts`: shared browser fetch wrapper with `credentials: 'include'`, auth redirect, and bearer fallback.
- Create `apps/web/components/auth/auth-shell.tsx`: reusable auth form layout.
- Create `apps/web/app/login/page.tsx`: login page.
- Create `apps/web/app/register/page.tsx`: first/user/org registration page.
- Create `apps/web/app/forgot-password/page.tsx`: reset request page.
- Create `apps/web/app/reset-password/page.tsx`: reset confirmation page.
- Modify `apps/web/components/dashboard/v2-console.tsx`: use shared API wrapper, add auth guard, user/org switcher, logout, and org member management in settings.
- Modify `README.md`: document auth modes, bootstrap, reset policy, org sharing, and local development.
- Create `tests/auth-store.test.ts`: unit tests for password/session/reset primitives and JSON store auth methods.
- Create `tests/server-auth.test.ts`: API tests for register/login/me/logout/reset/RBAC/org isolation.
- Modify `tests/server-e2e.test.ts`: authenticate test requests.
- Modify `tests/mcp.test.ts`: keep token mode coverage.
- Modify `tests/e2e/v2.spec.ts`: add login/bootstrap setup and assert protected routes.

## Data Model

Use `Organization` as the product primitive and label it "Time" in UI where that is more natural. Do not add a separate `teams` table yet; it creates hierarchy without a current workflow.

```ts
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
```

Project-owned records become org-owned through project:

```ts
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
```

AI connections and audit entries should also be organization-scoped in this plan because settings and audit are shared by a team, not globally.

## Auth Rules

- `TESTHUB_AUTH_MODE=local` enables real local auth.
- Default mode:
  - if `TESTHUB_AUTH_MODE` is set, obey it;
  - else if OIDC env is configured, use `oidc`;
  - else if `TESTHUB_TOKEN` is set, use `token`;
  - else use `local`.
- `TESTHUB_AUTH_MODE=off` stays available for local demos/tests only and must be rejected in `NODE_ENV=production`.
- Public routes: `/`, `/api/health`, `/docs`, `/openapi.json`, `/api/system/security`, `/api/auth/register`, `/api/auth/login`, `/api/auth/password-reset/request`, `/api/auth/password-reset/confirm`.
- If local auth has zero users, protected API routes return `401 { "error": "SetupRequired", "setupRequired": true }`.
- Login creates a session, sets `testhub_session` HttpOnly cookie, and returns session metadata plus token for CLI/MCP/dev fallback.
- Logout deletes the current session and clears the cookie.
- Simple no-email reset:
  - request returns a reset code only when `NODE_ENV !== 'production'` or `TESTHUB_ALLOW_DISPLAY_RESET=true`;
  - production without that flag returns `202` and logs an audit event, but does not reveal the code;
  - reset code expires in 15 minutes and is single-use.

## Task 1: Add Auth Types, JSON Store Methods, And Tests

**Files:**
- Modify: `packages/db/src/store.ts`
- Create: `tests/auth-store.test.ts`

- [x] **Step 1: Write failing JSON store auth tests**

Create `tests/auth-store.test.ts`:

```ts
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { JsonStore } from '../packages/db/src/store.js';

describe('JsonStore auth and organization methods', () => {
  it('creates a user, organization, membership, session and reset token', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'testhub-auth-store-'));
    const store = new JsonStore(root);

    const user = store.createUser({ email: 'qa@example.com', name: 'QA', passwordHash: 'hash' });
    const organization = store.createOrganization({ name: 'QA Team' });
    const membership = store.createMembership({ userId: user.id, organizationId: organization.id, role: 'admin' });
    const session = store.createSession({ userId: user.id, organizationId: organization.id, tokenHash: 'token-hash', expiresAt: '2099-01-01T00:00:00.000Z' });
    const reset = store.createPasswordResetToken({ userId: user.id, tokenHash: 'reset-hash', expiresAt: '2099-01-01T00:00:00.000Z' });

    expect(store.findUserByEmail('QA@EXAMPLE.COM')).toMatchObject({ id: user.id, email: 'qa@example.com' });
    expect(store.listMembershipsForUser(user.id)).toEqual([expect.objectContaining({ id: membership.id, role: 'admin' })]);
    expect(store.findSessionByTokenHash('token-hash')).toMatchObject({ id: session.id, organizationId: organization.id });
    expect(store.findPasswordResetByTokenHash('reset-hash')).toMatchObject({ id: reset.id, usedAt: undefined });

    const used = store.markPasswordResetUsed(reset.id);
    expect(used?.usedAt).toBeTruthy();
  });

  it('scopes projects to an organization', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'testhub-auth-projects-'));
    const store = new JsonStore(root);
    const orgA = store.createOrganization({ name: 'Team A' });
    const orgB = store.createOrganization({ name: 'Team B' });

    const projectA = store.createProject({ organizationId: orgA.id, name: 'CRM' });
    store.createProject({ organizationId: orgB.id, name: 'ERP' });

    expect(store.listProjectsForOrganization(orgA.id)).toEqual([expect.objectContaining({ id: projectA.id, organizationId: orgA.id })]);
    expect(store.listProjectsForOrganization(orgB.id)).toHaveLength(1);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- tests/auth-store.test.ts
```

Expected: FAIL with TypeScript errors like `Property 'createUser' does not exist on type 'JsonStore'`.

- [x] **Step 3: Extend store types and empty DB**

In `packages/db/src/store.ts`, add the auth interfaces from the "Data Model" section, extend `Database`, and extend `Store` with these exact methods:

```ts
  users: User[];
  organizations: Organization[];
  memberships: OrganizationMembership[];
  sessions: AuthSession[];
  passwordResetTokens: PasswordResetToken[];
```

```ts
  createUser(input: { email: string; name?: string; passwordHash: string }): Promise<User> | User;
  findUserByEmail(email: string): Promise<User | undefined> | User | undefined;
  findUserById(id: string): Promise<User | undefined> | User | undefined;
  updateUserPassword(userId: string, passwordHash: string): Promise<User | undefined> | User | undefined;
  createOrganization(input: { name: string; slug?: string }): Promise<Organization> | Organization;
  listOrganizationsForUser(userId: string): Promise<Organization[]> | Organization[];
  createMembership(input: { userId: string; organizationId: string; role: MembershipRole }): Promise<OrganizationMembership> | OrganizationMembership;
  listMembershipsForUser(userId: string): Promise<OrganizationMembership[]> | OrganizationMembership[];
  findMembership(userId: string, organizationId: string): Promise<OrganizationMembership | undefined> | OrganizationMembership | undefined;
  listMembershipsForOrganization(organizationId: string): Promise<OrganizationMembership[]> | OrganizationMembership[];
  createSession(input: { userId: string; organizationId: string; tokenHash: string; expiresAt: string }): Promise<AuthSession> | AuthSession;
  findSessionByTokenHash(tokenHash: string): Promise<AuthSession | undefined> | AuthSession | undefined;
  deleteSession(id: string): Promise<boolean> | boolean;
  createPasswordResetToken(input: { userId: string; tokenHash: string; expiresAt: string }): Promise<PasswordResetToken> | PasswordResetToken;
  findPasswordResetByTokenHash(tokenHash: string): Promise<PasswordResetToken | undefined> | PasswordResetToken | undefined;
  markPasswordResetUsed(id: string): Promise<PasswordResetToken | undefined> | PasswordResetToken | undefined;
  listProjectsForOrganization(organizationId: string): Promise<Project[]> | Project[];
```

Also change `createProject` input to require `organizationId`:

```ts
  createProject(input: { organizationId: string; name: string; description?: string; retentionDays?: number; cleanupArtifacts?: boolean }): Promise<Project> | Project;
```

Update `emptyDb` to include empty arrays for the new collections.

- [x] **Step 4: Implement JsonStore methods**

In `JsonStore`, implement:

```ts
  createUser(input: { email: string; name?: string; passwordHash: string }): User {
    const db = this.read();
    const now = nowIso();
    const user: User = {
      id: randomUUID(),
      email: normalizeEmail(input.email),
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

  findUserByEmail(email: string): User | undefined {
    const normalized = normalizeEmail(email);
    return this.read().users.find((user) => user.email === normalized && user.status === 'active');
  }

  listProjectsForOrganization(organizationId: string): Project[] {
    return this.read().projects.filter((project) => project.organizationId === organizationId && project.status !== 'inactive');
  }
```

Implement the rest as direct array operations matching the test names. Add helpers:

```ts
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function slugify(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'team';
}
```

When reading older JSON DB files, defensively backfill missing arrays in `read()`:

```ts
  read(): Database {
    const db = JSON.parse(fs.readFileSync(this.dbPath, 'utf8')) as Partial<Database>;
    return { ...emptyDb, ...db };
  }
```

- [x] **Step 5: Run test to verify it passes**

Run:

```bash
npm test -- tests/auth-store.test.ts
```

Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add packages/db/src/store.ts tests/auth-store.test.ts
git commit -m "feat: add auth store primitives"
```

## Task 2: Add Postgres Schema And PgStore Auth Methods

**Files:**
- Modify: `packages/db/src/schema.ts`
- Modify: `packages/db/src/migrate.ts`
- Modify: `packages/db/src/pg-store.ts`
- Modify: `apps/api/src/server.ts`
- Modify: `tests/cleanup.test.ts`
- Create: `tests/pg-store-auth.test.ts`
- Test: `tests/auth-store.test.ts`

- [x] **Step 1: Write schema compile target**

No new runtime test yet; `npm run typecheck` will fail until schema/store methods exist.

Run:

```bash
npm run typecheck
```

Expected: FAIL because `PgStore` does not implement the extended `Store` interface.

- [x] **Step 2: Add Drizzle tables and columns**

In `packages/db/src/schema.ts`, add:

```ts
export const users = pgTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull(),
  name: text('name'),
  passwordHash: text('password_hash').notNull(),
  status: text('status').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
});

export const organizations = pgTable('organizations', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  status: text('status').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
});

export const memberships = pgTable('organization_memberships', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id').notNull(),
  userId: text('user_id').notNull(),
  role: text('role').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
});

export const sessions = pgTable('auth_sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  organizationId: text('organization_id').notNull(),
  tokenHash: text('token_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
});

export const passwordResetTokens = pgTable('password_reset_tokens', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  tokenHash: text('token_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
});
```

Add `organizationId: text('organization_id').notNull()` to `projects` and to `aiConnections` later in this task if org-scoping settings now. If adding `organizationId` to `aiConnections`, update `AiConnection` type and all callers in Task 7.

- [x] **Step 3: Add idempotent migrations**

In `packages/db/src/migrate.ts`, add statements:

```ts
`create table if not exists users (id text primary key, email text not null, name text, password_hash text not null, status text not null, created_at timestamptz not null, updated_at timestamptz not null)`,
`create unique index if not exists users_email_unique on users (lower(email))`,
`create table if not exists organizations (id text primary key, name text not null, slug text not null, status text not null, created_at timestamptz not null, updated_at timestamptz not null)`,
`create unique index if not exists organizations_slug_unique on organizations (slug)`,
`create table if not exists organization_memberships (id text primary key, organization_id text not null, user_id text not null, role text not null, created_at timestamptz not null, updated_at timestamptz not null)`,
`create unique index if not exists organization_memberships_unique on organization_memberships (organization_id, user_id)`,
`create table if not exists auth_sessions (id text primary key, user_id text not null, organization_id text not null, token_hash text not null, expires_at timestamptz not null, created_at timestamptz not null, last_used_at timestamptz)`,
`create unique index if not exists auth_sessions_token_hash_unique on auth_sessions (token_hash)`,
`create table if not exists password_reset_tokens (id text primary key, user_id text not null, token_hash text not null, expires_at timestamptz not null, used_at timestamptz, created_at timestamptz not null)`,
`create unique index if not exists password_reset_tokens_hash_unique on password_reset_tokens (token_hash)`,
```

Add:

```ts
await pool.query(`alter table projects add column if not exists organization_id text`);
await pool.query(`update projects set organization_id = 'legacy-local' where organization_id is null`);
await pool.query(`alter table projects alter column organization_id set not null`);
```

- [x] **Step 4: Implement PgStore methods**

In `packages/db/src/pg-store.ts`, import new tables and implement the same methods as `JsonStore`. Add row mappers:

```ts
function rowToUser(row: { id: string; email: string; name?: string | null; passwordHash?: string; password_hash?: string; status: string; createdAt: Date | string; updatedAt: Date | string }): User {
  return {
    id: row.id,
    email: row.email,
    name: row.name ?? undefined,
    passwordHash: row.passwordHash ?? row.password_hash!,
    status: row.status as User['status'],
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}
```

Use `eq`, `and`, and `ne` like existing project methods. `findUserByEmail` should compare a lowercased input against stored lowercased email. `findSessionByTokenHash` must reject expired sessions:

```ts
const [session] = await this.db.select().from(sessions).where(eq(sessions.tokenHash, tokenHash));
if (!session || session.expiresAt.getTime() <= Date.now()) return undefined;
```

- [x] **Step 5: Typecheck**

Run:

```bash
npm run typecheck
```

Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add packages/db/src/schema.ts packages/db/src/migrate.ts packages/db/src/pg-store.ts
git commit -m "feat: add postgres auth schema"
```

## Task 3: Add Password, Session, And Reset Helpers

**Files:**
- Create: `packages/db/src/auth.ts`
- Create/modify: `tests/auth-store.test.ts`

- [x] **Step 1: Write failing helper tests**

Append to `tests/auth-store.test.ts`:

```ts
import { createSessionToken, hashPassword, hashToken, verifyPassword } from '../packages/db/src/auth.js';

describe('auth helpers', () => {
  it('hashes and verifies passwords', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(hash).not.toContain('correct horse');
    await expect(verifyPassword('correct horse battery staple', hash)).resolves.toBe(true);
    await expect(verifyPassword('wrong', hash)).resolves.toBe(false);
  });

  it('hashes opaque tokens before persistence', () => {
    const token = createSessionToken();
    expect(token).toHaveLength(48);
    expect(hashToken(token)).toMatch(/^[a-f0-9]{64}$/);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- tests/auth-store.test.ts
```

Expected: FAIL with `Cannot find module '../packages/db/src/auth.js'`.

- [x] **Step 3: Create auth helper module**

Create `packages/db/src/auth.ts`:

```ts
import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
const keyLength = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const derived = await scrypt(password, salt, keyLength) as Buffer;
  return `scrypt:${salt}:${derived.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, salt, expectedHex] = stored.split(':');
  if (scheme !== 'scrypt' || !salt || !expectedHex) return false;
  const actual = await scrypt(password, salt, keyLength) as Buffer;
  const expected = Buffer.from(expectedHex, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function createSessionToken(): string {
  return randomBytes(24).toString('hex');
}

export function createResetToken(): string {
  return randomBytes(20).toString('hex');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function sessionExpiresAt(now = new Date()): string {
  return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
}

export function resetExpiresAt(now = new Date()): string {
  return new Date(now.getTime() + 15 * 60 * 1000).toISOString();
}
```

- [x] **Step 4: Run tests**

Run:

```bash
npm test -- tests/auth-store.test.ts
```

Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add packages/db/src/auth.ts tests/auth-store.test.ts
git commit -m "feat: add local auth crypto helpers"
```

## Task 4: Add API Auth Routes

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `apps/api/src/server.ts`
- Modify: `packages/db/src/security.ts`
- Modify: `packages/db/src/store.ts`
- Modify: `packages/db/src/pg-store.ts`
- Modify: `tests/auth-store.test.ts`
- Modify: `tests/pg-store-auth.test.ts`
- Modify: `tests/server-e2e.test.ts`
- Create: `tests/server-auth.test.ts`

- [x] **Step 1: Install cookie dependency**

Run:

```bash
npm install @fastify/cookie
```

Expected: `package.json` and `package-lock.json` updated.

- [x] **Step 2: Write failing API auth tests**

Create `tests/server-auth.test.ts`:

```ts
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../apps/api/src/server.js';

const previousEnv = { ...process.env };

beforeEach(() => {
  process.env = { ...previousEnv };
  process.env.TESTHUB_AUTH_MODE = 'local';
  process.env.TESTHUB_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'testhub-auth-api-'));
  delete process.env.DATABASE_URL;
  delete process.env.REDIS_URL;
});

afterEach(() => {
  process.env = { ...previousEnv };
});

describe('local auth api', () => {
  it('registers, logs in, returns me, and logs out', async () => {
    const app = createApp();
    await app.ready();
    try {
      const register = await app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: { email: 'qa@example.com', name: 'QA', password: 'password-1234', organizationName: 'QA Team' },
      });
      expect(register.statusCode).toBe(201);
      expect(register.json()).toMatchObject({ user: { email: 'qa@example.com' }, organization: { name: 'QA Team' }, membership: { role: 'admin' } });
      expect(register.cookies.some((cookie) => cookie.name === 'testhub_session')).toBe(true);

      const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'qa@example.com', password: 'password-1234' } });
      expect(login.statusCode).toBe(200);
      const token = login.json<{ token: string }>().token;

      const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { authorization: `Bearer ${token}` } });
      expect(me.statusCode).toBe(200);
      expect(me.json()).toMatchObject({ user: { email: 'qa@example.com' }, organizations: [expect.objectContaining({ name: 'QA Team' })] });

      const logout = await app.inject({ method: 'POST', url: '/api/auth/logout', headers: { authorization: `Bearer ${token}` } });
      expect(logout.statusCode).toBe(204);

      const afterLogout = await app.inject({ method: 'GET', url: '/api/projects', headers: { authorization: `Bearer ${token}` } });
      expect(afterLogout.statusCode).toBe(401);
    } finally {
      await app.close();
    }
  });

  it('supports no-email reset when display reset is allowed', async () => {
    process.env.TESTHUB_ALLOW_DISPLAY_RESET = 'true';
    const app = createApp();
    await app.ready();
    try {
      await app.inject({ method: 'POST', url: '/api/auth/register', payload: { email: 'reset@example.com', password: 'old-password-1234', organizationName: 'Reset Team' } });
      const request = await app.inject({ method: 'POST', url: '/api/auth/password-reset/request', payload: { email: 'reset@example.com' } });
      expect(request.statusCode).toBe(202);
      const resetToken = request.json<{ resetToken: string }>().resetToken;
      expect(resetToken).toBeTruthy();

      const confirm = await app.inject({ method: 'POST', url: '/api/auth/password-reset/confirm', payload: { resetToken, password: 'new-password-1234' } });
      expect(confirm.statusCode).toBe(204);

      const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'reset@example.com', password: 'new-password-1234' } });
      expect(login.statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });
});
```

- [x] **Step 3: Run test to verify it fails**

Run:

```bash
npm test -- tests/server-auth.test.ts
```

Expected: FAIL because `/api/auth/register` does not exist.

- [x] **Step 4: Register cookie and add auth route schemas**

In `apps/api/src/server.ts`, add:

```ts
import cookie from '@fastify/cookie';
import { createResetToken, createSessionToken, hashPassword, hashToken, resetExpiresAt, sessionExpiresAt, verifyPassword } from '../../../packages/db/src/auth.js';
```

Inside `createApp()` before hooks:

```ts
app.register(cookie);
```

Add constants:

```ts
const sessionCookieName = 'testhub_session';
const passwordSchema = z.string().min(8).max(200);
```

- [x] **Step 5: Implement auth endpoints**

Add these routes before the `preHandler` hook or make them public in the hook:

```ts
app.post('/api/auth/register', async (req, reply) => {
  const input = z.object({
    email: z.string().email(),
    name: z.string().min(1).optional(),
    password: passwordSchema,
    organizationName: z.string().min(1),
  }).parse(req.body);

  if (await store.findUserByEmail(input.email)) return reply.code(409).send({ error: 'Email ja cadastrado' });

  const user = await store.createUser({ email: input.email, name: input.name, passwordHash: await hashPassword(input.password) });
  const organization = await store.createOrganization({ name: input.organizationName });
  const membership = await store.createMembership({ userId: user.id, organizationId: organization.id, role: 'admin' });
  const token = createSessionToken();
  const session = await store.createSession({ userId: user.id, organizationId: organization.id, tokenHash: hashToken(token), expiresAt: sessionExpiresAt() });

  setSessionCookie(reply, token, session.expiresAt);
  return reply.code(201).send({ user: publicUser(user), organization, membership, token });
});

app.post('/api/auth/login', async (req, reply) => {
  const input = z.object({ email: z.string().email(), password: z.string() }).parse(req.body);
  const user = await store.findUserByEmail(input.email);
  if (!user || !(await verifyPassword(input.password, user.passwordHash))) return reply.code(401).send({ error: 'Email ou senha invalidos' });
  const memberships = await store.listMembershipsForUser(user.id);
  const membership = memberships[0];
  if (!membership) return reply.code(403).send({ error: 'Usuario sem organizacao' });
  const token = createSessionToken();
  const session = await store.createSession({ userId: user.id, organizationId: membership.organizationId, tokenHash: hashToken(token), expiresAt: sessionExpiresAt() });
  setSessionCookie(reply, token, session.expiresAt);
  return { user: publicUser(user), membership, token };
});
```

Implement `/api/auth/me`, `/api/auth/logout`, `/api/auth/password-reset/request`, and `/api/auth/password-reset/confirm` with the same helpers. `publicUser` must omit `passwordHash`.

Add helper:

```ts
function setSessionCookie(reply: FastifyReply, token: string, expiresAt: string): void {
  reply.setCookie(sessionCookieName, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: new Date(expiresAt),
  });
}
```

- [x] **Step 6: Resolve local actor from cookie or bearer token**

In `packages/db/src/security.ts`, extend:

```ts
export interface AuthActor {
  id: string;
  userId?: string;
  organizationId?: string;
  name?: string;
  email?: string;
  role: RbacRole;
  source: 'local' | 'token' | 'oidc';
  claims?: Record<string, unknown>;
}
```

In `apps/api/src/server.ts`, add local resolver:

```ts
async function actorFromRequest(req: FastifyRequest): Promise<AuthActor | null> {
  const bearer = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice('Bearer '.length).trim() : undefined;
  const token = bearer ?? req.cookies?.[sessionCookieName];
  if (authMode() === 'local') {
    if (!token) return null;
    const session = await store.findSessionByTokenHash(hashToken(token));
    if (!session) return null;
    const user = await store.findUserById(session.userId);
    const membership = user ? await store.findMembership(user.id, session.organizationId) : undefined;
    if (!user || !membership) return null;
    return { id: user.id, userId: user.id, organizationId: session.organizationId, email: user.email, name: user.name, role: membership.role, source: 'local' };
  }
  return actorFromAuthorization(req.headers.authorization);
}
```

Use `actorFromRequest(req)` in the preHandler.

- [x] **Step 7: Run auth tests**

Run:

```bash
npm test -- tests/server-auth.test.ts
```

Expected: PASS.

- [x] **Step 8: Commit**

```bash
git add package.json package-lock.json apps/api/src/server.ts packages/db/src/security.ts tests/server-auth.test.ts
git commit -m "feat: add local auth api"
```

## Task 5: Enforce Organization Scope In API Resources

**Files:**
- Modify: `apps/api/src/server.ts`
- Modify: `tests/server-auth.test.ts`
- Modify: `tests/server-e2e.test.ts`

- [x] **Step 1: Add failing org isolation test**

Append to `tests/server-auth.test.ts`:

```ts
it('prevents users from seeing another organization project', async () => {
  const app = createApp();
  await app.ready();
  try {
    const a = await registerAndToken(app, 'a@example.com', 'Team A');
    const b = await registerAndToken(app, 'b@example.com', 'Team B');

    const projectA = await app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: { authorization: `Bearer ${a.token}` },
      payload: { name: 'Secret CRM' },
    });
    expect(projectA.statusCode).toBe(201);

    const listB = await app.inject({ method: 'GET', url: '/api/projects', headers: { authorization: `Bearer ${b.token}` } });
    expect(listB.statusCode).toBe(200);
    expect(listB.json()).toEqual([]);

    const getB = await app.inject({ method: 'GET', url: `/api/projects/${projectA.json<{ id: string }>().id}`, headers: { authorization: `Bearer ${b.token}` } });
    expect(getB.statusCode).toBe(404);
  } finally {
    await app.close();
  }
});

async function registerAndToken(app: ReturnType<typeof createApp>, email: string, organizationName: string) {
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { email, password: 'password-1234', organizationName },
  });
  return response.json<{ token: string; organization: { id: string } }>();
}
```

- [x] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- tests/server-auth.test.ts
```

Expected: FAIL because project list is global or project create does not set `organizationId`.

- [x] **Step 3: Add API resource guards**

In `apps/api/src/server.ts`, create helpers:

```ts
function requireOrganization(actor?: AuthActor): string {
  if (!actor?.organizationId) throw new Error('Organizacao obrigatoria');
  return actor.organizationId;
}

async function getProjectInActorOrg(projectId: string, actor?: AuthActor) {
  const project = await store.getProject(projectId);
  if (!project || project.organizationId !== requireOrganization(actor)) return undefined;
  return project;
}
```

Update project routes:

```ts
app.get('/api/projects', async (req) => store.listProjectsForOrganization(requireOrganization(req.actor)));
app.post('/api/projects', async (req, reply) => {
  const input = z.object({ name: z.string().min(1), description: z.string().optional(), retentionDays: z.number().int().min(1).optional(), cleanupArtifacts: z.boolean().optional() }).parse(req.body);
  return reply.code(201).send(await store.createProject({ organizationId: requireOrganization(req.actor), ...input }));
});
app.get('/api/projects/:id', async (req, reply) => {
  const params = z.object({ id: z.string() }).parse(req.params);
  const project = await getProjectInActorOrg(params.id, req.actor);
  if (!project) return reply.code(404).send({ error: 'Projeto nao encontrado' });
  return project;
});
```

For environments, suites, runs, cleanup, AI, report, and artifacts, first resolve the parent project/run and verify `project.organizationId === req.actor.organizationId`. For create/update, reject mismatched child IDs:

```ts
if (environment.projectId !== input.projectId || suite.projectId !== input.projectId) {
  return reply.code(400).send({ error: 'Environment e suite precisam pertencer ao projeto informado' });
}
```

- [x] **Step 4: Update existing server e2e tests to authenticate**

In `tests/server-e2e.test.ts`, add:

```ts
let token: string;

beforeAll(async () => {
  process.env.TESTHUB_AUTH_MODE = 'local';
  await app.ready();
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { email: 'e2e@example.com', password: 'password-1234', organizationName: 'E2E Team' },
  });
  token = response.json<{ token: string }>().token;
});

function auth() {
  return { authorization: `Bearer ${token}` };
}
```

Add `headers: auth()` to every protected `app.inject` call.

- [x] **Step 5: Run server tests**

Run:

```bash
npm test -- tests/server-auth.test.ts tests/server-e2e.test.ts
```

Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add apps/api/src/server.ts tests/server-auth.test.ts tests/server-e2e.test.ts
git commit -m "feat: scope api resources by organization"
```

## Task 6: Add Member Management

**Files:**
- Modify: `apps/api/src/server.ts`
- Modify: `tests/server-auth.test.ts`

- [x] **Step 1: Add failing member tests**

Append:

```ts
it('lets an org admin create a member with a temporary password', async () => {
  const app = createApp();
  await app.ready();
  try {
    const admin = await registerAndToken(app, 'admin@example.com', 'Platform');
    const created = await app.inject({
      method: 'POST',
      url: '/api/organizations/current/members',
      headers: { authorization: `Bearer ${admin.token}` },
      payload: { email: 'dev@example.com', name: 'Dev', role: 'editor', temporaryPassword: 'temporary-1234' },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ user: { email: 'dev@example.com' }, membership: { role: 'editor' } });

    const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'dev@example.com', password: 'temporary-1234' } });
    expect(login.statusCode).toBe(200);
  } finally {
    await app.close();
  }
});
```

- [x] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- tests/server-auth.test.ts
```

Expected: FAIL with route not found.

- [x] **Step 3: Add member routes**

In `apps/api/src/server.ts`:

```ts
app.get('/api/organizations/current/members', async (req) => {
  const memberships = await store.listMembershipsForOrganization(requireOrganization(req.actor));
  const users = await Promise.all(memberships.map(async (membership) => ({
    membership,
    user: publicUser(await store.findUserById(membership.userId)),
  })));
  return users.filter((item) => item.user);
});

app.post('/api/organizations/current/members', async (req, reply) => {
  if (!hasPermission(req.actor!.role, 'settings:write')) return reply.code(403).send({ error: 'Somente admin pode gerenciar membros' });
  const input = z.object({
    email: z.string().email(),
    name: z.string().min(1).optional(),
    role: z.enum(['admin', 'editor', 'viewer']),
    temporaryPassword: passwordSchema.optional(),
  }).parse(req.body);
  const password = input.temporaryPassword ?? createResetToken();
  const user = await store.findUserByEmail(input.email) ?? await store.createUser({ email: input.email, name: input.name, passwordHash: await hashPassword(password) });
  const membership = await store.createMembership({ userId: user.id, organizationId: requireOrganization(req.actor), role: input.role });
  return reply.code(201).send({ user: publicUser(user), membership, temporaryPassword: input.temporaryPassword ? undefined : password });
});
```

- [x] **Step 4: Run tests**

Run:

```bash
npm test -- tests/server-auth.test.ts
```

Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add apps/api/src/server.ts tests/server-auth.test.ts
git commit -m "feat: add organization member management"
```

## Task 7: Build Web Auth Pages And API Wrapper

**Files:**
- Create: `apps/web/lib/api.ts`
- Create: `apps/web/components/auth/auth-shell.tsx`
- Create: `apps/web/app/login/page.tsx`
- Create: `apps/web/app/register/page.tsx`
- Create: `apps/web/app/forgot-password/page.tsx`
- Create: `apps/web/app/reset-password/page.tsx`
- Modify: `apps/web/components/dashboard/v2-console.tsx`

- [x] **Step 1: Create shared API wrapper**

Create `apps/web/lib/api.ts`:

```ts
export const apiBase = process.env.NEXT_PUBLIC_TESTHUB_API_URL ?? 'http://localhost:4321';

export async function api<T>(apiPath: string, options: RequestInit = {}): Promise<T> {
  const token = typeof window !== 'undefined' ? window.localStorage.getItem('testhub.token') : process.env.NEXT_PUBLIC_TESTHUB_TOKEN;
  const headers = {
    ...(options.body ? { 'content-type': 'application/json' } : {}),
    ...(token ? { authorization: `Bearer ${token}` } : {}),
    ...(options.headers ?? {}),
  };
  const response = await fetch(`${apiBase}${apiPath}`, { ...options, credentials: 'include', headers });
  if (response.status === 401 && typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
    window.location.assign('/login');
  }
  if (!response.ok) throw new Error(await response.text());
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
```

Remove the local `api` and `apiBase` definitions from `v2-console.tsx` and import them:

```ts
import { api, apiBase } from '@/lib/api';
```

- [x] **Step 2: Create auth shell**

Create `apps/web/components/auth/auth-shell.tsx`:

```tsx
import type React from 'react';

export function AuthShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="grid min-h-screen place-items-center bg-[#f4f2eb] p-4 text-[#1f241f]">
      <section className="w-full max-w-md rounded-lg border border-[#d8d3c5] bg-[#fbfaf6] p-5 shadow-sm">
        <h1 className="text-2xl font-extrabold tracking-normal">{title}</h1>
        <div className="mt-5">{children}</div>
      </section>
    </main>
  );
}
```

- [x] **Step 3: Create login/register/reset pages**

Each page should be a client component using existing `Button`, `Input`, `Label`, and `api`.

For `apps/web/app/login/page.tsx`, implement form submit:

```tsx
const result = await api<{ token: string }>('/api/auth/login', {
  method: 'POST',
  body: JSON.stringify({ email, password }),
});
window.localStorage.setItem('testhub.token', result.token);
window.location.assign('/v2');
```

For `register/page.tsx`, call `/api/auth/register` with `email`, `name`, `password`, and `organizationName`.

For `forgot-password/page.tsx`, call `/api/auth/password-reset/request`; if response contains `resetToken`, show it and link to `/reset-password?token=<token>`.

For `reset-password/page.tsx`, call `/api/auth/password-reset/confirm` with `resetToken` and `password`, then route to `/login`.

- [x] **Step 4: Add auth guard and logout to console**

In `V2Console`, add state:

```ts
type AuthMe = { user: { email: string; name?: string }; organization: { id: string; name: string }; membership: { role: 'admin' | 'editor' | 'viewer' }; organizations: Array<{ id: string; name: string }> };
const [me, setMe] = useState<AuthMe | null>(null);
```

Fetch it in `refresh()`:

```ts
const nextMe = await api<AuthMe>('/api/auth/me').catch(() => null);
setMe(nextMe);
```

Use `me?.membership.role` instead of `security?.auth.rbacRole` for UI permissions.

Add logout button in the header:

```tsx
<Button variant="outline" onClick={async () => {
  await api('/api/auth/logout', { method: 'POST', body: '{}' }).catch(() => undefined);
  window.localStorage.removeItem('testhub.token');
  window.location.assign('/login');
}}>Sair</Button>
```

- [x] **Step 5: Typecheck**

Run:

```bash
npm run typecheck
npm run web:build
```

Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add apps/web/lib/api.ts apps/web/components/auth/auth-shell.tsx apps/web/app/login/page.tsx apps/web/app/register/page.tsx apps/web/app/forgot-password/page.tsx apps/web/app/reset-password/page.tsx apps/web/components/dashboard/v2-console.tsx
git commit -m "feat: add web auth flows"
```

## Task 8: Add Members UI And Replace Manual Token Settings

**Files:**
- Modify: `apps/web/components/dashboard/v2-console.tsx`

- [x] **Step 1: Add member types and state**

Add:

```ts
type OrganizationMember = {
  user: { id: string; email: string; name?: string };
  membership: { id: string; role: 'admin' | 'editor' | 'viewer' };
};
const [members, setMembers] = useState<OrganizationMember[]>([]);
const [memberDraft, setMemberDraft] = useState({ email: '', name: '', role: 'viewer' as OrganizationMember['membership']['role'], temporaryPassword: '' });
```

Fetch members in `refresh()`:

```ts
api<OrganizationMember[]>('/api/organizations/current/members').catch(() => [])
```

- [x] **Step 2: Add member creation action**

Add:

```ts
async function createMember() {
  await mutate(async () => {
    const response = await api<{ temporaryPassword?: string }>('/api/organizations/current/members', {
      method: 'POST',
      body: JSON.stringify({
        email: memberDraft.email,
        name: memberDraft.name || undefined,
        role: memberDraft.role,
        temporaryPassword: memberDraft.temporaryPassword || undefined,
      }),
    });
    if (response.temporaryPassword) setNotice(`Usuario criado. Senha temporaria: ${response.temporaryPassword}`);
    setMemberDraft({ email: '', name: '', role: 'viewer', temporaryPassword: '' });
  }, 'Membro criado.');
}
```

- [x] **Step 3: Replace `Sessao local` card**

In `SettingsWorkspace`, replace the manual token card with an `Organizacao` card listing:

- logged user email;
- current organization/team name;
- role;
- member list;
- create member form for admins.

Keep a collapsed "Token para CLI/MCP" section if needed, but do not make manual token the primary web login path.

- [x] **Step 4: Build**

Run:

```bash
npm run web:build
```

Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add apps/web/components/dashboard/v2-console.tsx
git commit -m "feat: add organization members ui"
```

## Task 9: Update MCP And Token Compatibility Tests

**Files:**
- Modify: `apps/mcp/src/mcp.ts`
- Modify: `tests/mcp.test.ts`

- [x] **Step 1: Keep MCP token mode explicit**

In `tests/mcp.test.ts`, set:

```ts
process.env.TESTHUB_AUTH_MODE = 'token';
process.env.TESTHUB_TOKEN = 'mcp-test-token';
```

Pass `TESTHUB_TOKEN: 'mcp-test-token'` to the MCP process env.

- [x] **Step 2: Document MCP session token fallback**

In `apps/mcp/src/mcp.ts`, change:

```ts
const TESTHUB_TOKEN = process.env.TESTHUB_TOKEN;
```

to:

```ts
const TESTHUB_TOKEN = process.env.TESTHUB_TOKEN ?? process.env.TESTHUB_SESSION_TOKEN;
```

- [x] **Step 3: Run MCP test**

Run:

```bash
npm test -- tests/mcp.test.ts
```

Expected: PASS.

- [x] **Step 4: Commit**

```bash
git add apps/mcp/src/mcp.ts tests/mcp.test.ts
git commit -m "chore: keep mcp auth token compatible"
```

## Task 10: Add Browser E2E Coverage

**Files:**
- Modify: `tests/e2e/v2.spec.ts`

- [ ] **Step 1: Add auth setup helper**

At the top of `tests/e2e/v2.spec.ts`, add:

```ts
async function login(page, email = `web-${Date.now()}@example.com`) {
  await page.goto('/register');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Nome').fill('Web E2E');
  await page.getByLabel('Senha').fill('password-1234');
  await page.getByLabel('Organizacao').fill(`Team ${Date.now()}`);
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page).toHaveURL(/\/v2/);
}
```

Call `await login(page)` before navigating to protected pages in each test, or use Playwright storage state if this gets slow.

- [ ] **Step 2: Add protected route test**

Add:

```ts
test('protected routes redirect anonymous user to login', async ({ page }) => {
  await page.goto('/v2');
  await expect(page).toHaveURL(/\/login/);
});
```

- [ ] **Step 3: Update seedWorkspace helper**

Because API calls from `seedWorkspace()` are direct `fetch`, first register/login through API and pass bearer:

```ts
const token = await createApiUser();
headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }
```

- [ ] **Step 4: Run E2E**

Run:

```bash
TESTHUB_AUTH_MODE=local npm run test:e2e
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/v2.spec.ts
git commit -m "test: cover authenticated web flows"
```

## Task 11: Documentation And Security Status

**Files:**
- Modify: `README.md`
- Modify: `apps/api/src/server.ts`
- Modify: `packages/db/src/security.ts`

- [ ] **Step 1: Update security status response**

Make `/api/system/security` report:

```json
{
  "auth": {
    "mode": "local",
    "localUsers": true,
    "setupRequired": false,
    "apiTokenEnabled": false
  }
}
```

Do not include counts if that requires a full DB scan in the security helper; the API route can augment the response with store data.

- [ ] **Step 2: Update README auth docs**

Replace the old "Auth opcional" section with:

```md
## Auth local

Default web mode is local auth. First user creates an organization/team and becomes admin.

Routes:
- `/register`: create user and organization
- `/login`: sign in
- `/forgot-password`: request reset code
- `/reset-password`: set a new password

Local reset without email returns the reset code only outside production or when `TESTHUB_ALLOW_DISPLAY_RESET=true`.

Modes:

```text
TESTHUB_AUTH_MODE=local|token|oidc|off
TESTHUB_TOKEN=secret
TESTHUB_ALLOW_DISPLAY_RESET=true
```

`off` is for local demos only and must not be used in production.
```

- [ ] **Step 3: Run docs-neutral checks**

Run:

```bash
npm run typecheck
npm test -- tests/server-auth.test.ts tests/server-e2e.test.ts tests/mcp.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add README.md apps/api/src/server.ts packages/db/src/security.ts
git commit -m "docs: document real auth setup"
```

## Task 12: Final Verification

**Files:**
- No planned source changes unless verification fails.

- [ ] **Step 1: Run unit and API suite**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 2: Run typecheck and build**

Run:

```bash
npm run typecheck
npm run build
npm run web:build
```

Expected: PASS.

- [ ] **Step 3: Run auth smoke manually**

Start API and web:

```bash
TESTHUB_AUTH_MODE=local npm run server
```

```bash
NEXT_PUBLIC_TESTHUB_API_URL=http://127.0.0.1:4321 npm run web
```

Manual browser flow:

1. Open `http://localhost:3333/register`.
2. Create user `qa@example.com`, password `password-1234`, organization `QA Team`.
3. Confirm redirect to `/v2`.
4. Create project, environment, suite, and run.
5. Open `/settings`, create a viewer member.
6. Logout.
7. Login as viewer and verify write buttons are disabled.
8. Use forgot password for viewer, reset password, login with new password.

- [ ] **Step 4: Commit any verification fixes**

Only if fixes were needed:

```bash
git add <fixed-files>
git commit -m "fix: stabilize auth verification"
```

## Self-Review

- Spec coverage:
  - Login: Tasks 4 and 7.
  - User creation: Tasks 4, 6, and 7.
  - Forgot password without email: Tasks 3, 4, and 7.
  - Organization/team sharing: Tasks 1, 2, 5, 6, and 8.
  - Backend auth/RBAC flag currently disabling auth: Tasks 4 and 11.
  - PRD Phase 5 security maturity: Tasks 4, 5, 6, 8, and 11.
  - Existing runner/CLI/MCP compatibility: Task 9 and final verification.
- Placeholder scan:
  - No forbidden placeholder instructions remain.
  - All code-changing tasks include concrete file paths, commands, and expected outcomes.
- Type consistency:
  - Roles use `admin|editor|viewer` across `MembershipRole`, `RbacRole`, API tests, and UI.
  - Session token persistence always uses `hashToken(token)`.
  - Organization scope is carried by `Project.organizationId` and `AuthActor.organizationId`.
