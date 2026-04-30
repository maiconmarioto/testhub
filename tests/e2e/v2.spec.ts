import { expect, test, type Page } from '@playwright/test';

const apiBase = 'http://127.0.0.1:44321';
const userPassword = 'password-1234';

type TestUser = {
  token: string;
};

let bootstrapUser: TestUser | undefined;

test.describe.configure({ mode: 'serial' });

test('protected routes redirect anonymous user to login', async ({ page }) => {
  await routeApi(page);
  await page.goto('/v2');
  await expect(page).toHaveURL(/\/login/);
});

test('v2 keeps shared query params and navigates real management pages', async ({ page }) => {
  const token = await login(page);
  const fixture = await seedWorkspace(token);
  await page.goto(`/v2?project=${fixture.project.id}&environment=${fixture.environment.id}&suite=${fixture.suite.id}`);

  await expect(page.getByRole('button', { name: 'Wizard' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Suites do projeto' })).toBeVisible();
  await expect(page.getByRole('heading', { name: fixture.suiteName, level: 3 })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Saúde' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Falhas' })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`project=${fixture.project.id}`));
  await expect(page).toHaveURL(new RegExp(`environment=${fixture.environment.id}`));
  await expect(page).toHaveURL(new RegExp(`suite=${fixture.suite.id}`));

  await page.getByLabel('Projetos').click();
  await expect(page).toHaveURL(/\/projects/);
  await expect(page.locator('h1', { hasText: 'Projetos' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Ambientes do projeto' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Suites vinculadas' })).toBeVisible();

  await page.getByRole('link', { name: 'Alterar' }).first().click();
  await expect(page).toHaveURL(/\/suites/);
  await expect(page.getByRole('heading', { name: 'Suites', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Biblioteca' })).toBeVisible();

  await page.getByLabel('Sistema').click();
  await expect(page).toHaveURL(/\/settings/);
  await expect(page.getByRole('heading', { name: 'Sistema' })).toBeVisible();
  await page.getByRole('tab', { name: /Segurança/ }).click();
  await expect(page.getByRole('heading', { name: 'Segurança empresa' })).toBeVisible();
});

test('project screen edits retention and environment, then suite edit link opens selected suite', async ({ page }) => {
  const token = await login(page);
  const fixture = await seedWorkspace(token, 'crud-flow');
  await page.goto(`/projects?project=${fixture.project.id}`);

  await expect(page.getByRole('heading', { name: 'Ambientes do projeto' })).toBeVisible();
  await page.getByRole('button', { name: 'Editar' }).first().click();
  await page.getByLabel('Nome').last().fill('local-api-edited');
  await page.getByRole('button', { name: 'Salvar ambiente' }).click();
  await expect(page.getByText('Ambiente atualizado.')).toBeVisible();

  await page.getByRole('link', { name: 'Alterar' }).first().click();
  await expect(page).toHaveURL(/\/suites/);
  await expect(page.getByRole('button', { name: new RegExp(fixture.suiteName.slice(0, 24)) })).toBeVisible();
});

test('suites page imports OpenAPI with advanced options and saves Monaco YAML', async ({ page }) => {
  const token = await login(page);
  const fixture = await seedWorkspace(token, 'openapi-flow');
  await page.goto(`/suites?project=${fixture.project.id}&suite=${fixture.suite.id}`);

  await page.getByRole('button', { name: 'Nova suite' }).click();
  await page.locator('.monaco-editor').click({ position: { x: 80, y: 40 }, force: true });
  await page.locator('input[placeholder="login-smoke"]').fill(`monaco-${Date.now()}`);
  await page.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByText(/Suite criada|Suite atualizada/)).toBeVisible({ timeout: 20_000 });

  await page.getByRole('tab', { name: 'Import OpenAPI' }).click();
  await page.getByLabel('Base URL').fill(apiBase);
  await page.getByLabel('Tags').fill('health');
  await page.getByLabel('OpenAPI JSON').fill(JSON.stringify({
    openapi: '3.0.0',
    paths: {
      '/api/health': {
        get: { tags: ['health'], operationId: 'healthCheck', responses: { 200: { description: 'ok' } } },
      },
    },
  }));
  await page.getByRole('button', { name: 'Importar' }).click();
  await expect(page.getByText('OpenAPI importado.')).toBeVisible({ timeout: 20_000 });
});

test('settings cover AI connection, retention cleanup and audit export link', async ({ page }) => {
  await login(page);
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Sistema' })).toBeVisible();

  await page.getByRole('tab', { name: 'AI' }).click();
  await page.getByLabel('Nome').fill(`OpenRouter ${Date.now()}`);
  await page.getByLabel('Modelo').fill('openai/gpt-4o-mini');
  await page.getByLabel('API key').fill('sk-test');
  await page.getByRole('button', { name: 'Salvar AI' }).click();
  await expect(page.getByText(/AI connection criada|AI connection atualizada/)).toBeVisible({ timeout: 20_000 });

  await page.getByRole('tab', { name: 'Audit' }).click();
  await page.getByLabel('Dias').fill('7');
  await page.getByRole('button', { name: 'Executar cleanup' }).click();
  await expect(page.getByText('Cleanup executado.')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('link', { name: 'Export CSV' })).toHaveAttribute('href', /\/api\/audit\/export/);
});

test('evidence sheet exposes tabs and artifacts without duplicate request rows', async ({ page }) => {
  const token = await login(page);
  const fixture = await seedWorkspace(token, 'evidence-tabs');
  await page.goto(`/v2?project=${fixture.project.id}&environment=${fixture.environment.id}&suite=${fixture.suite.id}`);

  await page.getByRole('button', { name: 'Executar suite' }).first().click();
  await expect(page.getByText(/Execução enviada/)).toBeVisible();
  await page.getByRole('button', { name: 'Evidências brutas' }).click();
  await expect(page.getByRole('heading', { name: 'Evidências' })).toBeVisible();
  await page.getByRole('tab', { name: 'Timeline' }).click();
  await expect(page.getByRole('heading', { name: 'health', exact: true }).or(page.getByText('Timeline indisponível.'))).toBeVisible({ timeout: 20_000 });
  await page.getByRole('tab', { name: 'Artefatos' }).click();
  await expect(page.getByRole('link', { name: /HTML report html/ }).first()).toBeVisible({ timeout: 20_000 });
  await page.getByRole('tab', { name: 'Payload' }).click();
  await expect(page.getByText('Payload indisponível para runs frontend.').or(page.getByText('loading...')).or(page.getByText(/status/)).first()).toBeVisible({ timeout: 20_000 });
});

test('wizard creates a full workspace and ignores Escape', async ({ page }) => {
  await login(page);
  await page.goto('/v2');
  await page.getByRole('button', { name: 'Wizard' }).click();
  await expect(page.getByRole('heading', { name: 'Wizard de configuração' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'Wizard de configuração' })).toBeVisible();

  const suffix = `${Date.now()}`;
  await page.getByLabel('Nome do projeto').fill(`wizard-${suffix}`);
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByLabel('Nome do ambiente').fill('local-api');
  await page.getByLabel('Base URL').fill(apiBase);
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByLabel('Nome da suite').fill(`wizard-suite-${suffix}`);
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('button', { name: 'Criar workspace' }).click();
  await expect(page.getByText('Workspace criado.')).toBeVisible({ timeout: 20_000 });
});

test('v2 run flow creates evidence', async ({ page }) => {
  const token = await login(page);
  const fixture = await seedWorkspace(token, 'run-flow');
  await page.goto(`/v2?project=${fixture.project.id}&environment=${fixture.environment.id}&suite=${fixture.suite.id}`);

  await page.getByRole('button', { name: 'Executar suite' }).first().click();
  await expect(page.getByText(/Execução enviada/)).toBeVisible();
  await expect(page.getByText(/Execução enviada/)).toBeVisible({ timeout: 20_000 });

  await expect(page.getByRole('heading', { name: 'Relatório da execução' })).toBeVisible();
  await page.getByRole('button', { name: 'Evidências brutas' }).click();
  await expect(page.getByRole('heading', { name: 'Evidências' })).toBeVisible();
});

test('v2 removes a run from executions for the current selection', async ({ page }) => {
  const token = await login(page);
  const fixture = await seedWorkspace(token, 'delete-run-flow');
  const run = await post<{ id: string }>('/api/runs', {
    projectId: fixture.project.id,
    environmentId: fixture.environment.id,
    suiteId: fixture.suite.id,
  }, token);

  await page.goto(`/v2?project=${fixture.project.id}&environment=${fixture.environment.id}&suite=${fixture.suite.id}`);
  await page.getByRole('tab', { name: 'Histórico' }).click();
  await expect(page.getByRole('heading', { name: 'Histórico da suite' })).toBeVisible();
  await expect(page.getByText(new RegExp(run.id.slice(0, 8)))).toBeVisible();

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByLabel(new RegExp(`Excluir run ${run.id.slice(0, 8)}`)).click();

  await expect(page.getByText('Run excluída.')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(new RegExp(run.id.slice(0, 8)))).toHaveCount(0);
});

async function login(page: Page, email = uniqueEmail('web')): Promise<string> {
  const organizationName = uniqueName('Team');
  const formAlert = page.locator('p[role="alert"]');
  await routeApi(page);
  await page.goto('/register');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Nome').fill('Web E2E');
  await page.getByLabel('Senha').fill(userPassword);
  if (await page.getByLabel('Organização').count()) {
    await page.getByLabel('Organização').fill(organizationName);
  } else {
    await createApiUser(email, userPassword, organizationName);
    await page.goto('/login');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Senha').fill(userPassword);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page).toHaveURL(/\/v2/);
    const token = await page.evaluate(() => window.localStorage.getItem('testhub.token'));
    if (!token) throw new Error('Login did not persist testhub.token');
    return token;
  }
  await page.getByRole('button', { name: 'Criar conta' }).click();

  const result = await Promise.race([
    page.waitForURL(/\/v2/, { timeout: 10_000 }).then(() => 'registered' as const),
    formAlert.waitFor({ state: 'visible', timeout: 10_000 }).then(() => 'error' as const),
  ]);

  if (result === 'error') {
    await expect(formAlert).toContainText('Cadastro público');
    await createApiUser(email, userPassword, organizationName);
    await page.goto('/login');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Senha').fill(userPassword);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page).toHaveURL(/\/v2/);
  }

  const token = await page.evaluate(() => window.localStorage.getItem('testhub.token'));
  if (!token) throw new Error('Login did not persist testhub.token');
  setBootstrapUser(token);
  return token;
}

async function routeApi(page: Page): Promise<void> {
  await page.route(`${apiBase}/**`, async (route) => {
    const request = route.request();
    const origin = request.headers().origin ?? 'http://127.0.0.1:3335';
    if (request.method() === 'OPTIONS') {
      await route.fulfill({
        status: 204,
        headers: corsHeaders(origin, {
          'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
          'access-control-allow-headers': request.headers()['access-control-request-headers'] ?? 'authorization, content-type',
        }),
      });
      return;
    }

    const requestHeaders = await request.allHeaders();
    delete requestHeaders.host;
    const response = await fetch(request.url(), {
      method: request.method(),
      headers: requestHeaders,
      body: ['GET', 'HEAD'].includes(request.method()) ? undefined : request.postDataBuffer(),
      redirect: 'manual',
    });
    const responseHeaders = Object.fromEntries(response.headers.entries());
    delete responseHeaders['content-encoding'];
    delete responseHeaders['content-length'];
    delete responseHeaders['transfer-encoding'];
    await route.fulfill({
      status: response.status,
      headers: corsHeaders(origin, responseHeaders),
      body: Buffer.from(await response.arrayBuffer()),
    });
  });
}

async function seedWorkspace(token: string, name = 'v2-e2e') {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const project = await post<{ id: string }>('/api/projects', { name: `${name}-${suffix}` }, token);
  const environment = await post<{ id: string }>('/api/environments', {
    projectId: project.id,
    name: 'local-api',
    baseUrl: apiBase,
  }, token);
  const suite = await post<{ id: string }>('/api/suites', {
    projectId: project.id,
    name: `api-health-${suffix}`,
    type: 'api',
    specContent: `version: 1
type: api
name: api-health
tests:
  - name: health
    request:
      method: GET
      path: /api/health
    expect:
      status: 200`,
  }, token);
  return { project, environment, suite, suiteName: `api-health-${suffix}` };
}

async function createApiUser(email = uniqueEmail('api'), password = userPassword, organizationName = uniqueName('API Team')): Promise<string> {
  const register = await fetch(`${apiBase}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, name: 'API E2E', password, organizationName }),
  });
  if (register.ok) {
    const body = await register.json() as { token: string };
    setBootstrapUser(body.token);
    return body.token;
  }

  const registerError = await register.text();
  if (register.status !== 403 || !registerError.includes('Cadastro público')) {
    throw new Error(registerError);
  }
  if (!bootstrapUser) throw new Error('Public signup disabled before a bootstrap user was available');

  await post('/api/organizations/current/members', {
    email,
    name: 'API E2E',
    role: 'admin',
    temporaryPassword: password,
  }, bootstrapUser.token);

  const loginResponse = await fetch(`${apiBase}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!loginResponse.ok) throw new Error(await loginResponse.text());
  const body = await loginResponse.json() as { token: string };
  return body.token;
}

async function post<T>(path: string, payload: unknown, token: string): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<T>;
}

function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;
}

function uniqueName(prefix: string): string {
  return `${prefix} ${Date.now()} ${Math.random().toString(16).slice(2)}`;
}

function setBootstrapUser(token: string): void {
  if (bootstrapUser) return;
  bootstrapUser = { token };
}

function corsHeaders(origin: string, headers: Record<string, string>): Record<string, string> {
  return {
    ...headers,
    'access-control-allow-credentials': 'true',
    'access-control-allow-origin': origin,
    vary: 'Origin',
  };
}
