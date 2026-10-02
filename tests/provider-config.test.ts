import { expect, it } from 'vitest';
import { configuredProvider } from '../scripts/provider-config.js';

it('keeps unconfigured models disabled and rejects partial or invalid configuration', () => {
  expect(configuredProvider({})).toBeUndefined();
  expect(() => configuredProvider({ SCRAPMIND_AI_MODEL: 'a-model' })).toThrow('both');
  const env = { SCRAPMIND_AI_BASE_URL: 'http://localhost/v1', SCRAPMIND_AI_MODEL: 'a-model' };
  expect(() => configuredProvider({ ...env, SCRAPMIND_AI_PROFILE: 'guess' })).toThrow();
  expect(() => configuredProvider({ ...env, SCRAPMIND_AI_FORMAT: 'guess' })).toThrow();
  expect(() => configuredProvider({ ...env, SCRAPMIND_AI_MAX_OUTPUT_TOKENS: '999999' })).toThrow();
  expect(() =>
    configuredProvider({ ...env, SCRAPMIND_AI_BASE_URL: 'http://user:secret@localhost/v1' }),
  ).toThrow('without embedded credentials');
  expect(() =>
    configuredProvider({ ...env, SCRAPMIND_AI_BASE_URL: 'http://localhost/v1?route=other' }),
  ).toThrow();
});

it('reads explicit generation and review settings without contacting a provider', () => {
  expect(
    configuredProvider({
      SCRAPMIND_AI_BASE_URL: 'http://localhost/v1',
      SCRAPMIND_AI_MODEL: 'generator',
      SCRAPMIND_AI_REVIEW_MODEL: 'critic',
      SCRAPMIND_AI_VISION_MODEL: 'vision',
      SCRAPMIND_AI_PROFILE: 'reasoning',
      SCRAPMIND_AI_MAX_OUTPUT_TOKENS: '20000',
    }),
  ).toMatchObject({
    model: 'generator',
    reviewModel: 'critic',
    visionModel: 'vision',
    profile: 'reasoning',
    maxOutputTokens: 20000,
  });
});
