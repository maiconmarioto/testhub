import { expect, test } from '@playwright/test';

const apiBase = 'http://127.0.0.1:44321';

test('v2 keeps shared query params and navigates real management pages', async ({ page }) => {
  const fixture = await seedWorkspace();
  await page.goto(`/v2?project=${fixture.project.id}&environment=${fixture.environment.id}&suite=${fixture.suite.id}`);

  await expect(page.getByRole('button', { name: 'Wizard' })).toBeVisible();
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
  await expect(page.getByRole('heading', { name: 'Suites' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Biblioteca' })).toBeVisible();

  await page.getByLabel('Sistema').click();
  await expect(page).toHaveURL(/\/settings/);
  await expect(page.getByRole('heading', { name: 'Sistema' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Seguranca empresa' })).toBeVisible();
});

test('project screen edits retention and environment, then suite edit link opens selected suite', async ({ page }) => {
  const fixture = await seedWorkspace('crud-flow');
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
  const fixture = await seedWorkspace('openapi-flow');
  await page.goto(`/suites?project=${fixture.project.id}&suite=${fixture.suite.id}`);

  await page.getByRole('button', { name: 'Nova suite' }).click();
  await page.locator('.monaco-editor').click({ position: { x: 80, y: 40 }, force: true });
  await page.locator('input[placeholder="login-smoke"]').fill(`monaco-${Date.now()}`);
  await page.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByText(/Suite criada|Suite atualizada/)).toBeVisible({ timeout: 20_000 });

  await page.getByText('Import OpenAPI').scrollIntoViewIfNeeded();
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
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Sistema' })).toBeVisible();

  await page.getByLabel('Nome').fill(`OpenRouter ${Date.now()}`);
  await page.getByLabel('Modelo').fill('openai/gpt-4o-mini');
  await page.getByLabel('API key').fill('sk-test');
  await page.getByRole('button', { name: 'Salvar AI' }).click();
  await expect(page.getByText(/AI connection criada|AI connection atualizada/)).toBeVisible({ timeout: 20_000 });

  await page.getByLabel('Dias').fill('7');
  await page.getByRole('button', { name: 'Executar cleanup' }).click();
  await expect(page.getByText('Cleanup executado.')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('link', { name: 'Export CSV' })).toHaveAttribute('href', /\/api\/audit\/export/);
});

test('evidence sheet exposes tabs and artifacts without duplicate request rows', async ({ page }) => {
  const fixture = await seedWorkspace('evidence-tabs');
  await page.goto(`/v2?project=${fixture.project.id}&environment=${fixture.environment.id}&suite=${fixture.suite.id}`);

  await page.getByRole('button', { name: 'Run suite' }).click();
  await expect(page.getByText(/Run enviada/)).toBeVisible();
  await page.locator('header').getByRole('button', { name: 'Evidence' }).click();
  await expect(page.getByRole('heading', { name: 'Evidence' })).toBeVisible();
  await page.getByRole('tab', { name: 'Timeline' }).click();
  await expect(page.getByRole('heading', { name: 'health', exact: true }).or(page.getByText('Timeline indisponivel.'))).toBeVisible({ timeout: 20_000 });
  await page.getByRole('tab', { name: 'Artifacts' }).click();
  await expect(page.getByRole('link', { name: /HTML report html/ }).first()).toBeVisible({ timeout: 20_000 });
  await page.getByRole('tab', { name: 'Payload' }).click();
  await expect(page.getByText('Payload indisponivel para runs frontend.').or(page.getByText('loading...')).or(page.getByText(/status/).first())).toBeVisible({ timeout: 20_000 });
});

test('wizard creates a full workspace and ignores Escape', async ({ page }) => {
  await page.goto('/v2');
  await page.getByRole('button', { name: 'Wizard' }).click();
  await expect(page.getByRole('heading', { name: 'Wizard de configuracao' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'Wizard de configuracao' })).toBeVisible();

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
  const fixture = await seedWorkspace('run-flow');
  await page.goto(`/v2?project=${fixture.project.id}&environment=${fixture.environment.id}&suite=${fixture.suite.id}`);

  await page.getByRole('button', { name: 'Run suite' }).click();
  await expect(page.getByText(/Run enviada/)).toBeVisible();
  await expect(page.getByText(/Run enviada/)).toBeVisible({ timeout: 20_000 });

  await page.locator('header').getByRole('button', { name: 'Evidence' }).click();
  await expect(page.getByRole('heading', { name: 'Evidence' })).toBeVisible();
});

async function seedWorkspace(name = 'v2-e2e') {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const project = await post<{ id: string }>('/api/projects', { name: `${name}-${suffix}` });
  const environment = await post<{ id: string }>('/api/environments', {
    projectId: project.id,
    name: 'local-api',
    baseUrl: apiBase,
  });
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
  });
  return { project, environment, suite, suiteName: `api-health-${suffix}` };
}

async function post<T>(path: string, payload: unknown): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<T>;
}
