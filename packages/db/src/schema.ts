import { boolean, integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const projects = pgTable('projects', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  retentionDays: integer('retention_days'),
  cleanupArtifacts: boolean('cleanup_artifacts'),
  status: text('status').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
});

export const environments = pgTable('environments', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull(),
  name: text('name').notNull(),
  baseUrl: text('base_url').notNull(),
  status: text('status').notNull(),
  variables: jsonb('variables').$type<Record<string, string>>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
});

export const suites = pgTable('suites', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull(),
  name: text('name').notNull(),
  type: text('type').notNull(),
  specPath: text('spec_path').notNull(),
  status: text('status').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
});

export const runs = pgTable('runs', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull(),
  environmentId: text('environment_id').notNull(),
  suiteId: text('suite_id').notNull(),
  status: text('status').notNull(),
  reportPath: text('report_path'),
  reportHtmlPath: text('report_html_path'),
  error: text('error'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  summary: jsonb('summary').$type<unknown>(),
});

export const aiConnections = pgTable('ai_connections', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  provider: text('provider').notNull(),
  apiKey: text('api_key'),
  model: text('model').notNull(),
  baseUrl: text('base_url'),
  enabled: text('enabled').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
});
