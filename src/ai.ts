import type { AiConnection } from './store.js';

export interface AiResult {
  provider: string;
  model: string;
  output: string;
}

export async function callAi(connection: AiConnection, prompt: string): Promise<AiResult> {
  if (!connection.enabled) throw new Error('AI connection desabilitada');
  if (!connection.apiKey) throw new Error('AI connection sem apiKey');

  if (connection.provider === 'anthropic') {
    const response = await fetch(connection.baseUrl ?? 'https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': connection.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: connection.model,
        max_tokens: 1200,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    const json = await response.json() as { content?: Array<{ text?: string }>; error?: { message?: string } };
    if (!response.ok) throw new Error(json.error?.message ?? `Anthropic error ${response.status}`);
    return { provider: connection.provider, model: connection.model, output: json.content?.map((item) => item.text ?? '').join('\n') ?? '' };
  }

  const baseUrl = connection.baseUrl ?? (connection.provider === 'openrouter' ? 'https://openrouter.ai/api/v1/chat/completions' : 'https://api.openai.com/v1/chat/completions');
  const response = await fetch(baseUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${connection.apiKey}`,
    },
    body: JSON.stringify({
      model: connection.model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
    }),
  });
  const json = await response.json() as { choices?: Array<{ message?: { content?: string } }>; error?: { message?: string } };
  if (!response.ok) throw new Error(json.error?.message ?? `${connection.provider} error ${response.status}`);
  return { provider: connection.provider, model: connection.model, output: json.choices?.[0]?.message?.content ?? '' };
}

export function buildFailurePrompt(input: unknown): string {
  return [
    'Voce e AI Test Assistant do TestHub.',
    'Classifique falha em JSON com campos: classification, confidence, summary, evidence, nextAction.',
    'Classes: app_bug, test_broken, environment_down, auth_or_secret, data_issue, contract_changed, flaky, unknown.',
    'Nao invente dado. Use apenas evidencias.',
    `Contexto sanitizado:\n${JSON.stringify(input, null, 2).slice(0, 12000)}`,
  ].join('\n\n');
}

export function buildFixPrompt(input: unknown): string {
  return [
    'Voce sugere correcao de teste TestHub YAML.',
    'Responda YAML com suggestion.type, reason, before, after, confidence.',
    'Nao sugira mudanca de app, apenas spec.',
    `Contexto sanitizado:\n${JSON.stringify(input, null, 2).slice(0, 12000)}`,
  ].join('\n\n');
}

export function buildTestSuggestionPrompt(input: unknown): string {
  return [
    'Voce sugere poucos testes de alto valor para TestHub.',
    'Responda YAML com suggestions[].name, reason, priority, type, proposedSteps/request.',
    'Evite suite gigante. Foque smoke/contract critico.',
    `Contexto sanitizado:\n${JSON.stringify(input, null, 2).slice(0, 12000)}`,
  ].join('\n\n');
}
