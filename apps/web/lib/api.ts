export const apiBase = process.env.NEXT_PUBLIC_TESTHUB_API_URL ?? 'http://localhost:4321';

const authPaths = ['/login', '/register', '/forgot-password', '/reset-password'];

export async function api<T>(apiPath: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  const token = browserToken() ?? process.env.NEXT_PUBLIC_TESTHUB_TOKEN;

  if (options.body && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  if (token && !headers.has('authorization')) {
    headers.set('authorization', `Bearer ${token}`);
  }

  const response = await fetch(`${apiBase}${apiPath}`, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (response.status === 401 && shouldRedirectToLogin()) {
    window.location.assign('/login');
  }

  if (!response.ok) throw new Error(await response.text());
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

function browserToken(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  return window.localStorage.getItem('testhub.token') ?? undefined;
}

function shouldRedirectToLogin(): boolean {
  if (typeof window === 'undefined') return false;
  return !authPaths.some((path) => window.location.pathname.startsWith(path));
}
