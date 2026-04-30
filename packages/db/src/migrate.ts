import pg from 'pg';

const { Pool } = pg;

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL obrigatorio');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const statements = [
  `create table if not exists projects (id text primary key, name text not null, description text, retention_days integer, cleanup_artifacts boolean, status text not null, created_at timestamptz not null, updated_at timestamptz not null)`,
  `create table if not exists users (id text primary key, email text not null, name text, password_hash text not null, status text not null, created_at timestamptz not null, updated_at timestamptz not null)`,
  `create unique index if not exists users_email_unique on users (lower(email))`,
  `create table if not exists organizations (id text primary key, name text not null, slug text not null, status text not null, created_at timestamptz not null, updated_at timestamptz not null)`,
  `create unique index if not exists organizations_slug_unique on organizations (slug)`,
  `create table if not exists organization_memberships (id text primary key, organization_id text not null, user_id text not null, role text not null, created_at timestamptz not null, updated_at timestamptz not null)`,
  `create unique index if not exists organization_memberships_unique on organization_memberships (organization_id, user_id)`,
  `create table if not exists auth_sessions (id text primary key, user_id text not null, organization_id text not null, token_hash text not null, expires_at timestamptz not null, created_at timestamptz not null, last_used_at timestamptz)`,
  `create unique index if not exists auth_sessions_token_hash_unique on auth_sessions (token_hash)`,
  `create table if not exists password_reset_tokens (id text primary key, user_id text not null, token_hash text not null, expires_at timestamptz not null, used_at timestamptz, created_at timestamptz not null)`,
  `create unique index if not exists password_reset_tokens_hash_unique on password_reset_tokens (token_hash)`,
  `create table if not exists personal_access_tokens (id text primary key, user_id text not null, name text not null, token_hash text not null, token text not null, token_preview text not null, organization_ids jsonb, default_organization_id text not null, status text not null, created_at timestamptz not null, updated_at timestamptz not null, last_used_at timestamptz)`,
  `create unique index if not exists personal_access_tokens_hash_unique on personal_access_tokens (token_hash)`,
  `create table if not exists environments (id text primary key, project_id text not null, name text not null, base_url text not null, status text not null, variables jsonb, created_at timestamptz not null, updated_at timestamptz not null)`,
  `create table if not exists suites (id text primary key, project_id text not null, name text not null, type text not null, spec_path text not null, status text not null, created_at timestamptz not null, updated_at timestamptz not null)`,
  `create table if not exists runs (id text primary key, project_id text not null, environment_id text not null, suite_id text not null, status text not null, report_path text, report_html_path text, error text, created_at timestamptz not null, started_at timestamptz, finished_at timestamptz, summary jsonb, progress jsonb, heartbeat_at timestamptz)`,
  `create table if not exists ai_connections (id text primary key, organization_id text not null, name text not null, provider text not null, api_key text, model text not null, base_url text, enabled text not null, created_at timestamptz not null, updated_at timestamptz not null)`,
  `create table if not exists flow_library (id text primary key, organization_id text not null, namespace text not null, name text not null, description text, params jsonb, steps jsonb not null, status text not null, created_at timestamptz not null, updated_at timestamptz not null)`,
  `create unique index if not exists flow_library_org_namespace_name_unique on flow_library (organization_id, namespace, name) where status <> 'inactive'`,
];

for (const statement of statements) await pool.query(statement);
await pool.query(`alter table projects add column if not exists retention_days integer`);
await pool.query(`alter table projects add column if not exists cleanup_artifacts boolean`);
await pool.query(`alter table projects add column if not exists organization_id text`);
await pool.query(`update projects set organization_id = 'legacy-local' where organization_id is null`);
await pool.query(`alter table projects alter column organization_id set not null`);
await pool.query(`alter table ai_connections add column if not exists organization_id text`);
await pool.query(`update ai_connections set organization_id = 'legacy-local' where organization_id is null`);
await pool.query(`alter table ai_connections alter column organization_id set not null`);
await pool.query(`alter table runs add column if not exists progress jsonb`);
await pool.query(`alter table runs add column if not exists heartbeat_at timestamptz`);
await pool.query(`alter table flow_library add column if not exists display_name text`);
await pool.query(`alter table flow_library add column if not exists project_ids jsonb`);
await pool.end();
console.log('migrations ok');
