# PRD - TestHub: Plataforma Universal Interna de Testes

## 1. Metadados

| Campo | Valor |
| --- | --- |
| Produto | TestHub |
| Documento | Product Requirements Document |
| Versao | 0.2 |
| Status | Draft |
| Data | 2026-04-25 |
| Publico | Engenharia, QA, DevOps, liderancas técnicas |
| Escopo inicial | Runner + CLI para Web Smoke e API Contract contra aplicações já publicadas |

## 2. Resumo Executivo

TestHub será uma plataforma interna para padronizar testes automatizados em sistemas legados e novos. A primeira versão não sobe aplicações, não faz build, não cria ambiente e não depende de IA. Ela executa testes contra aplicações já rodando em ambientes acessíveis, como desenvolvimento compartilhado, homologação, staging ou ambiente produtivo controlado.

O MVP começa por runner e CLI. O usuário escreve specs declarativas em YAML, escolhe `web` ou `api`, executa contra uma URL, recebe resultado, exit code e evidências técnicas. Depois entram API, dashboard, worker, IA opcional e MCP.

Princípio central: execução determinística. IA ajuda a explicar falhas, sugerir correção de teste e sugerir/refinar cenários, mas nunca decide pass/fail, nunca aplica mudança sozinha e pode ser desligada sem quebrar o produto.

## 3. Problema

A empresa possui muitos sistemas legados e muitos projetos novos mudando continuamente. Cada time tende a criar testes de forma diferente, ou não criar teste. Issó gera:

- regressao manual repetitiva;
- baixa confianca em releases;
- falhas descobertas tarde;
- falta de histórico e evidência;
- APIs sem contrato validado;
- testes espalhados e sem padrão;
- dificuldade de onboarding em sistemas legados.

## 4. Objetivos

## 4.1 Objetivos de Produto

- Criar padrão único para smoke tests web e API contract tests.
- Permitir execução local e CI via CLI.
- Gerar reports e artifacts diagnósticos.
- Evoluir para dashboard central com histórico.
- Suportar IA opcional para diagnóstico e manutenção de specs.
- Suportar MCP futuro como interface para IDE/agentes.

## 4.2 Objetivos Tecnicos

- Runner separado de API/dashboard.
- Specs YAML versionaveis.
- Engines plugáveis: `web` e `api`.
- Reports JSON/HTML.
- Exit codes claros.
- Secrets via env/connection, nunca plaintext em report.
- Stack TypeScript coesa.

## 5. Nao Objetivos

MVP não deve:

- subir aplicação alvo;
- fazer build/deploy;
- ler repo automaticamente;
- criar PRD automatico;
- depender de IA;
- depender de MCP;
- corrigir codigo da aplicação;
- substituir unit/integration tests;
- executar teste de carga;
- executar mobile;
- fazer self-healing avancado.

## 6. Personas

## 6.1 QA

Quer transformar fluxos repetitivos em testes reexecutaveis, com evidência visual de falha.

## 6.2 Desenvolvedor

Quer rodar smoke/API antes de merge ou deploy, local ou CI.

## 6.3 Tech Lead

Quer visibilidade de qualidade minima por projeto/ambiente.

## 6.4 DevOps/Plataforma

Quer runner containerizado, CI simples, secrets seguros e logs auditaveis.

## 7. Princípios

- Simples antes de inteligente.
- Deterministico antes de generativo.
- Evidência antes de opiniao.
- YAML/JSON antes de UI complexa.
- Runner/CLI antes de dashboard.
- IA como copiloto, não motor.
- MCP como camada fina, não executor.

## 8. Escopo MVP

## 8.1 Incluido

- CLI `testhub`.
- Parser/validator de specs YAML.
- Web runner com Playwright.
- API runner com HTTP + AJV.
- Substituicao de variáveis `${VAR}` via ambiente.
- Artifacts locais.
- Report JSON.
- Report HTML.
- Exit codes.
- Exemplos de specs.

## 8.2 Fora do MVP

- Dashboard.
- API central.
- Worker/queue.
- Banco de dados.
- Auth corporativo.
- Secrets manager interno.
- IA.
- MCP.

## 9. Tipos de Teste

## 9.1 Web Smoke

Valida fluxos criticos com browser real.

Casos:

- login valido;
- login invalido;
- abrir home/dashboard;
- navegar menu critico;
- criar registro simples;
- buscar registro;
- logout.

Engine: Playwright.

Steps suportados no MVP:

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

Artifacts:

- screenshot em falha;
- video opcional;
- trace opcional;
- console logs.

## 9.2 API Contract

Valida endpoints e contratos básicos.

Casos:

- health check;
- status esperado;
- schema JSON;
- headers;
- body fields;
- tempo maximo;
- auth ausente/inválida.

Engine:

- `fetch`/Undici nativo Node;
- AJV para JSON Schema.

## 10. Spec YAML

## 10.1 Web Spec

```yaml
version: 1
type: web
name: crm-login-smoke
description: Valida login basico do CRM
baseUrl: ${BASE_URL}
defaults:
  timeoutMs: 10000
  screenshotOnFailure: true
  video: retain-on-failure
  trace: retain-on-failure
tests:
  - name: login valido
    tags: [smoke, auth]
    steps:
      - goto: /login
      - fill:
          by: label
          target: Email
          value: ${CRM_USER}
      - fill:
          by: label
          target: Senha
          value: ${CRM_PASS}
      - click:
          by: role
          role: button
          name: Entrar
      - expectUrlContains: /home
      - expectText: Bem-vindo
```

## 10.2 API Spec

```yaml
version: 1
type: api
name: users-contract
description: Valida contrato basico de usuários
baseUrl: ${API_URL}
defaults:
  timeoutMs: 5000
tests:
  - name: listar usuários
    tags: [contract, users]
    request:
      method: GET
      path: /api/users
      headers:
        Authorization: Bearer ${API_TOKEN}
    expect:
      status: 200
      maxMs: 800
      jsonSchema:
        type: array
        items:
          type: object
          required: [id, name]
          properties:
            id:
              type: string
            name:
              type: string
```

## 11. Requisitos Funcionais

## RF-001 - Validar Spec

Como usuário, quero validar YAML antes de executar.

Aceite:

- `testhub validate spec.yaml` retorna erro claro se spec inválida.
- Spec inválida retorna exit code `2`.
- Erros apontam path/campo quando possível.

Prioridade: Must.

## RF-002 - Executar Web Spec

Como usuário, quero executar spec web contra URL existente.

Aceite:

- Runner abre Chromium via Playwright.
- Cada step gera resultado.
- Falha aponta step exato.
- Screenshot em falha.
- Report JSON/HTML gerado.

Prioridade: Must.

## RF-003 - Executar API Spec

Como usuário, quero executar spec API contra URL existente.

Aceite:

- Runner executa metodo/path/header/body.
- Valida status, maxMs, headers, body e JSON schema.
- Request/response aparecem no report com secrets mascarados.

Prioridade: Must.

## RF-004 - Variáveis e Secrets via Env

Como usuário, quero usar `${VAR}` em specs.

Aceite:

- Runner resolve variáveis do ambiente.
- Variavel ausente falha com erro claro.
- Valores sensiveis sao mascarados em logs/reports.

Prioridade: Must.

## RF-005 - CLI

Como dev/DevOps, quero usar CLI em local e CI.

Comandos:

```bash
testhub validate tests/web/login.yaml
testhub run tests/web/login.yaml --base-url https://crm-hml.empresa.com
testhub run tests/api/users.yaml --report-dir .testhub-runs
```

Exit codes:

- `0`: passou.
- `1`: teste falhou.
- `2`: spec inválida.
- `3`: erro de infraestrutura.
- `4`: variavel/env ausente.

Prioridade: Must.

## RF-006 - Reports

Como usuário, quero report facil de ler.

Aceite:

- JSON report sempre gerado.
- HTML report gerado no MVP.
- Summary inclui total/passed/failed/skipped/error/duracao.
- Cada teste inclui erro, step falho e artifacts.

Prioridade: Must.

## RF-007 - Artifacts

Como usuário, quero evidências de falha.

Aceite:

- Web failure gera screenshot.
- Web pode gerar video/trace.
- API failure salva request/response sanitizados.
- Artifacts ficam em pasta da run.

Prioridade: Must.

## RF-008 - Dashboard Futuro

Como usuário, quero histórico central.

Aceite futuro:

- projetos;
- ambientes;
- suites;
- runs;
- artifacts;
- filtros por status/data/suite.

Prioridade: Should pos-MVP.

## RF-009 - AI Test Assistant Opcional

Como usuário, quero IA opcional para diagnóstico e manutenção de testes.

Aceite:

- IA pode ser desligada globalmente.
- Produto funciona sem IA configurada.
- Connections: OpenRouter, Anthropic, OpenAI.
- IA não recebe secrets.
- IA não decide pass/fail.
- IA não aplica mudança sem aprovacao.

Prioridade: Could.

## RF-010 - MCP Futuro

Como dev, quero chamar TestHub por IDE/agente.

Aceite futuro:

- MCP server como camada fina sobre API.
- Tools para listar projetos, listar suites, executar run, consultar status e report.
- MCP não roda Playwright.
- Auth via `TESTHUB_TOKEN`.

Prioridade: Could.

## 12. Requisitos Nao Funcionais

## 12.1 Performance

- API suite pequena deve rodar em segundos.
- Web smoke deve mirar menos de 5 minutos.
- Runner deve ter timeout global e por step.

## 12.2 Confiabilidade

- Falha de um teste não deve impedir report final.
- Artifacts devem ser salvos quando possível.
- Erro de infra deve ser separado de assertion failure.

## 12.3 Segurança

- Secrets nunca em plaintext no report.
- Redaction de `Authorization`, `Cookie`, `Set-Cookie`, senha, token, api key.
- Allowlist de hosts no futuro.
- Chaves de IA como secrets no futuro.

## 12.4 Manutenibilidade

- Engines separadas.
- Spec validator isolado.
- Reporter isolado.
- CLI fino.
- Types compartilhados.

## 13. Stack Tecnica Recomendada

## 13.1 MVP Runner/CLI

- TypeScript.
- Node 22+.
- Commander.
- YAML.
- Zod.
- Playwright.
- AJV.
- TSX para dev.

## 13.2 Plataforma Futura

- Monorepo `pnpm` + Turborepo.
- Next.js para dashboard.
- Fastify para API.
- Drizzle + Postgres.
- Redis + BullMQ.
- MinIO/S3 para artifacts.
- Pino + OpenTelemetry.
- Docker.

## 13.3 Estrutura Alvo

```text
apps/
  web
  api
  worker
  cli
packages/
  spec
  runner
  db
  shared
  ai
  artifacts
```

## 14. Arquitetura Futura

```text
Dashboard Web
  |
Backend API
  |-- Projects
  |-- Environments
  |-- Suites
  |-- Runs
  |-- Artifacts
  |-- Secrets
  |
Queue
  |
Runner Worker
  |-- Web Engine (Playwright)
  |-- API Engine (HTTP + AJV)
  |-- Artifact Collector
  |
Storage
  |-- Postgres
  |-- S3/MinIO/local filesystem
```

## 15. AI Test Assistant Opcional

## 15.1 Princípio

IA e módulo opcional. Se desligada, todo runner/CLI/dashboard continua funcionando. IA só ajuda usuário.

## 15.2 Connections

Providers:

- OpenRouter.
- Anthropic.
- OpenAI.

Requisitos:

- habilitar/desabilitar globalmente;
- connection default global;
- connection por projeto no futuro;
- modelo/max tokens/timeout/temperatura configuraveis;
- API keys tratadas como secrets;
- adapter por provider.

## 15.3 Casos Priorizados

### 15.3.1 Resumo, Explicação e Classificação de Falha

Entrada:

- erro do runner;
- step falho;
- screenshot/DOM summary;
- console logs;
- request/response;
- histórico recente.

Classes:

- `app_bug`
- `test_broken`
- `environment_down`
- `auth_or_secret`
- `data_issue`
- `contract_changed`
- `flaky`
- `unknown`

Saida:

```json
{
  "classification": "auth_or_secret",
  "confidence": 0.76,
  "summary": "Login não concluiu porque API /auth retornou 401.",
  "evidence": [
    "Step 3 falhou apos clicar Entrar",
    "Response /auth/login = 401",
    "URL permaneceu /login"
  ],
  "nextAction": "Validar CRM_USER/CRM_PASS do ambiente hml"
}
```

### 15.3.2 Sugerir Correcao de Teste

Uso: teste quebrou por seletor/texto/rota.

Entrada:

- spec atual;
- step falho;
- erro Playwright;
- screenshot;
- DOM snapshot/accessibility tree;
- URL atual.

Saida:

```yaml
suggestion:
  type: update_step
  reason: "Botao mudou de texto: Entrar -> Acessar"
  before:
    click: { by: text, target: Entrar }
  after:
    click: { by: role, role: button, name: Acessar }
  confidence: 0.82
```

Regra: IA sugere, humano aprova.

### 15.3.3 Refinar e Sugerir Testes

Uso: melhorar cobertura com poucos testes de alto valor.

Entrada:

- spec existente;
- descrição do sistema;
- OpenAPI opcional;
- histórico de falhas;
- tags/criticidade.

Saida:

```yaml
suggestions:
  - name: login invalido
    reason: "Fluxo auth tem apenas casó feliz"
    priority: High
    type: web
    proposedSteps:
      - goto: /login
      - fill: { by: label, target: Email, value: usuário_invalido }
      - fill: { by: label, target: Senha, value: senha_inválida }
      - click: { by: role, role: button, name: Entrar }
      - expectText: Invalid email or password
```

## 15.4 Guardrails IA

- sem secrets;
- sem auto-apply;
- output validado por schema;
- timeout obrigatorio;
- erro de IA não falha run;
- prompt/output auditaveis com redaction;
- pass/fail sempre deterministicos.

## 16. MCP Futuro

## 16.1 Objetivo

Permitir que IDEs e agentes chamem TestHub de forma estruturada.

## 16.2 Arquitetura

```text
IDE / Agent MCP Client
  |
TestHub MCP Server
  |
TestHub REST API
  |
Queue
  |
Runner Worker
```

## 16.3 Tools Propostas

| Tool | Descrição |
| --- | --- |
| `testhub_list_projects` | Lista projetos |
| `testhub_list_environments` | Lista ambientes |
| `testhub_list_suites` | Lista suites |
| `testhub_validate_spec` | Valida spec |
| `testhub_run_suite` | Dispara run |
| `testhub_get_run_status` | Consulta status |
| `testhub_get_run_report` | Retorna resumo |
| `testhub_get_artifacts` | Lista artifacts |

## 16.4 Regras MCP

- MCP não executa browser.
- MCP não acessa secrets.
- MCP chama API.
- Auth via token.
- Fora do MVP.

## 17. Roadmap

## Fase 0 - Runner/CLI

- parser YAML;
- validator Zod;
- web runner Playwright;
- API runner AJV;
- report JSON/HTML;
- artifacts locais;
- examples.

## Fase 1 - Core CLI

- `testhub validate`;
- `testhub run`;
- env vars;
- exit codes;
- CI examples.

## Fase 2 - API/DB

- Fastify API;
- Postgres/Drizzle;
- projetos;
- ambientes;
- suites;
- runs;
- upload report.

## Fase 3 - Worker/Queue

- Redis/BullMQ;
- worker separado;
- heartbeat;
- timeout;
- cancelamento;
- artifact storage.

## Fase 4 - Dashboard

- Next.js;
- projetos;
- ambientes;
- suites;
- runs;
- detalhe run;
- Monaco YAML editor;
- botao Run.

## Fase 5 - Segurança Empresa

- OIDC/Auth.js;
- RBAC simples;
- secrets criptografados;
- redaction;
- audit log;
- retention.

## Fase 6 - IA Opcional

- connections OpenRouter/Anthropic/OpenAI;
- context builder;
- sanitizer;
- explain failure;
- suggest test fix;
- suggest test cases.

## Fase 7 - MCP

- MCP server;
- tools run/status/report;
- auth token;
- docs para IDE/agentes.

## 18. Criterios de Aceite MVP

MVP aceito quando:

- `testhub validate` funciona.
- `testhub run` executa web spec.
- `testhub run` executa API spec.
- Web failure gera screenshot.
- API failure gera request/response sanitizados.
- JSON report gerado.
- HTML report gerado.
- Exit codes corretos.
- Variáveis `${VAR}` resolvidas.
- Secrets mascarados.
- Exemplos funcionam.
- Documentação explica primeira suite.

## 19. Riscos

## R-001 - Flaky UI

Mitigação: Playwright auto-wait, selectors robustos, timeout claro, retry controlado no futuro.

## R-002 - Ambiente instavel

Mitigação: classificar infra error separado de assertion failure; health check futuro.

## R-003 - Vazamento de secret

Mitigação: redaction agressivo e testes de mascaramento.

## R-004 - Escopo crescer demais

Mitigação: runner/CLI primeiro; dashboard/IA/MCP depois.

## R-005 - Lock-in IA

Mitigação: IA opcional, connections plugáveis, fallback sem IA.

## 20. Decisoes

| ID | Decisao | Alternativas | Motivo |
| --- | --- | --- | --- |
| D-001 | Aplicacao alvo já roda em ambiente | TestHub subir app | Reduz complexidade |
| D-002 | Web Smoke + API Contract | apenas web/API | Cobre legado e APIs novas |
| D-003 | YAML declarativo | Playwright code direto | Padrão comum para dev/QA |
| D-004 | TypeScript | Python/Go | Coesao UI/API/CLI/runner |
| D-005 | Playwright | Cypress/Selenium | Traces, video, auto-wait |
| D-006 | AJV/JSON Schema | assert manual | Contrato padronizado |
| D-007 | Runner separado | API executando teste | Robustez operacional |
| D-008 | IA opcional | IA core | Sem dependencia externa |
| D-009 | MCP futuro | MCP MVP | Evita distracao |
| D-010 | Connections OpenRouter/Anthropic/OpenAI | provider único | Evita lock-in |
