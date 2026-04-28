const configuredApiBase = process.env.NEXT_PUBLIC_TESTHUB_API_URL ?? 'http://localhost:4321';

export const apiBase = resolveApiBase(configuredApiBase);

const authPaths = ['/login', '/register', '/forgot-password', '/reset-password'];

type ApiRequestInit = RequestInit & {
  redirectOnUnauthorized?: boolean;
};

export async function api<T>(apiPath: string, options: ApiRequestInit = {}): Promise<T> {
  const { redirectOnUnauthorized = true, ...fetchOptions } = options;
  const headers = authHeaders(fetchOptions.headers);

  if (fetchOptions.body && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }

  const response = await fetch(`${apiBase}${apiPath}`, {
    ...fetchOptions,
    headers,
    credentials: 'include',
  });

  if (redirectOnUnauthorized && response.status === 401 && shouldRedirectToLogin()) {
    window.location.assign('/login');
  }

  if (!response.ok) throw new Error(await readableError(response));
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export function authHeaders(init?: HeadersInit): Headers {
  const headers = new Headers(init);
  const token = browserToken() ?? process.env.NEXT_PUBLIC_TESTHUB_TOKEN;
  if (token && !headers.has('authorization')) {
    headers.set('authorization', `Bearer ${token}`);
  }
  return headers;
}

function browserToken(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  return window.localStorage.getItem('testhub.token') ?? undefined;
}

function resolveApiBase(value: string): string {
  if (typeof window === 'undefined' || window.location.hostname !== 'host.docker.internal') return value;
  return value
    .replace('://localhost:', '://host.docker.internal:')
    .replace('://127.0.0.1:', '://host.docker.internal:');
}

function shouldRedirectToLogin(): boolean {
  if (typeof window === 'undefined') return false;
  return !authPaths.some((path) => window.location.pathname.startsWith(path));
}

async function readableError(response: Response): Promise<string> {
  const text = await response.text();
  if (!text) return `${response.status} ${response.statusText}`.trim();
  try {
    return messageFromJson(JSON.parse(text)) ?? text;
  } catch {
    return text;
  }
}

function messageFromJson(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const body = value as { error?: unknown; message?: unknown; issues?: unknown };
  const base = typeof body.error === 'string'
    ? body.error
    : typeof body.message === 'string'
      ? body.message
      : undefined;
  const issues = Array.isArray(body.issues)
    ? body.issues.map(issueMessage).filter(Boolean).slice(0, 3)
    : [];

  if (base && issues.length > 0) return `${base}: ${issues.join('; ')}`;
  if (issues.length > 0) return issues.join('; ');
  return base;
}

function issueMessage(issue: unknown): string {
  if (!issue || typeof issue !== 'object') return '';
  const item = issue as { path?: unknown; message?: unknown };
  const message = typeof item.message === 'string' ? item.message : '';
  const path = Array.isArray(item.path) ? item.path.join('.') : '';
  if (path && message) return `${path}: ${message}`;
  return message;
}
