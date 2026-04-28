export const defaultSecretKey = '';

export type RbacRole = 'admin' | 'editor' | 'viewer';
export type Permission =
  | 'project:write'
  | 'environment:write'
  | 'suite:write'
  | 'run:write'
  | 'settings:write'
  | 'ai:write'
  | 'audit:read';

export interface AuthActor {
  id: string;
  userId?: string;
  organizationId?: string;
  name?: string;
  email?: string;
  role: RbacRole;
  source: 'local' | 'token' | 'oidc';
  claims?: Record<string, unknown>;
}

type OidcJwk = JsonWebKey & { kid?: string };
type Jwks = { keys?: OidcJwk[] };

const jwksCache = new Map<string, { expiresAt: number; jwks: Jwks }>();

export function isDefaultSecretKey(): boolean {
  const value = process.env.TESTHUB_SECRET_KEY ?? defaultSecretKey;
  return value === defaultSecretKey || value === 'change-me';
}

export function retentionDays(): number {
  const raw = Number(process.env.TESTHUB_RETENTION_DAYS ?? 30);
  return Number.isFinite(raw) && raw >= 1 ? Math.trunc(raw) : 30;
}

export function allowedHosts(): string[] {
  return (process.env.TESTHUB_ALLOWED_HOSTS ?? '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

export function isHostAllowed(rawUrl: string): boolean {
  const allowlist = allowedHosts();
  if (allowlist.length === 0) return true;
  const url = new URL(rawUrl);
  const host = url.hostname.toLowerCase();
  return allowlist.some((allowed) => allowed === host || host.endsWith(`.${allowed}`));
}

export function systemSecurityStatus() {
  const oidcIssuer = oidcIssuerUrl();
  return {
    oidc: {
      configured: Boolean(oidcIssuer && process.env.AUTH_OIDC_CLIENT_ID),
      issuer: oidcIssuer,
    },
    auth: {
      apiTokenEnabled: Boolean(process.env.TESTHUB_TOKEN),
      rbacRole: fallbackRole(),
      mode: authMode(),
    },
    secrets: {
      defaultKey: isDefaultSecretKey(),
      blockedInProduction: process.env.NODE_ENV === 'production' && isDefaultSecretKey(),
    },
    network: {
      allowedHosts: allowedHosts(),
      allowAllWhenEmpty: allowedHosts().length === 0,
    },
    retention: {
      days: retentionDays(),
    },
  };
}

export function authMode(): 'off' | 'token' | 'oidc' | 'local' {
  const value = (process.env.TESTHUB_AUTH_MODE ?? '').toLowerCase();
  if (value === 'off') return process.env.NODE_ENV === 'production' ? 'local' : 'off';
  if (value === 'token' || value === 'oidc' || value === 'local') return value;
  if (oidcIssuerUrl() && process.env.AUTH_OIDC_CLIENT_ID) return 'oidc';
  if (process.env.TESTHUB_TOKEN) return 'token';
  return 'local';
}

export function fallbackRole(): RbacRole {
  return normalizeRole(process.env.TESTHUB_ROLE);
}

export function normalizeRole(value?: string | null): RbacRole {
  const role = String(value ?? '').toLowerCase();
  if (role === 'viewer') return 'viewer';
  if (role === 'editor') return 'editor';
  return 'admin';
}

export function hasPermission(role: RbacRole, permission: Permission): boolean {
  if (role === 'admin') return true;
  if (role === 'editor') return permission !== 'settings:write' && permission !== 'audit:read';
  return false;
}

export function roleFromClaims(claims: Record<string, unknown>): RbacRole {
  const explicit = firstString(claims.role) ?? firstString(claims['testhub_role']);
  if (explicit) return normalizeRole(explicit);
  const groups = arrayOfStrings(claims.groups ?? claims.roles);
  const adminGroups = envList('TESTHUB_ADMIN_GROUPS');
  const editorGroups = envList('TESTHUB_EDITOR_GROUPS');
  const viewerGroups = envList('TESTHUB_VIEWER_GROUPS');
  if (groups.some((group) => adminGroups.includes(group))) return 'admin';
  if (groups.some((group) => editorGroups.includes(group))) return 'editor';
  if (groups.some((group) => viewerGroups.includes(group))) return 'viewer';
  return fallbackRole();
}

export async function actorFromAuthorization(authorization?: string): Promise<AuthActor | null> {
  const mode = authMode();
  if (mode === 'off') {
    return { id: 'local-dev', role: 'admin', source: 'local', name: 'Local dev' };
  }

  if (!authorization?.startsWith('Bearer ')) return null;
  const token = authorization.slice('Bearer '.length).trim();

  if (mode === 'token') {
    if (!process.env.TESTHUB_TOKEN || token !== process.env.TESTHUB_TOKEN) return null;
    return { id: 'api-token', role: fallbackRole(), source: 'token', name: 'API token' };
  }

  const claims = await verifyOidcJwt(token);
  return {
    id: firstString(claims.sub) ?? firstString(claims.email) ?? 'oidc-user',
    name: firstString(claims.name),
    email: firstString(claims.email),
    role: roleFromClaims(claims),
    source: 'oidc',
    claims,
  };
}

export function actorLabel(actor: AuthActor | null): string {
  if (!actor) return 'anonymous';
  return actor.email ?? actor.name ?? actor.id;
}

export function oidcIssuerUrl(): string | null {
  return process.env.AUTH_OIDC_ISSUER ?? process.env.AUTH_AUTH0_ISSUER ?? process.env.AUTH_OKTA_ISSUER ?? null;
}

async function verifyOidcJwt(token: string): Promise<Record<string, unknown>> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('OIDC token invalido');
  const header = parseJwtPart<{ alg?: string; kid?: string }>(parts[0]);
  const payload = parseJwtPart<Record<string, unknown>>(parts[1]);
  if (header.alg !== 'RS256') throw new Error('OIDC alg nao suportado');

  const issuer = oidcIssuerUrl();
  const audience = process.env.AUTH_OIDC_CLIENT_ID;
  if (!issuer || !audience) throw new Error('OIDC nao configurado');
  if (payload.iss !== issuer) throw new Error('OIDC issuer invalido');
  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!aud.includes(audience)) throw new Error('OIDC audience invalida');
  if (typeof payload.exp === 'number' && payload.exp * 1000 < Date.now()) throw new Error('OIDC token expirado');

  const jwks = await fetchJwks(issuer);
  const jwk = jwks.keys?.find((key) => key.kid === header.kid && key.kty === 'RSA');
  if (!jwk) throw new Error('OIDC key nao encontrada');
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const valid = await crypto.subtle.verify(
    { name: 'RSASSA-PKCS1-v1_5' },
    key,
    toArrayBuffer(base64UrlToBytes(parts[2])),
    toArrayBuffer(new TextEncoder().encode(`${parts[0]}.${parts[1]}`)),
  );
  if (!valid) throw new Error('OIDC assinatura invalida');
  return payload;
}

async function fetchJwks(issuer: string): Promise<Jwks> {
  const cached = jwksCache.get(issuer);
  if (cached && cached.expiresAt > Date.now()) return cached.jwks;
  const metadataResponse = await fetch(`${issuer.replace(/\/$/, '')}/.well-known/openid-configuration`);
  if (!metadataResponse.ok) throw new Error(`OIDC metadata falhou: ${metadataResponse.status}`);
  const metadata = await metadataResponse.json() as { jwks_uri?: string };
  if (!metadata.jwks_uri) throw new Error('OIDC jwks_uri ausente');
  const jwksResponse = await fetch(metadata.jwks_uri);
  if (!jwksResponse.ok) throw new Error(`OIDC JWKS falhou: ${jwksResponse.status}`);
  const jwks = await jwksResponse.json() as Jwks;
  jwksCache.set(issuer, { expiresAt: Date.now() + 10 * 60 * 1000, jwks });
  return jwks;
}

function parseJwtPart<T>(part: string): T {
  return JSON.parse(Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')) as T;
}

function base64UrlToBytes(value: string): Uint8Array {
  return Uint8Array.from(Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/'), 'base64'));
}

function firstString(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value;
  if (Array.isArray(value)) return value.find((item): item is string => typeof item === 'string' && item.trim().length > 0);
  return undefined;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function arrayOfStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function envList(key: string): string[] {
  return (process.env[key] ?? '').split(',').map((item) => item.trim()).filter(Boolean);
}
