import pg from 'pg';

const { Pool } = pg;

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL obrigatorio');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const statements = [
  `create table if not exists projects (id text primary key, name text not null, description text, retention_days integer, cleanup_artifacts boolean, status text not null, created_at timestamptz not null, updated_at timestamptz not null)`,
  `create table if not exists environments (id text primary key, project_id text not null, name text not null, base_url text not null, status text not null, variables jsonb, created_at timestamptz not null, updated_at timestamptz not null)`,
  `create table if not exists suites (id text primary key, project_id text not null, name text not null, type text not null, spec_path text not null, status text not null, created_at timestamptz not null, updated_at timestamptz not null)`,
  `create table if not exists runs (id text primary key, project_id text not null, environment_id text not null, suite_id text not null, status text not null, report_path text, report_html_path text, error text, created_at timestamptz not null, started_at timestamptz, finished_at timestamptz, summary jsonb)`,
  `create table if not exists ai_connections (id text primary key, name text not null, provider text not null, api_key text, model text not null, base_url text, enabled text not null, created_at timestamptz not null, updated_at timestamptz not null)`,
];

for (const statement of statements) await pool.query(statement);
await pool.query(`alter table projects add column if not exists retention_days integer`);
await pool.query(`alter table projects add column if not exists cleanup_artifacts boolean`);
await pool.end();
console.log('migrations ok');
