'use client';

import type { QueryClient } from '@tanstack/react-query';
import type { Dispatch, SetStateAction } from 'react';
import { api } from '@/lib/api';
import { queryKeys } from '../../query/queryKeys';
import type {
  AuthMe,
  MemberDraft,
  MembershipEdit,
  Organization,
  OrganizationDraft,
  PersonalAccessToken,
  ProfileDraft,
  Role,
  TokenDraft,
} from '../../types';

export function useV2SettingsActions(input: {
  me: AuthMe | null;
  memberDraft: MemberDraft;
  setMemberDraft: Dispatch<SetStateAction<MemberDraft>>;
  profileDraft: ProfileDraft;
  setProfileDraft: Dispatch<SetStateAction<ProfileDraft>>;
  orgDraft: OrganizationDraft;
  setOrgDraft: Dispatch<SetStateAction<OrganizationDraft>>;
  membershipEdit: MembershipEdit;
  setMembershipEdit: Dispatch<SetStateAction<MembershipEdit>>;
  tokenDraft: TokenDraft;
  setTokenDraft: Dispatch<SetStateAction<TokenDraft>>;
  setNotice: Dispatch<SetStateAction<string>>;
  performMutation: (
    operation: () => Promise<unknown>,
    success?: string,
  ) => Promise<void>;
  queryClient: QueryClient;
}) {
  async function createMember() {
    await input.performMutation(async () => {
      const response = await api<{ temporaryPassword?: string }>(
        '/api/organizations/current/members',
        {
          method: 'POST',
          body: JSON.stringify({
            email: input.memberDraft.email,
            name: input.memberDraft.name || undefined,
            role: input.memberDraft.role,
            temporaryPassword: input.memberDraft.temporaryPassword || undefined,
          }),
        },
      );
      if (response.temporaryPassword)
        input.setNotice(
          `Usuário criado. Senha temporária: ${response.temporaryPassword}`,
        );
      input.setMemberDraft({
        email: '',
        name: '',
        role: 'viewer',
        temporaryPassword: '',
      });
    }, 'Membro criado.');
  }

  async function saveProfile() {
    await input.performMutation(async () => {
      const result = await api<{ user: AuthMe['user'] }>('/api/users/me', {
        method: 'PUT',
        body: JSON.stringify({
          name: input.profileDraft.name.trim() || undefined,
          email: input.profileDraft.email.trim() || undefined,
          currentPassword: input.profileDraft.currentPassword || undefined,
          newPassword: input.profileDraft.newPassword || undefined,
        }),
      });
      input.queryClient.setQueryData<AuthMe | null>(
        queryKeys.authMe,
        (current) =>
          current
            ? { ...current, user: { ...current.user, ...result.user } }
            : current,
      );
      input.setProfileDraft((current) => ({
        ...current,
        currentPassword: '',
        newPassword: '',
      }));
    }, 'Perfil atualizado.');
  }

  async function createOrganization() {
    const name = input.orgDraft.name.trim();
    if (!name) return;
    await input.performMutation(async () => {
      await api<Organization>('/api/organizations', {
        method: 'POST',
        body: JSON.stringify({ name }),
      });
      input.setOrgDraft({ name: '' });
    }, 'Organização criada.');
  }

  async function switchOrganization(organizationId: string) {
    await input.performMutation(async () => {
      const result = await api<{
        user: AuthMe['user'];
        organization: AuthMe['organization'];
        membership: AuthMe['membership'];
        organizations: Organization[];
        token?: string;
      }>('/api/auth/switch-organization', {
        method: 'POST',
        body: JSON.stringify({ organizationId }),
      });
      if (result.token)
        window.localStorage.setItem('testhub.token', result.token);
      input.queryClient.setQueryData<AuthMe | null>(queryKeys.authMe, {
        user: result.user,
        organization: result.organization,
        membership: result.membership,
        organizations: result.organizations,
      });
    }, 'Organização alterada.');
  }

  function setEditedMembership(
    userId: string,
    organizationId: string,
    roleValue: Role | '',
  ) {
    input.setMembershipEdit((current) => ({
      ...current,
      [userId]: {
        ...(current[userId] ?? {}),
        [organizationId]: roleValue,
      },
    }));
  }

  async function saveUserMemberships(userId: string) {
    const userMemberships = input.membershipEdit[userId] ?? {};
    await input.performMutation(
      () =>
        api(`/api/users/${userId}/memberships`, {
          method: 'PATCH',
          body: JSON.stringify({
            memberships: Object.entries(userMemberships)
              .filter((entry): entry is [string, Role] => Boolean(entry[1]))
              .map(([organizationId, membershipRole]) => ({
                organizationId,
                role: membershipRole,
              })),
          }),
        }),
      'Memberships atualizadas.',
    );
  }

  async function createPersonalToken() {
    const name = input.tokenDraft.name.trim();
    if (!name) return;
    await input.performMutation(async () => {
      const token = await api<PersonalAccessToken>('/api/users/me/tokens', {
        method: 'POST',
        body: JSON.stringify({
          name,
          organizationIds:
            input.tokenDraft.scope === 'selected'
              ? input.tokenDraft.organizationIds
              : undefined,
          defaultOrganizationId:
            input.tokenDraft.scope === 'selected'
              ? input.tokenDraft.organizationIds[0]
              : input.me?.organization.id,
        }),
      });
      input.queryClient.setQueryData<PersonalAccessToken[]>(
        queryKeys.personalTokens,
        (current) => [
          token,
          ...(current ?? []).filter((item) => item.id !== token.id),
        ],
      );
      input.setTokenDraft({ name: 'mcp-local', scope: 'all', organizationIds: [] });
    }, 'Token criado.');
  }

  async function revokePersonalToken(tokenId: string) {
    await input.performMutation(async () => {
      await api(`/api/users/me/tokens/${tokenId}`, { method: 'DELETE' });
      input.queryClient.setQueryData<PersonalAccessToken[]>(
        queryKeys.personalTokens,
        (current) => (current ?? []).filter((token) => token.id !== tokenId),
      );
    }, 'Token revogado.');
  }

  return {
    createMember,
    saveProfile,
    createOrganization,
    switchOrganization,
    setEditedMembership,
    saveUserMemberships,
    createPersonalToken,
    revokePersonalToken,
  };
}
