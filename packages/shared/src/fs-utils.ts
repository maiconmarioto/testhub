import fs from 'node:fs';
import path from 'node:path';

export function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

export function writeJson(filePath: string, data: unknown): void {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

export function sanitizeFilename(input: string): string {
  const sanitized = input.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9._-]/g, '');
  return sanitized || 'unnamed';
}
