'use client';

import { useV2ProjectEnvironmentActions } from './useV2ProjectEnvironmentActions';
import { useV2RunActions } from './useV2RunActions';
import { useV2SuiteActions } from './useV2SuiteActions';
import { useV2WizardActions } from './useV2WizardActions';
import type { V2WorkspaceActionsInput } from './workspaceActionTypes';

export function useV2WorkspaceActions(input: V2WorkspaceActionsInput) {
  return {
    ...useV2RunActions(input),
    ...useV2SuiteActions(input),
    ...useV2ProjectEnvironmentActions(input),
    ...useV2WizardActions(input),
  };
}
