import type { MembershipEdit, Organization, UserManagementItem } from '../types';

export function initials(value: string): string {
  const parts = value.split(/[\s@._-]+/).filter(Boolean);
  return (parts[0]?.[0] ?? 'U').concat(parts[1]?.[0] ?? '').toUpperCase();
}

export function parseVars(input: string): Record<string, string> {
  return Object.fromEntries(input.split('\n').filter(Boolean).map((line) => {
    const index = line.indexOf('=');
    if (index === -1) return [line.trim(), ''];
    return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
  }));
}

export function splitList(input: string): string[] {
  return input.split(/[\n,]/).map((item) => item.trim()).filter(Boolean);
}

export function mergeMembershipEdit(current: MembershipEdit, users: UserManagementItem[], organizations: Organization[]): MembershipEdit {
  const organizationIds = new Set(organizations.map((organization) => organization.id));
  return Object.fromEntries(users.map((item) => {
    const existing = current[item.user.id] ?? {};
    const memberships = Object.fromEntries(item.memberships
      .filter((membership) => organizationIds.has(membership.organizationId))
      .map((membership) => [membership.organizationId, membership.role]));
    const merged = Object.fromEntries(organizations.map((organization) => {
      const currentValue = existing[organization.id];
      return [organization.id, currentValue !== undefined ? currentValue : (memberships[organization.id] ?? '')];
    }));
    return [item.user.id, merged];
  }));
}

export function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
