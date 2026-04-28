export const defaultSecretKey = 'testhub-dev-secret-key-change-me';

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
  return {
    oidc: {
      configured: Boolean(process.env.AUTH_SECRET && (process.env.AUTH_OIDC_ISSUER || process.env.AUTH_AUTH0_ISSUER || process.env.AUTH_OKTA_ISSUER)),
      issuer: process.env.AUTH_OIDC_ISSUER ?? process.env.AUTH_AUTH0_ISSUER ?? process.env.AUTH_OKTA_ISSUER ?? null,
    },
    auth: {
      apiTokenEnabled: Boolean(process.env.TESTHUB_TOKEN),
      rbacRole: process.env.TESTHUB_ROLE ?? 'admin',
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
