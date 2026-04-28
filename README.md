# TestHub

TestHub is a test orchestration platform for API and browser suites written in YAML. It provides a runner, REST API, worker queue, web console, artifact storage, reusable web flows, and an MCP server focused on agentic test creation and execution.

The project is built as a TypeScript monorepo and can run locally with Node.js or as a Docker Compose stack backed by Postgres, Redis, and MinIO.

## What TestHub Provides

- YAML-based API and Web test specs.
- Browser execution with Playwright videos, traces, screenshots, console logs, and per-scenario evidence.
- API execution with request/response artifacts, JSON schema assertions, and extracted variables.
- Project, environment, suite, run, organization, user, and token management through the web app.
- Organization-scoped Flow Library for reusable browser flows such as login/setup journeys.
- MCP tools for AI agents to create projects, environments, flow library entries, suites, runs, and inspect evidence.
- Optional AI assistance for explaining failures and suggesting test changes. AI does not decide pass/fail.

## Repository Layout

```text
apps/
  api       Fastify REST API, Swagger, artifacts, auth, RBAC
  cli       Command-line runner and maintenance commands
  mcp       MCP server for agentic test creation/execution
  web       Next.js console
  worker    BullMQ worker that executes queued runs

packages/
  ai         Optional AI adapters and prompts
  artifacts Artifact upload/localization
  db         Store, migrations, secrets, Postgres integration
  runner     API/Web runner and report generation
  shared     Shared types, jobs, filesystem helpers, redaction
  spec       YAML parser, validation, OpenAPI import helpers
```

## Requirements

- Node.js 22+
- npm
- Docker and Docker Compose for the full stack
- Playwright Chromium for local browser runs

```bash
npm install
npx playwright install chromium
```

## Quick Start

Run the backend stack with Docker:

```bash
cp .env.example .env
docker compose up --build
```

Run the web app locally:

```bash
npm run web
```

Open:

```text
http://localhost:3333
```

API health:

```bash
curl http://localhost:4321/api/health
```

Swagger/OpenAPI:

```text
http://localhost:4321/docs
http://localhost:4321/openapi.json
```

## Development Commands

```bash
npm run typecheck
npm test
npm run build
npm run web:build
```

Run individual services without Docker:

```bash
npm run server
npm run worker
npm run mcp
```

Run database migrations manually:

```bash
set -a; source .env; set +a
DATABASE_URL="$TESTHUB_LOCAL_DATABASE_URL" npm run migrate
```

## Configuration

Secrets belong in `.env`. Use `.env.example` as the template.

Core variables:

```text
DATABASE_URL=postgres://testhub:replace-me@postgres:5432/testhub
REDIS_URL=redis://redis:6379
TESTHUB_SECRET_KEY=replace-with-random-32-byte-secret
TESTHUB_AUTH_MODE=local
TESTHUB_WEB_URL=http://localhost:3333
TESTHUB_CORS_ORIGINS=http://localhost:3333,http://127.0.0.1:3333,http://host.docker.internal:3333
NEXT_PUBLIC_TESTHUB_API_URL=http://localhost:4321
```

Artifact storage:

```text
S3_BUCKET=testhub
S3_ENDPOINT=http://minio:9000
S3_ACCESS_KEY_ID=testhub
S3_SECRET_ACCESS_KEY=replace-me
S3_FORCE_PATH_STYLE=true
```

Runtime controls:

```text
TESTHUB_RUN_TIMEOUT_MS=120000
TESTHUB_WORKER_CONCURRENCY=2
```

## Authentication and Organizations

Default web mode is local auth:

```text
TESTHUB_AUTH_MODE=local
```

The first registered user becomes admin and creates the initial organization. Projects, environments, suites, flows, runs, users, and tokens are scoped by organization.

Supported auth modes:

```text
TESTHUB_AUTH_MODE=local|token|oidc|off
```

Local auth routes:

```text
/register
/login
/forgot-password
/reset-password
```

Roles:

- `admin`: full access, including settings, users, audit, and cleanup.
- `editor`: projects, environments, suites, flows, runs, imports, and AI assistant.
- `viewer`: read-only access.

Personal access tokens for CLI/MCP are managed in the web console. Tokens can be scoped to one organization or all organizations the user can access.

## Web Console

Main routes:

- `/v2` - run workspace, current suite/environment, evidence, recent runs.
- `/projects` - projects and environments.
- `/suites` - YAML suite editor with Monaco syntax highlighting and validation.
- `/settings` - profile, organizations, users, tokens, Flow Library, security, AI, audit.
- `/docs` - product documentation and examples.

Evidence is grouped by run and by test scenario. Browser scenarios expose their own video, trace, screenshots, and console logs. Console logs open in-app instead of navigating away.

## YAML Specs

Specs use `version: 1` and `type: api` or `type: web`.

### Web Example

```yaml
version: 1
type: web
name: login-smoke
defaults:
  timeoutMs: 30000
  video: retain-on-failure
  trace: retain-on-failure
tests:
  - name: user opens workspace
    steps:
      - goto: /login
      - fill:
          by: label
          target: Email
          value: ${USER_EMAIL}
      - fill:
          by: label
          target: Senha
          value: ${USER_PASSWORD}
      - click:
          by: role
          role: button
          name: Entrar
      - expectText: TestHub v2
```

Supported web steps:

- `goto`
- `click`
- `fill`
- `select`
- `check`
- `press`
- `waitFor`
- `expectText`
- `expectUrlContains`
- `expectVisible`
- `expectHidden`
- `expectAttribute`
- `expectValue`
- `expectCount`
- `uploadFile`
- `extract`
- `use` with `with`

### Flow Library

Flow Library entries are reusable browser flows stored at organization scope.

Create a reusable login flow named `auth.login`:

```yaml
namespace: auth
name: login
params:
  email: ${USER_EMAIL}
  password: ${USER_PASSWORD}
steps:
  - goto: /login
  - fill:
      by: label
      target: Email
      value: ${email}
  - fill:
      by: label
      target: Senha
      value: ${password}
  - click:
      by: role
      role: button
      name: Entrar
```

Use it from a suite:

```yaml
version: 1
type: web
name: workspace-navigation
tests:
  - name: user opens docs
    steps:
      - use: auth.login
      - goto: /docs
      - expectText: Documentacao TestHub
```

Local `flows:` in the suite remain supported. Local flow names take precedence over library flows when the exact reference matches.

### API Example

```yaml
version: 1
type: api
name: health
tests:
  - name: status 200
    request:
      method: GET
      path: /health
    expect:
      status: 200
```

API assertions include:

- status
- headers
- body path
- body contains
- `bodyPathExists`
- `bodyPathMatches`
- `jsonSchema`
- `extract` for chaining requests

Common suite features:

- `skip`
- `only`
- `tags`
- `retries`
- `beforeEach`
- `afterEach`
- `defaults.timeoutMs`
- `--tag`
- `--junit`

## CLI

Validate a spec:

```bash
npx tsx apps/cli/src/cli.ts validate examples/api-health.yaml
```

Run an API spec:

```bash
npx tsx apps/cli/src/cli.ts run examples/api-health.yaml \
  --report-dir .testhub-runs \
  --junit
```

Run a web spec:

```bash
npx tsx apps/cli/src/cli.ts run examples/web-example.yaml \
  --report-dir .testhub-runs
```

Use environment variables:

```bash
npx tsx apps/cli/src/cli.ts run tests/web/login.yaml --env-file .env
```

Exit codes:

- `0`: passed
- `1`: test failed
- `2`: invalid spec
- `3`: infrastructure/runner error
- `4`: missing variable

## MCP

The MCP server is intended for agents that create and run tests through YAML. It does not manage users, personal tokens, OpenAPI imports, cleanup, or AI connections. Those operations stay in the web application/API.

Run MCP:

```bash
TESTHUB_URL=http://localhost:4321 \
TESTHUB_PAT=th_pat_xxx \
npx testhub-mcp
```

If the token has access to multiple organizations:

```bash
TESTHUB_ORGANIZATION_ID=<organization-id>
```

Available tools:

- `testhub_help`
- `testhub_get_spec_examples`
- `testhub_get_test_context`
- `testhub_list_projects`
- `testhub_get_project`
- `testhub_create_project`
- `testhub_update_project`
- `testhub_archive_project`
- `testhub_list_environments`
- `testhub_list_envs`
- `testhub_create_environment`
- `testhub_create_env`
- `testhub_get_environment`
- `testhub_update_environment`
- `testhub_archive_environment`
- `list_environments`
- `create_environment`
- `get_environment`
- `testhub_list_suites`
- `testhub_get_suite`
- `testhub_create_suite`
- `testhub_update_suite`
- `testhub_validate_spec`
- `testhub_list_flows`
- `testhub_get_flow`
- `testhub_create_flow`
- `testhub_update_flow`
- `testhub_archive_flow`
- `testhub_list_runs`
- `testhub_run_suite`
- `testhub_get_run_status`
- `testhub_wait_run`
- `testhub_get_run_report`
- `testhub_get_artifacts`
- `testhub_cancel_run`

Resource:

- `testhub://guide`

Prompt:

- `testhub_operator`

Recommended agent flow:

1. Read `testhub_help`.
2. List projects and choose/create a project.
3. List/create environments.
4. List existing Flow Library entries before writing browser specs.
5. Validate YAML before saving suites.
6. Run the suite.
7. Inspect status, report, and artifacts.

## REST API

Run the API:

```bash
npm run build
node dist/apps/cli/src/cli.js server --port 4321
```

Selected endpoints:

```text
GET    /api/health
GET    /api/projects
POST   /api/projects
GET    /api/environments?projectId=...
POST   /api/environments
GET    /api/suites?projectId=...
POST   /api/suites
POST   /api/spec/validate
GET    /api/flows
POST   /api/flows
POST   /api/runs
GET    /api/runs/:id
GET    /api/runs/:id/report
POST   /api/runs/:id/cancel
GET    /artifacts?path=...
```

## Docker Networking

When the worker runs inside Docker, `localhost` points to the worker container, not the host machine.

Use:

```text
TestHub outside Docker -> http://localhost:<port>
TestHub in Docker, target app on host -> http://host.docker.internal:<port>
TestHub in Docker, target app in same Compose network -> http://<service-name>:<port>
```

Example environment for a locally running web app:

```text
http://host.docker.internal:3000
```

## AI Assistance

AI is optional. Without configured AI connections, the runner, API, UI, CLI, and MCP continue to work.

Supported providers in the adapter:

- `openrouter`
- `openai`
- `anthropic`

AI can explain failures and suggest changes. Applying a suggested patch requires explicit human approval in the suite editor.

## Data Retention and Cleanup

Deletes are soft deletes/archive operations for visible entities. Cleanup can remove old runs based on retention settings. Artifact removal is opt-in per project through `cleanupArtifacts`.

CLI cleanup:

```bash
npx tsx apps/cli/src/cli.ts cleanup --days 30
```

API cleanup:

```bash
curl -X POST http://localhost:4321/api/cleanup \
  -H 'content-type: application/json' \
  -d '{"projectId":"...","days":30}'
```

## License

No license has been published yet.
