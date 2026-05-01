'use client';

import { api } from '@/lib/api';
import { defaultSpec } from '../../constants';
import type { Suite, SuiteWithContent, ValidationResult } from '../../types';
import { messageOf } from '../../shared/formUtils';
import type { V2WorkspaceActionsInput } from './workspaceActionTypes';

export function useV2SuiteActions(input: V2WorkspaceActionsInput) {
  const {
    projectId,
    setSuiteId,
    setSelectedRunId,
    setTab,
    setError,
    setBusy,
    setNotice,
    selectedSuite,
    suiteDraft,
    setSuiteDraft,
    setValidation,
    approvedAiPatch,
    setApprovedAiPatch,
    setSuitePreview,
    setSuitePreviewOpen,
    performMutation,
  } = input;

  async function loadSuite(suite: Suite) {
    await performMutation(async () => {
      const loaded = await api<SuiteWithContent>(`/api/suites/${suite.id}`);
      setSuiteDraft({
        id: loaded.id,
        name: loaded.name,
        type: loaded.type,
        specContent: loaded.specContent,
      });
      setSuiteId(loaded.id);
      setSelectedRunId('');
      setTab('overview');
      setValidation(null);
    }, `Editando ${suite.name}.`);
  }

  async function openSuitePreview() {
    if (!selectedSuite) {
      setError('Selecione uma suite para visualizar.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const loaded = await api<SuiteWithContent>(
        `/api/suites/${selectedSuite.id}`,
      );
      setSuitePreview(loaded);
      setSuitePreviewOpen(true);
    } catch (nextError) {
      setError(messageOf(nextError));
    } finally {
      setBusy(false);
    }
  }

  function newSuiteDraft() {
    setSuiteDraft({ id: '', name: '', type: 'api', specContent: defaultSpec });
    setValidation(null);
  }

  async function validateSpec(showNotice = true): Promise<boolean> {
    if (!suiteDraft.specContent.trim()) {
      setValidation({ valid: false, error: 'YAML obrigatório.' });
      return false;
    }
    try {
      const result = await api<ValidationResult>('/api/spec/validate', {
        method: 'POST',
        body: JSON.stringify({
          specContent: suiteDraft.specContent,
          projectId: projectId || undefined,
        }),
      });
      setValidation(result);
      if (showNotice && result.valid) setNotice('Spec valida.');
      return result.valid;
    } catch (nextError) {
      setValidation({ valid: false, error: messageOf(nextError) });
      return false;
    }
  }

  async function saveSuite() {
    if (!projectId) return;
    const valid = await validateSpec(false);
    if (!valid) return;
    const payload = {
      name: suiteDraft.name,
      type: suiteDraft.type,
      specContent: suiteDraft.specContent,
    };
    await performMutation(
      async () => {
        if (suiteDraft.id && approvedAiPatch) {
          await api('/api/ai/apply-test-fix', {
            method: 'POST',
            body: JSON.stringify({
              suiteId: suiteDraft.id,
              approved: true,
              reason: 'Aprovado na UI',
              ...payload,
            }),
          });
          setApprovedAiPatch(false);
        } else if (suiteDraft.id) {
          await api(`/api/suites/${suiteDraft.id}`, {
            method: 'PUT',
            body: JSON.stringify(payload),
          });
        } else {
          const suite = await api<Suite>('/api/suites', {
            method: 'POST',
            body: JSON.stringify({ projectId, ...payload }),
          });
          setSuiteDraft(current => ({ ...current, id: suite.id }));
          setSuiteId(suite.id);
        }
      },
      suiteDraft.id ? 'Suite atualizada.' : 'Suite criada.',
    );
  }

  return { loadSuite, openSuitePreview, newSuiteDraft, validateSpec, saveSuite };
}
