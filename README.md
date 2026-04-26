# TestHub Runner CLI

Runner local para specs `web` e `api`.

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
npx tsx src/cli.ts validate examples/api-health.yaml
```

## Rodar API

```bash
npx tsx src/cli.ts run examples/api-health.yaml --report-dir .testhub-runs
npx tsx src/cli.ts run examples/api-chain.yaml --report-dir .testhub-runs --junit
```

## Rodar Web

```bash
npx tsx src/cli.ts run examples/web-example.yaml --report-dir .testhub-runs
```

## Variaveis

Specs podem usar `${VAR}`. Valores vêm do ambiente ou `--env-file`.

```bash
BASE_URL=https://crm-hml.local npx tsx src/cli.ts run tests/web/login.yaml
```

`.env` simples:

```text
BASE_URL=https://crm-hml.local
CRM_USER=qa@example.com
CRM_PASS=secret
```

```bash
npx tsx src/cli.ts run tests/web/login.yaml --env-file .env
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

## Server + Dashboard

```bash
npm run build
node dist/cli.js server --port 4321
```

Abrir:

```text
http://localhost:4321
```

## Next.js Dashboard

Frontend real em `apps/web`.

```bash
npm run web
```

Abrir:

```text
http://localhost:3000
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
DATABASE_URL=postgres://testhub:testhub@localhost:5432/testhub npm run migrate
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
TESTHUB_TOKEN=secret node dist/cli.js server
curl -H "authorization: Bearer secret" http://localhost:4321/api/projects
```

Operacoes uteis:

```bash
curl -X POST http://localhost:4321/api/runs/<run-id>/cancel
curl -X POST http://localhost:4321/api/cleanup -H 'content-type: application/json' -d '{"days":30}'
```

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
npx tsx src/cli.ts cleanup --days 30
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

- `testhub_list_projects`
- `testhub_list_environments`
- `testhub_list_suites`
- `testhub_import_openapi`
- `testhub_run_suite`
- `testhub_get_run_status`
- `testhub_get_run_report`
- `testhub_cancel_run`
- `testhub_cleanup`
- `testhub_explain_failure`
