import { z } from 'zod';
import { validateProvider } from '../core/model.js';
import type { ProviderConfig } from '../core/inventor.js';

/** Read owner configuration only; this never contacts a provider or reveals its key. */
export function configuredProvider(
  env: NodeJS.ProcessEnv = process.env,
): ProviderConfig | undefined {
  const baseUrl = env.SCRAPMIND_AI_BASE_URL,
    model = env.SCRAPMIND_AI_MODEL;
  if (!baseUrl && !model) return undefined;
  if (!baseUrl || !model)
    throw new Error(
      'Set both SCRAPMIND_AI_BASE_URL and SCRAPMIND_AI_MODEL. Nothing was sent to a provider.',
    );
  const config: ProviderConfig = {
    baseUrl,
    model,
    apiKey: env.SCRAPMIND_AI_KEY,
    format: z.enum(['json_schema', 'json_object']).parse(env.SCRAPMIND_AI_FORMAT ?? 'json_schema'),
    profile: z.enum(['compatible', 'reasoning']).parse(env.SCRAPMIND_AI_PROFILE ?? 'compatible'),
    ...(env.SCRAPMIND_AI_MAX_OUTPUT_TOKENS
      ? {
          maxOutputTokens: z.coerce
            .number()
            .int()
            .min(1024)
            .max(32768)
            .parse(env.SCRAPMIND_AI_MAX_OUTPUT_TOKENS),
        }
      : {}),
    ...(env.SCRAPMIND_AI_REVIEW_MODEL ? { reviewModel: env.SCRAPMIND_AI_REVIEW_MODEL } : {}),
    ...(env.SCRAPMIND_AI_VISION_MODEL ? { visionModel: env.SCRAPMIND_AI_VISION_MODEL } : {}),
  };
  validateProvider(config);
  return config;
}
