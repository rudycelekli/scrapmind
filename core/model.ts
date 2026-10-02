import { z } from 'zod';
import type { ProviderConfig } from './inventor.js';

export function validateProvider(config: ProviderConfig): void {
  const url = new URL(config.baseUrl);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !config.model.trim() ||
    config.model.length > 200
  )
    throw new Error(
      'Configure an HTTP(S) model provider without embedded credentials and with a model name.',
    );
  z.enum(['compatible', 'reasoning']).optional().parse(config.profile);
  z.number().int().min(1024).max(32768).optional().parse(config.maxOutputTokens);
  z.string().trim().min(1).max(200).optional().parse(config.reviewModel);
}

/** Reasoning profile avoids optional sampling controls and uses the newer token limit field. */
export function requestTuning(config: ProviderConfig, temperature: number, defaultLimit: number) {
  return config.profile === 'reasoning'
    ? { max_completion_tokens: config.maxOutputTokens ?? 16384 }
    : { temperature, max_tokens: config.maxOutputTokens ?? defaultLimit };
}

/** Bound bytes before JSON parsing, including chunked responses without Content-Length. */
export async function modelContent(response: Response): Promise<string> {
  if (!response.ok)
    throw new Error(
      `The configured model returned HTTP ${response.status}. Check its configuration.`,
    );
  if (!response.body) throw new Error('The configured model returned an empty response.');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      size += result.value.byteLength;
      if (size > 1_000_000) throw new Error('The model response exceeds 1 MB.');
      chunks.push(result.value);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  let envelope;
  try {
    envelope = z
      .object({
        choices: z
          .array(
            z.object({
              message: z.object({ content: z.string().max(100_000).nullable() }),
              finish_reason: z.string().nullable().optional(),
            }),
          )
          .min(1),
      })
      .parse(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
  } catch {
    throw new Error('The model returned an invalid completion envelope.');
  }
  if (envelope.choices[0].finish_reason === 'length')
    throw new Error(
      'The model reached its output token limit. Try fewer ideas or configure a larger supported limit.',
    );
  if (envelope.choices[0].message.content === null)
    throw new Error('The model returned no textual proposal.');
  return envelope.choices[0].message.content;
}

export function parseModelJson(raw: string): unknown {
  return JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, '').trim());
}
