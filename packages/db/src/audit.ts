import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { ensureDir } from '../../shared/src/fs-utils.js';

export interface AuditEntry {
  id: string;
  action: string;
  actor: string;
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

export function readAudit(limit = 50, rootDir?: string): AuditEntry[] {
  const file = auditPath(rootDir);
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .slice(-limit)
    .reverse()
    .map((line) => JSON.parse(line) as AuditEntry);
}
