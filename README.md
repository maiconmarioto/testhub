# TestHub

Runner + API + UI oficial para specs `frontend` e `api`.

## Estrutura

- `apps/web`: UI oficial Next.js. `/v2`, `/projects`, `/suites`, `/settings`.
- `apps/api`: Fastify REST, health/status, artifacts e Swagger/OpenAPI.
- `apps/worker`: worker BullMQ, apenas executa runs.
- `apps/cli`: CLI para validar, executar, servir API e limpeza.
- `apps/mcp`: servidor MCP opcional.
- `packages/runner`: execucao de specs API/web e reports.
- `packages/spec`: parser, validacao e import OpenAPI.
- `packages/db`: stores, Drizzle/Postgres, secrets e migrations.
- `packages/shared`: tipos, jobs, filesystem e redaction.
- `packages/ai`: prompts/adapters de AI opcionais.
- `packages/artifacts`: upload/localizacao de artifacts.

## Setup

```bash
npm install
npm run build
```

Browsers Playwright, se necessario:

```bash
npx playwright install chromium
```

## Validar spec

```bash
npx tsx apps/cli/src/cli.ts validate examples/api-health.yaml
```

## Rodar API

```bash
npx tsx apps/cli/src/cli.ts run examples/api-health.yaml --report-dir .testhub-runs
npx tsx apps/cli/src/cli.ts run examples/api-chain.yaml --report-dir .testhub-runs --junit
```

## Rodar Web

```bash
npx tsx apps/cli/src/cli.ts run examples/web-example.yaml --report-dir .testhub-runs
```

## Variaveis

Specs podem usar `${VAR}`. Valores vêm do ambiente ou `--env-file`.

```bash
BASE_URL=https://crm-hml.local npx tsx apps/cli/src/cli.ts run tests/web/login.yaml
```

`.env` simples:

```text
BASE_URL=https://crm-hml.local
CRM_USER=qa@example.com
CRM_PASS=secret
```

```bash
npx tsx apps/cli/src/cli.ts run tests/web/login.yaml --env-file .env
```

## Exit Codes

- `0`: passou
- `1`: teste falhou
- `2`: spec invalida
- `3`: erro infra/runner
- `4`: variavel ausente

## Recursos suportados

Web:

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

Runs web gravam video Playwright por padrao. O artifact `.webm` aparece no report e no dashboard de runs.

API:

- status, headers, body path, body contains
- `bodyPathExists`
- `bodyPathMatches`
- `jsonSchema`
- `extract` para encadear requests

Comum:

- `skip`
- `only`
- `tags`
- `retries`
- `beforeEach`
- `afterEach`
- `--tag`
- `--junit`

## API

```bash
npm run build
node dist/apps/cli/src/cli.js server --port 4321
```

Abrir:

```text
http://localhost:4321
http://localhost:4321/docs
http://localhost:4321/openapi.json
```

## UI oficial

Frontend real em `apps/web`.

```bash
npm run web
```

Abrir:

```text
http://localhost:3333
```

Rotas principais:

- `/v2`: overview/run workspace. Query params compartilhaveis: `project`, `environment`, `suite`, `run`.
- `/projects`: criar/editar projetos e ambientes. Retention por projeto fica aqui.
- `/suites`: criar/editar suites YAML, Monaco editor, validação inline e import OpenAPI.
- `/settings`: AI connections, segurança, audit e cleanup.

Wizard:

- Botao `Wizard` no topo da home.
- Cria projeto, ambiente e primeira suite em passos.
- Modal nao fecha com `Esc` nem clique fora; fecha apenas em `Fechar`/`X`.

Build:

```bash
npm run web:build
```

## Postgres/Redis/MinIO

Rodar stack completa:

```bash
docker compose up --build
```

Migrar DB manualmente:

```bash
DATABASE_URL=postgres://testhub:testhub@localhost:55432/testhub npm run migrate
```

Variaveis principais:

```text
DATABASE_URL=postgres://...
REDIS_URL=redis://...
TESTHUB_SECRET_KEY=change-me
S3_BUCKET=testhub
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY_ID=testhub
S3_SECRET_ACCESS_KEY=testhubsecret
S3_FORCE_PATH_STYLE=true
```

API basica:

```bash
curl http://localhost:4321/api/health
```

Auth local:

- Modo web padrao: auth local (`TESTHUB_AUTH_MODE=local`).
- Primeiro usuario criado vira admin, cria a organizacao/time inicial e conclui setup.
- Rotas web: `/register`, `/login`, `/forgot-password`, `/reset-password`.
- Reset de senha sem email configurado retorna o codigo apenas fora de producao ou com `TESTHUB_ALLOW_DISPLAY_RESET=true`.
- `off` serve apenas para demos locais. Nao use em producao.

Modos e variaveis:

```text
TESTHUB_AUTH_MODE=local|token|oidc|off
TESTHUB_TOKEN=secret
TESTHUB_ALLOW_DISPLAY_RESET=true
TESTHUB_ROLE=admin|editor|viewer
AUTH_OIDC_ISSUER=https://issuer.example.com
AUTH_OIDC_CLIENT_ID=testhub
TESTHUB_ADMIN_GROUPS=platform-admins
TESTHUB_EDITOR_GROUPS=qa,developers
TESTHUB_VIEWER_GROUPS=readers
```

CLI/MCP:

- Em auth local, login retorna um token de sessao. Use como bearer; MCP tambem aceita `TESTHUB_SESSION_TOKEN=<token>`.
- Em modo token, exporte `TESTHUB_AUTH_MODE=token` e `TESTHUB_TOKEN=secret`; use `authorization: Bearer secret`.

Permissões:

- `admin`: tudo, incluindo settings, audit e cleanup.
- `editor`: projetos/ambientes/suites/runs/import/AI assistant.
- `viewer`: leitura.

Na UI, salve bearer token/OIDC access token em `/settings` -> `Sessao local` quando auth estiver ligada.

Operacoes uteis:

```bash
curl -X POST http://localhost:4321/api/runs/<run-id>/cancel
curl -X POST http://localhost:4321/api/cleanup -H 'content-type: application/json' -d '{"days":30}'
curl http://localhost:4321/api/audit?limit=100
curl http://localhost:4321/api/audit/export
```

Delete de entidades e cleanup usam soft delete/archive. Por padrao artifacts sao preservados. Projeto pode habilitar `cleanupArtifacts` para remover artifacts locais no cleanup.

Timeout e concorrencia:

```text
TESTHUB_RUN_TIMEOUT_MS=120000
TESTHUB_WORKER_CONCURRENCY=2
```

Import OpenAPI simples:

```bash
curl -X POST http://localhost:4321/api/import/openapi \\
  -H 'content-type: application/json' \\
  -d '{"projectId":"...","name":"catalog-api","spec":{"openapi":"3.0.0","paths":{"/health":{"get":{"responses":{"200":{"description":"ok"}}}}}}}'
```

Import OpenAPI avancado:

```bash
curl -X POST http://localhost:4321/api/import/openapi \\
  -H 'content-type: application/json' \\
  -d '{
    "projectId":"...",
    "name":"catalog-api",
    "baseUrl":"https://api.local",
    "authTemplate":"bearer",
    "headers":{"x-tenant":"demo"},
    "tags":["catalog"],
    "selectedOperations":["GET /health","createUser"],
    "includeBodyExamples":true,
    "spec":{"openapi":"3.0.0","paths":{}}
  }'
```

CLI cleanup:

```bash
npx tsx apps/cli/src/cli.ts cleanup --days 30
```

## AI Connections

AI e opcional. Sem connection, runner/API/UI seguem funcionando. AI nunca decide pass/fail. Patch sugerido só é aplicado quando usuario marca aprovação humana na tela de suites.

Providers suportados no adapter:

- `openrouter`
- `openai`
- `anthropic`

Criar connection:

```bash
curl -X POST http://localhost:4321/api/ai/connections \\
  -H 'content-type: application/json' \\
  -d '{
    "name": "OpenRouter",
    "provider": "openrouter",
    "apiKey": "sk-...",
    "model": "openai/gpt-4o-mini",
    "enabled": true
  }'
```

Explicar falha:

```bash
curl -X POST http://localhost:4321/api/ai/explain-failure \\
  -H 'content-type: application/json' \\
  -d '{"context":{"error":"Status esperado 200, recebido 500"}}'
```

## MCP

Rodar MCP:

```bash
TESTHUB_URL=http://localhost:4321 npx testhub-mcp
```

Tools:

- `testhub_help`
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
- `testhub_update_environment`
- `testhub_archive_environment`
- `testhub_get_environment`
- `list_environments`
- `create_environment`
- `get_environment`
- `testhub_list_suites`
- `testhub_get_suite`
- `testhub_create_suite`
- `testhub_update_suite`
- `testhub_validate_spec`
- `testhub_import_openapi`
- `testhub_list_runs`
- `testhub_run_suite`
- `testhub_get_run_status`
- `testhub_wait_run`
- `testhub_get_run_report`
- `testhub_get_artifacts`
- `testhub_cancel_run`
- `testhub_list_ai_connections`
- `testhub_upsert_ai_connection`
- `testhub_explain_failure`
- `testhub_cleanup`

Resources:

- `testhub://guide` - guia operacional para agentes entenderem o fluxo correto antes de alterar/rodar testes.

Prompts:

- `testhub_operator` - instrucoes para agentes trabalharem com TestHub sem adivinhar estado, com fluxo project -> environment -> suite -> run -> report -> artifacts.

## Docker e apps locais

Quando TestHub roda em container, `localhost` aponta para o proprio container do runner, nao para sua maquina host. Para testar uma aplicacao local que esta rodando fora do container, configure o environment com `host.docker.internal`.

Exemplos:

```text
Web local no host: http://host.docker.internal:3000
API local no host: http://host.docker.internal:4000
```

Se TestHub e a aplicacao alvo rodam no mesmo `docker-compose`, prefira o nome do servico na rede Docker:

```text
http://api:4000
http://web:3000
```

Regra pratica:

- TestHub fora do Docker -> use `http://localhost:<porta>`.
- TestHub dentro do Docker e app no host -> use `http://host.docker.internal:<porta>`.
- TestHub dentro do Docker e app em outro container da mesma rede -> use `http://<service-name>:<porta>`.
