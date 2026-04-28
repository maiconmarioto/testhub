import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { ensureDir } from '../../shared/src/fs-utils.js';

export interface AuditEntry {
  id: string;
  action: string;
  organizationId?: string;
  actor: string;
  actorRole?: string;
  target?: string;
  status: 'ok' | 'blocked' | 'error';
  detail?: Record<string, unknown>;
  createdAt: string;
}

export function auditPath(rootDir = process.env.TESTHUB_DATA_DIR ?? '.testhub-data'): string {
  const dir = path.resolve(rootDir);
  ensureDir(dir);
  return path.join(dir, 'audit.jsonl');
}

export function writeAudit(entry: Omit<AuditEntry, 'id' | 'createdAt'>, rootDir?: string): AuditEntry {
  const full: AuditEntry = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    ...entry,
  };
  fs.appendFileSync(auditPath(rootDir), `${JSON.stringify(full)}\n`, 'utf8');
  return full;
}

export function readAudit(options: number | { limit?: number; actor?: string; action?: string; status?: AuditEntry['status']; organizationId?: string } = 50, rootDir?: string): AuditEntry[] {
  const filters = typeof options === 'number' ? { limit: options } : options;
  const limit = filters.limit ?? 50;
  const file = auditPath(rootDir);
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as AuditEntry)
    .filter((entry) => !filters.actor || entry.actor.toLowerCase().includes(filters.actor.toLowerCase()))
    .filter((entry) => !filters.action || entry.action.toLowerCase().includes(filters.action.toLowerCase()))
    .filter((entry) => !filters.status || entry.status === filters.status)
    .filter((entry) => !filters.organizationId || entry.organizationId === filters.organizationId)
    .slice(-limit)
    .reverse();
}

export function auditCsv(entries: AuditEntry[]): string {
  const header = ['createdAt', 'actor', 'actorRole', 'action', 'status', 'target', 'detail'];
  const rows = entries.map((entry) => [
    entry.createdAt,
    entry.actor,
    entry.actorRole ?? '',
    entry.action,
    entry.status,
    entry.target ?? '',
    entry.detail ? JSON.stringify(entry.detail) : '',
  ]);
  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\n');
}

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}
