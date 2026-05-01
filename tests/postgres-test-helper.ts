import pg from 'pg';

const { Pool } = pg;

let migratePromise: Promise<void> | undefined;

export async function resetPostgresTestDatabase(): Promise<void> {
  await migratePostgresTestDatabase();
  const pool = new Pool({ connectionString: databaseUrl() });
  try {
    await pool.query(`
      truncate table
        run_jobs,
        runs,
        suites,
        environments,
        flow_library,
        ai_connections,
        personal_access_tokens,
        password_reset_tokens,
        auth_sessions,
        organization_memberships,
        projects,
        organizations,
        users
      cascade
    `);
  } finally {
    await pool.end();
  }
}

export async function setRunReportPath(runId: string, reportPath: string): Promise<void> {
  const pool = new Pool({ connectionString: databaseUrl() });
  try {
    await pool.query('update runs set report_path = $1 where id = $2', [reportPath, runId]);
  } finally {
    await pool.end();
  }
}

async function migratePostgresTestDatabase(): Promise<void> {
  migratePromise ??= import('../packages/db/src/migrate.js').then(() => undefined);
  await migratePromise;
}

function databaseUrl(): string {
  const value = process.env.DATABASE_URL;
  if (!value) throw new Error('DATABASE_URL obrigatorio para testes Postgres');
  return value;
}
