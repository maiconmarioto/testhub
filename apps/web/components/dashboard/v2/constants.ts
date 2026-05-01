import type { FlowDraft, Role } from './types';

export const controlClass = 'h-10 border-[#d7d2c4] bg-white text-[#1f241f] shadow-none placeholder:text-[#8a877c] focus-visible:ring-[#426b4d]';
export const darkSelectClass = `min-w-52 ${controlClass}`;
export const roles: Role[] = ['admin', 'editor', 'viewer'];
export const defaultFlowDraft: FlowDraft = {
  id: '',
  namespace: 'auth',
  name: 'login',
  displayName: 'Login padrão',
  description: 'Login padrão reutilizável',
  projectIds: [],
  params: 'email: ${USER_EMAIL}\npassword: ${USER_PASSWORD}',
  steps: [
    '- goto: /login',
    '- fill:',
    '    by: label',
    '    target: Email',
    '    value: ${email}',
    '- fill:',
    '    by: label',
    '    target: Senha',
    '    value: ${password}',
    '- click:',
    '    by: role',
    '    role: button',
    '    name: Entrar',
  ].join('\n'),
};
export const defaultSpec = `version: 1
type: api
name: health
tests:
  - name: status 200
    request:
      method: GET
      path: /status/200
    expect:
      status: 200`;
