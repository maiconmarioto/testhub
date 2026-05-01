# TestHub

TestHub é uma plataforma para criar, organizar, executar e analisar testes de API e frontend a partir de suites em YAML.

A proposta é centralizar o ciclo de testes em um único lugar: projetos, ambientes, suites, execuções, evidências, usuários, organizações, tokens para agentes e uma biblioteca reutilizável de fluxos. Em vez de cada automação viver isolada em scripts locais, o TestHub trata testes como ativos compartilhados por time.

## Produto

O TestHub foi desenhado para times que precisam manter testes funcionais e integrações de forma organizada, auditável e reutilizável.

Principais capacidades:

- Execução de testes Web com Playwright.
- Execução de testes de API.
- Suites YAML versionáveis.
- Projetos e ambientes por organização/time.
- Evidências por execução e por cenário: vídeo, trace, screenshots, console logs e payloads.
- Flow Library para reaproveitar jornadas comuns, como login, setup e navegação.
- Editor visual com syntax highlight para YAML.
- Autenticação local, RBAC, organizações e tokens pessoais.
- MCP para agentes de IA criarem e executarem testes de forma controlada.
- Assistência opcional de IA para explicar falhas e sugerir ajustes.

## Como o TestHub organiza os testes

```text
Organização
  Projeto
    Ambiente
    Suite
      Cenários
        Steps
    Runs
      Evidências
```

Uma suite pode chamar flows reutilizáveis da organização, por exemplo `auth.login`, evitando duplicar login e setup em vários arquivos YAML.

## Arquitetura

O repositório é um monorepo TypeScript:

```text
apps/
  web       Console web em Next.js
  api       API Fastify
  worker    Executor assíncrono de runs
  cli       CLI para validação, execução e manutenção
  mcp       Servidor MCP para agentes

packages/
  runner     Runner API/Web e geração de reports
  spec       Parser e validação de specs YAML
  db         Store, migrations, auth e secrets
  artifacts  Armazenamento/localização de artifacts
  ai         Integrações opcionais de IA
  shared     Tipos e utilitários compartilhados
```

Stack principal:

- Node.js 22+
- TypeScript
- Next.js
- Fastify
- Playwright
- Postgres
- Go API + Postgres job table
- MinIO/S3
- Monaco Editor
- MCP SDK

## Rodando localmente

Instale dependências:

```bash
npm install
npx playwright install chromium
```

Crie o `.env`:

```bash
cp .env.example .env
```

Suba backend, banco, fila e storage via Docker:

```bash
docker compose up --build
```

Rode o frontend localmente:

```bash
npm run web
```

Acesse:

```text
http://localhost:3333
```

API:

```text
http://localhost:4321
http://localhost:4321/docs
```

## Primeiro acesso

Com `TESTHUB_AUTH_MODE=local`, o primeiro usuário cadastrado vira administrador e cria a organização inicial.

Fluxo básico:

1. Criar conta em `/register`.
2. Criar ou selecionar um projeto.
3. Criar um ambiente com a URL alvo.
4. Criar uma suite YAML.
5. Executar a suite.
6. Analisar evidências por cenário.

## Documentação do produto

A documentação completa de uso fica dentro da própria aplicação:

```text
/docs
```

Lá estão os exemplos de sintaxe YAML, steps Web, testes API, Flow Library, MCP, autenticação, evidências, debugging e boas práticas.

O README fica propositalmente enxuto. Ele descreve o produto, arquitetura e bootstrap local. A documentação operacional vive no TestHub.

## MCP

O MCP do TestHub é voltado para criação e execução agentica de testes YAML.

Ele permite que um agente:

- Consulte contexto de projetos, ambientes, suites e runs.
- Crie projetos e ambientes.
- Crie e atualize suites.
- Consulte e mantenha flows reutilizáveis.
- Execute suites.
- Leia status, reports e artifacts.

Gestão de usuários, tokens pessoais, conexões de IA, cleanup e importações administrativas ficam na aplicação web/API, não no MCP.

Exemplo de execução:

```bash
TESTHUB_URL=http://localhost:4321 \
TESTHUB_PAT=th_pat_xxx \
npm run mcp
```

## Desenvolvimento

Comandos úteis:

```bash
npm run typecheck
npm test
npm run build
npm run web:build
```

Serviços individuais:

```bash
npm run server
npm run worker
npm run mcp
```

## Observação sobre Docker

Quando o runner está dentro do Docker, `localhost` aponta para o container, não para a máquina host.

Para testar uma aplicação rodando localmente fora do Docker, use:

```text
http://host.docker.internal:<porta>
```

Para testar outro serviço dentro do mesmo `docker-compose`, use o nome do serviço:

```text
http://api:4000
http://web:3000
```

## Licença

Licença ainda não publicada.
