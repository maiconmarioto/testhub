'use client';

import { useMemo } from 'react';
import type React from 'react';
import { InfoLine } from '../shared/ui';
import { CodeBlock, DocCallout, DocHero, DocPanel, DocStep } from './documentationPrimitives';

export type DocumentationItem = {
  id: string;
  group: string;
  title: string;
  description: string;
  tags: string[];
  content: React.ReactNode;
};

export function useDocumentationItems(): DocumentationItem[] {
  return useMemo(() => ([
    {
      id: 'quickstart',
      group: 'Comece',
      title: 'Quickstart',
      description: 'Do zero até a primeira execução com evidence.',
      tags: ['projeto', 'ambiente', 'suite', 'run'],
      content: (
        <div className="grid gap-5">
          <DocHero title="Documentação TestHub" description="Guia operacional para criar, reutilizar, executar e depurar testes API e Web com organizações, ambientes, Flow Library, MCP e IA." />
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <DocStep title="1. Projeto" text="Crie o workspace do produto ou squad." />
            <DocStep title="2. Ambiente" text="Cadastre baseUrl e variáveis seguras." />
            <DocStep title="3. Suite" text="Escreva YAML API ou Web e valide." />
            <DocStep title="4. Run" text="Execute, revise linha do tempo, artefatos e relatório." />
          </div>
          <DocPanel title="Primeira suite API">
            <CodeBlock code={`version: 1
type: api
name: api-smoke
tests:
  - name: health
    request:
      method: GET
      path: /health
    expect:
      status: 200`} />
          </DocPanel>
        </div>
      ),
    },
    {
      id: 'concepts',
      group: 'Fundamentos',
      title: 'Modelo mental',
      description: 'Como as peças se conectam.',
      tags: ['organização', 'rbac', 'evidence', 'retention'],
      content: (
        <div className="grid gap-4">
          <DocPanel title="Hierarquia">
            <div className="grid gap-3 md:grid-cols-2">
              <InfoLine label="Organização" value="Escopo de usuários, projetos, flows, AI e audit." />
              <InfoLine label="Projeto" value="Agrupa ambientes, suites e runs." />
              <InfoLine label="Ambiente" value="baseUrl + variables/secrets para execução." />
              <InfoLine label="Suite" value="YAML versionado via UI ou MCP." />
              <InfoLine label="Execuções" value="Execução com status, linha do tempo e artefatos." />
              <InfoLine label="Flow Library" value="Flows web compartilhados pela organização." />
            </div>
          </DocPanel>
          <DocPanel title="Permissões">
            <div className="grid gap-2 text-sm text-[#4b5348]">
              <p><strong>admin</strong>: gerencia usuários, organizações, tokens, AI, flows e recursos.</p>
              <p><strong>editor</strong>: cria/edita projetos, ambientes, suites, flows e runs.</p>
              <p><strong>viewer</strong>: consulta recursos e evidence.</p>
            </div>
          </DocPanel>
        </div>
      ),
    },
    {
      id: 'web',
      group: 'YAML',
      title: 'Web suites',
      description: 'Sintaxe web baseada em Playwright.',
      tags: ['goto', 'click', 'fill', 'expect', 'extract'],
      content: (
        <div className="grid gap-4">
          <DocPanel title="Passos web suportados">
            <CodeBlock code={`steps:
  - goto: /login
  - fill:
      by: label
      target: Email
      value: qa@example.com
  - click:
      by: role
      role: button
      name: Entrar
  - expectVisible:
      by: role
      role: heading
      name: Dashboard
  - expectText: Dashboard
  - expectUrlContains: /dashboard
  - expectAttribute:
      by: testId
      target: submit
      attribute: disabled
      value: "true"
  - expectValue:
      by: label
      target: Email
      value: qa@example.com
  - expectCount:
      selector: .todo-item
      count: 3
  - uploadFile:
      selector: input[type="file"]
      path: ./fixtures/avatar.png`} />
          </DocPanel>
          <DocPanel title="Seletores recomendados">
            <CodeBlock code={`# Preferidos: estáveis e acessíveis
by: role
by: label
by: testId
by: placeholder
by: text

# CSS direto: use quando não houver alternativa melhor
selector: '[data-testid="save"]'`} />
          </DocPanel>
        </div>
      ),
    },
    {
      id: 'api',
      group: 'YAML',
      title: 'API suites',
      description: 'Requests HTTP, asserts e extração.',
      tags: ['request', 'expect', 'extract', 'schema'],
      content: (
        <div className="grid gap-4">
          <DocPanel title="Request, expect e extract">
            <CodeBlock code={`tests:
  - name: login extrai token
    request:
      method: POST
      path: /login
      body:
        email: qa@example.com
        password: \${USER_PASSWORD}
    expect:
      status: 200
      maxMs: 1500
      bodyPathExists:
        - token
      bodyPathMatches:
        token: "^ey"
    extract:
      AUTH_TOKEN: body.token

  - name: usa token
    request:
      method: GET
      path: /me
      headers:
        Authorization: Bearer \${AUTH_TOKEN}
    expect:
      status: 200`} />
          </DocPanel>
          <DocPanel title="JSON Schema">
            <CodeBlock code={`expect:
  status: 201
  jsonSchema:
    type: object
    required: [id, email]
    properties:
      id:
        type: string
      email:
        type: string`} />
          </DocPanel>
        </div>
      ),
    },
    {
      id: 'flows',
      group: 'Reuso',
      title: 'Flow Library',
      description: 'Flows web compartilhados por organização.',
      tags: ['flows', 'use', 'with', 'auth.login'],
      content: (
        <div className="grid gap-4">
          <DocPanel title="Criar flow compartilhado">
            <CodeBlock code={`# Menu Flow Library
namespace: auth
name: login
params:
  email: \${USER_EMAIL}
  password: \${USER_PASSWORD}
steps:
  - goto: /login
  - fill:
      by: label
      target: Email
      value: \${email}
  - fill:
      by: label
      target: Senha
      value: \${password}
  - click:
      by: role
      role: button
      name: Entrar`} />
          </DocPanel>
          <DocPanel title="Usar em várias suites">
            <CodeBlock code={`version: 1
type: web
name: checkout
tests:
  - name: checkout autenticado
     steps:
      - use: auth.login
        with:
          email: qa@example.com
      - goto: /checkout
      - expectText: Finalizar compra`} />
          </DocPanel>
          <DocCallout title="Precedência" text="Flows locais em `flows:` continuam funcionando e vencem a biblioteca quando o nome exato for igual. Referências com namespace, como `auth.login`, buscam a Flow Library." />
        </div>
      ),
    },
    {
      id: 'extract',
      group: 'Reuso',
      title: 'Extract web',
      description: 'Capture dados dinâmicos da tela.',
      tags: ['ORDER_ID', 'attribute', 'url'],
      content: (
        <DocPanel title="Capturas disponíveis">
          <CodeBlock code={`steps:
  - extract:
      as: ORDER_ID
      from:
        by: testId
        target: order-id
      property: text
  - extract:
      as: EMAIL
      from:
        by: label
        target: Email
      property: value
  - extract:
      as: DETAIL_URL
      from:
        by: testId
        target: order-link
      property: attribute
      attribute: href
  - extract:
      as: CURRENT_URL
      property: url
  - goto: \${DETAIL_URL}
  - expectText: \${ORDER_ID}`} />
        </DocPanel>
      ),
    },
    {
      id: 'envs',
      group: 'Operação',
      title: 'Ambientes e secrets',
      description: 'Como passar configuração sem vazar segredo.',
      tags: ['baseUrl', 'variables', 'secrets'],
      content: (
        <div className="grid gap-4">
          <DocPanel title="Variáveis de ambiente">
            <CodeBlock code={`# Ambiente
USER_EMAIL=qa@example.com
USER_PASSWORD=secret
API_TOKEN=secret

# YAML
headers:
  Authorization: Bearer \${API_TOKEN}`} />
          </DocPanel>
          <DocCallout title="Regra" text="Secrets ficam no ambiente. YAML deve usar placeholders. Reports passam por redaction antes de IA e UI." />
        </div>
      ),
    },
    {
      id: 'runs',
      group: 'Operação',
      title: 'Execuções e evidências',
      description: 'Status, linha do tempo e artefatos.',
      tags: ['report', 'video', 'trace', 'screenshot'],
      content: (
        <div className="grid gap-4">
          <DocPanel title="Estados">
            <div className="grid gap-2 text-sm text-[#4b5348]">
              <p><strong>queued/running</strong>: aguardando ou executando.</p>
              <p><strong>passed/failed</strong>: teste terminou com asserts ok ou falhando.</p>
              <p><strong>error</strong>: erro de spec, ambiente, infraestrutura ou runtime.</p>
              <p><strong>canceled/deleted</strong>: cancelada ou arquivada por cleanup.</p>
            </div>
          </DocPanel>
          <DocPanel title="Health check e progresso live">
            <div className="grid gap-2 text-sm text-[#4b5348]">
              <p>Antes de enfileirar uma run, o TestHub valida se o `baseUrl` do ambiente responde HTTP dentro de `TESTHUB_ENV_HEALTH_TIMEOUT_MS`.</p>
              <p>Qualquer resposta HTTP conta como ambiente alcançável. DNS, conexão recusada, TLS e timeout bloqueiam a run com status `error`.</p>
              <p>Durante a execução, Evidências mostra cenário atual, step atual, contadores e último heartbeat usando o polling da interface.</p>
            </div>
          </DocPanel>
          <DocPanel title="Checklist de debug">
            <CodeBlock code={`1. Abra Evidências
2. Veja erro principal e timeline
3. API: request/response/payload
4. Web: screenshot/video/trace
5. Confirme baseUrl e variables do ambiente
6. Ajuste suite, flow ou ambiente
7. Rode novamente`} />
          </DocPanel>
        </div>
      ),
    },
    {
      id: 'production',
      group: 'Operação',
      title: 'Produção',
      description: 'Checklist para subir TestHub com postura segura e previsível.',
      tags: ['produção', 'docker', 'postgres', 'jobs', 's3', 'backup', 'security'],
      content: (
        <div className="grid gap-4">
          <DocPanel title="Checklist obrigatório">
            <CodeBlock code={`TESTHUB_SECRET_KEY=valor-forte-não-default
TESTHUB_AUTH_MODE=local
TESTHUB_CORS_ORIGINS=https://testhub.suaempresa.com
TESTHUB_ALLOWED_HOSTS=app.hml.suaempresa.com,api.hml.suaempresa.com
	DATABASE_URL=postgres://...
S3_ENDPOINT=https://...
S3_BUCKET=testhub-artifacts
TESTHUB_RETENTION_DAYS=30
TESTHUB_ENV_HEALTH_TIMEOUT_MS=5000`} />
          </DocPanel>
          <DocPanel title="Runbook objetivo">
            <div className="grid gap-2 text-sm text-[#4b5348]">
              <p><strong>Banco</strong>: usar Postgres gerenciado, backup diário e restore testado.</p>
              <p><strong>Fila</strong>: usar a tabela Postgres de jobs para worker assíncrono.</p>
              <p><strong>Artefatos</strong>: usar S3/MinIO com lifecycle policy, versionamento conforme necessidade e backup se evidência for auditável.</p>
              <p><strong>Networking</strong>: API e worker precisam resolver os hosts permitidos em `TESTHUB_ALLOWED_HOSTS`; em Docker, valide nomes internos e `host.docker.internal` quando usado.</p>
              <p><strong>PAT</strong>: criar tokens por usuário/organização, revogar tokens antigos e evitar tokens pessoais compartilhados.</p>
              <p><strong>Retention</strong>: combinar `TESTHUB_RETENTION_DAYS`, cleanup de projeto e política do bucket.</p>
            </div>
          </DocPanel>
          <DocCallout title="Sem bloqueio de startup" text="Nesta v1 o TestHub mostra readiness e alertas claros, mas não impede startup automaticamente." />
        </div>
      ),
    },
    {
      id: 'mcp',
      group: 'Automação',
      title: 'MCP',
      description: 'Criar, validar e executar suites YAML por agentes.',
      tags: ['MCP', 'PAT', 'YAML', 'agent'],
      content: (
        <div className="grid gap-4">
          <DocPanel title="Configurar MCP em agente">
            <CodeBlock code={`{
  "mcpServers": {
    "testhub": {
      "command": "npx",
      "args": ["testhub-mcp"],
      "env": {
        "TESTHUB_URL": "http://localhost:4321",
        "TESTHUB_PAT": "th_pat_xxx",
        "TESTHUB_ORGANIZATION_ID": "<org-id-opcional>"
      }
    }
  }
}`} />
          </DocPanel>
          <DocPanel title="Fluxo MCP recomendado">
            <CodeBlock code={`1. testhub_help()
2. testhub_list_projects()
3. testhub_list_flows({ "namespace": "auth" })
4. testhub_get_spec_examples({ "example": "web-library-flow" })
5. testhub_validate_spec({ "specContent": "..." })
6. testhub_create_suite ou testhub_update_suite
7. testhub_run_suite
8. testhub_wait_run
9. testhub_get_run_report`} />
          </DocPanel>
          <DocCallout title="IA" text="A IA não executa testes. Ela usa relatório, linha do tempo, artefatos e redaction para explicar falhas ou sugerir ajustes." />
          <DocCallout title="Escopo do MCP" text="O MCP não gerencia usuários, tokens, OpenAPI import, cleanup ou AI connections. Essas operações ficam na aplicação. O MCP fica focado em projetos, ambientes, Flow Library, suites YAML, runs e evidence." />
        </div>
      ),
    },
    {
      id: 'reference',
      group: 'Referência',
      title: 'Referência rápida',
      description: 'Campos YAML e erros comuns.',
      tags: ['defaults', 'hooks', 'errors'],
      content: (
        <div className="grid gap-4">
          <DocPanel title="Campos principais">
            <CodeBlock code={`version: 1
type: api | web
name: minha-suite
description: opcional
baseUrl: https://app.example.com
variables: {}
defaults:
  timeoutMs: 10000
  retries: 1
  screenshotOnFailure: true
  video: retain-on-failure
  trace: retain-on-failure
beforeEach: []
afterEach: []
flows: {}
tests: []`} />
            <DocCallout title="Timeout" text="`defaults.timeoutMs` controla navegação, clicks, fills, expects e extract. Para telas lentas, use valores maiores como `60000` ou `90000`; também é possível sobrescrever por teste com `timeoutMs`." />
          </DocPanel>
          <DocPanel title="Erros comuns">
            <div className="grid gap-2 text-sm text-[#4b5348]">
              <p><strong>flow não encontrado</strong>: `use` não existe localmente nem na Flow Library.</p>
              <p><strong>ciclo em flows</strong>: um flow chama outro que volta para ele.</p>
              <p><strong>Variável obrigatória ausente</strong>: placeholder sem valor em ambiente, params, variables ou extract.</p>
              <p><strong>extract attribute requer attribute</strong>: informe o nome do atributo.</p>
            </div>
          </DocPanel>
        </div>
      ),
    },
  ]), []);
}
