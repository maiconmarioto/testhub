'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type AuthResponse = { token?: string };
export type PublicOrganization = {
  id: string;
  name: string;
  slug: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type LoginPayload = {
  email: string;
  password: string;
};

export type RegisterPayload = {
  email: string;
  name?: string;
  password: string;
  organizationIds?: string[];
  organizationName?: string;
};

export type PasswordResetRequestPayload = {
  email: string;
};

export type PasswordResetRequestResponse = {
  resetToken?: string;
};

export type PasswordResetConfirmPayload = {
  resetToken: string;
  password: string;
};

export function usePublicOrganizationsQuery() {
  return useQuery({
    queryKey: ['auth', 'organizations', 'public'],
    queryFn: () => api<PublicOrganization[]>('/api/auth/organizations', { redirectOnUnauthorized: false }),
    retry: false,
  });
}

export function useLoginMutation() {
  return useMutation({
    mutationFn: (payload: LoginPayload) => api<AuthResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
    onSuccess: storeAuthToken,
  });
}

export function useRegisterMutation() {
  return useMutation({
    mutationFn: (payload: RegisterPayload) => api<AuthResponse>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
    onSuccess: storeAuthToken,
  });
}

export function usePasswordResetRequestMutation() {
  return useMutation({
    mutationFn: (payload: PasswordResetRequestPayload) => api<PasswordResetRequestResponse>('/api/auth/password-reset/request', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  });
}

export function usePasswordResetConfirmMutation() {
  return useMutation({
    mutationFn: (payload: PasswordResetConfirmPayload) => api('/api/auth/password-reset/confirm', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  });
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function storeAuthToken(response: AuthResponse) {
  if (response.token) window.localStorage.setItem('testhub.token', response.token);
}
