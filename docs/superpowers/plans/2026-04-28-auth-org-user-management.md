# Auth Organization User Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Add real organization selection at signup, organization creation, user membership management, organization switching, and self profile/password settings.

**Architecture:** Keep current local auth/session model. Add store primitives for global organization/user/membership management, expose admin-only API routes, and update the settings UI to manage profile, organizations, and users. Signup uses a public organization list and selected organization IDs when public signup is enabled; first setup can still create the initial organization.

**Tech Stack:** Fastify + Zod API, JSON/Pg store implementations, Vitest, Next.js App Router React UI.

---

### Task 1: Backend API Contract And Store

**Files:**
- Modify: `packages/db/src/store.ts`
- Modify: `packages/db/src/pg-store.ts`
- Modify: `apps/api/src/server.ts`
- Test: `tests/server-auth.test.ts`

- [x] Write failing tests covering:
  - `GET /api/auth/organizations` returns active organizations without auth.
  - public signup accepts `organizationIds: string[]` and creates viewer memberships in selected orgs.
  - admin can `POST /api/organizations`, `GET /api/users`, and `PATCH /api/users/:id/memberships`.
  - user can `PUT /api/users/me` to change name/email/password after current password validation.
  - user can `POST /api/auth/switch-organization` only to an org where they have membership.
- [x] Run `npm test -- tests/server-auth.test.ts` and verify the new tests fail because routes/store methods are missing.
- [x] Implement store methods:
  - `listOrganizations()`
  - `listUsers()`
  - `updateUserProfile(userId, { email?, name? })`
  - `updateMembershipRole(userId, organizationId, role)`
  - `deleteMembership(userId, organizationId)`
- [x] Implement routes:
  - `GET /api/auth/organizations`
  - `POST /api/auth/switch-organization`
  - `PUT /api/users/me`
  - `GET /api/organizations`
  - `POST /api/organizations`
  - `GET /api/users`
  - `PATCH /api/users/:id/memberships`
- [x] Update RBAC/public route mapping so only auth organization list is public; org/user management requires `settings:write`.
- [x] Run `npm test -- tests/server-auth.test.ts tests/auth-store.test.ts` and `npm run typecheck`.

### Task 2: Signup UI

**Files:**
- Modify: `apps/web/app/register/page.tsx`

- [x] Fetch `GET /api/auth/organizations` on mount.
- [x] Replace text organization field with a multi-select dropdown for available organizations.
- [x] Keep a first-setup organization name field when no organizations exist.
- [x] Submit `organizationIds` and optional `organizationName`.
- [x] Disable submit unless required auth fields and either selected orgs or setup org name exist.

### Task 3: Settings UI For Profile, Organizations, Users

**Files:**
- Modify: `apps/web/components/dashboard/v2-console.tsx`

- [x] Extend types/state for organizations, users, profile draft, organization draft, user membership edits.
- [x] Refresh `GET /api/organizations` and `GET /api/users` for admins.
- [x] Add profile card for current user name/email/current password/new password.
- [x] Add organization card for creating organizations and switching current org.
- [x] Add user management card for editing each user's organization memberships and role.
- [x] Reuse existing `mutate`/`refresh` patterns.

### Task 4: Verification And Runtime

**Files:**
- Runtime only.

- [x] Run backend tests and typecheck.
- [x] Rebuild Docker backend services with `.env`: `docker compose --env-file .env up -d --build api worker`.
- [x] Keep frontend local at `http://localhost:3333`; restart local dev only if needed.
- [x] Smoke-check API health and register/settings pages.
