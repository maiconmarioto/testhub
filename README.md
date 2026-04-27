# TestHub Runner CLI

Runner local para specs `web` e `api`.

## Estrutura

- `apps/web`: unica UI oficial, dashboard Next.js.
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

## Next.js Dashboard

Frontend real em `apps/web`.

```bash
npm run web
```

Abrir:

```text
http://localhost:3333
```

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

Auth opcional:

```bash
TESTHUB_TOKEN=secret node dist/apps/cli/src/cli.js server
curl -H "authorization: Bearer secret" http://localhost:4321/api/projects
```

Operacoes uteis:

```bash
curl -X POST http://localhost:4321/api/runs/<run-id>/cancel
curl -X POST http://localhost:4321/api/cleanup -H 'content-type: application/json' -d '{"days":30}'
```

Delete de entidades e cleanup usam soft delete/archive. Registros e artifacts sao preservados; a UI/API apenas ocultam itens arquivados.

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

CLI cleanup:

```bash
npx tsx apps/cli/src/cli.ts cleanup --days 30
```

## AI Connections

AI e opcional. Sem connection, runner/API/dashboard seguem funcionando.

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
