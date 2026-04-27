const SECRET_KEY_PATTERN = /(authorization|cookie|set-cookie|token|secret|password|senha|api[-_]?key)/i;

export function redactValue(key: string, value: unknown): unknown {
  if (SECRET_KEY_PATTERN.test(key)) return '[REDACTED]';
  if (typeof value === 'string' && looksSensitive(value)) return '[REDACTED]';
  return value;
}

export function redactDeep<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => redactDeep(item)) as T;
  if (value && typeof value === 'object') {
    const output: Record<string, unknown> = {};
    for (const [key, nestedValue] of Object.entries(value)) {
      output[key] = redactValue(key, redactDeep(nestedValue));
    }
    return output as T;
  }
  return value;
}

export function looksSensitive(value: string): boolean {
  if (/^bearer\s+[a-z0-9._~+/=-]{12,}$/i.test(value)) return true;
  if (/^[a-z0-9._~+/=-]{32,}$/i.test(value)) return true;
  return false;
}
