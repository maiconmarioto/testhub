import { describe, expect, it } from 'vitest';
import { redactDeep } from '../packages/shared/src/redact.js';

describe('redaction', () => {
  it('redacts common secret fields', () => {
    expect(
      redactDeep({
        Authorization: 'Bearer abcdefghijklmnopqrstuvwxyz123456',
        password: 'secret',
        nested: { token: 'x' },
        ok: 'visible',
      }),
    ).toEqual({
      Authorization: '[REDACTED]',
      password: '[REDACTED]',
      nested: { token: '[REDACTED]' },
      ok: 'visible',
    });
  });
});
