import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type {
  AuthMe,
  Organization,
  OrganizationMember,
  PersonalAccessToken,
  UserManagementItem,
} from '../types';
import { queryKeys } from './queryKeys';

export function useAuthQueries() {
  return {
    me: useQuery({
      queryKey: queryKeys.authMe,
      queryFn: () =>
        api<AuthMe>('/api/auth/me', { redirectOnUnauthorized: false }).catch(
          () => null,
        ),
    }),
    members: useQuery({
      queryKey: queryKeys.members,
      queryFn: () =>
        api<OrganizationMember[]>('/api/organizations/current/members', {
          redirectOnUnauthorized: false,
        }).catch(() => []),
    }),
    personalTokens: useQuery({
      queryKey: queryKeys.personalTokens,
      queryFn: () =>
        api<PersonalAccessToken[]>('/api/users/me/tokens', {
          redirectOnUnauthorized: false,
        }).catch(() => []),
    }),
    organizations: useQuery({
      queryKey: queryKeys.organizations,
      queryFn: () =>
        api<Organization[]>('/api/organizations', {
          redirectOnUnauthorized: false,
        }).catch(() => []),
    }),
    users: useQuery({
      queryKey: queryKeys.users,
      queryFn: () =>
        api<UserManagementItem[]>('/api/users', {
          redirectOnUnauthorized: false,
        }).catch(() => []),
    }),
  };
}
