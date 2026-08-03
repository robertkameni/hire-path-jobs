import { performance } from 'node:perf_hooks';
import { InternalServerErrorException } from '@nestjs/common';
import type { z } from 'zod';
import type { StructuredLogger } from '../../common/logger/structured.logger.js';

const HTML_NUMERIC_ENTITY_RE = /&#(\d+);|&#x([\da-fA-F]+);/g;

function decodeNumericHtmlEntities(text: string, counter: { count: number; }): string {
  return text.replace(HTML_NUMERIC_ENTITY_RE, (_match, dec, hex) => {
    counter.count++;
    const codePoint = dec !== undefined ? Number.parseInt(dec, 10) : Number.parseInt(hex, 16);
    return String.fromCodePoint(codePoint);
  });
}

export function decodeHtmlEntitiesDeep(value: unknown, counter: { count: number; }): unknown {
  if (typeof value === 'string') {
    return decodeNumericHtmlEntities(value, counter);
  }
  if (Array.isArray(value)) {
    return value.map((item) => decodeHtmlEntitiesDeep(item, counter));
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, val]) => [key, decodeHtmlEntitiesDeep(val, counter)]));
  }
  return value;
}

/**
 * Defense-in-depth: decodes any HTML entities that slipped through parseAiJsonResponse().
 * This should normally be a no-op — if it fires, the primary decoder missed something.
 */
export function ensureDecodedResultGuard(result: unknown, logWarn: (msg: string) => void): unknown {
  const counter = { count: 0 };
  const decoded = decodeHtmlEntitiesDeep(result, counter);
  if (counter.count > 0) {
    logWarn(
      `[entity-guard] Response result contained ${counter.count} HTML entities that slipped through parseAiJsonResponse(). ` +
      'This indicates a code path bypassing the central decoder.',
    );
  }
  return decoded;
}

export function parseAiJsonResponse<T>(logger: StructuredLogger, raw: string, schema: z.ZodType<T>, step: string): T {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new InternalServerErrorException(`AI returned invalid JSON at step: ${step}`);
  }
  const counter = { count: 0 };
  const decoded = decodeHtmlEntitiesDeep(parsed, counter);
  if (counter.count > 0) {
    logger.event('html_entities_decoded', { step, count: counter.count });
  }
  const result = schema.safeParse(decoded);
  if (!result.success) {
    logger.errorEvent('schema_validation_failed', {
      step,
      errors: result.error.flatten(),
    });
    throw new InternalServerErrorException(`AI response did not match expected schema at step: ${step}`);
  }
  return result.data;
}

export type AiTimedStepResult<T> =
  | { data: T; fallback: false; durationMs: number; }
  | { data: null; fallback: true; durationMs: number; error: string; };

export async function runAiTimedStep<T>(logger: StructuredLogger, stepName: string, fn: () => Promise<T>): Promise<AiTimedStepResult<T>> {
  const start = performance.now();
  try {
    const data = await fn();
    const durationMs = Math.round(performance.now() - start);
    logger.event('step_complete', {
      step: stepName,
      durationMs,
      status: 'success',
    });
    return { data, fallback: false, durationMs };
  } catch (err: unknown) {
    const durationMs = Math.round(performance.now() - start);
    const error = err instanceof Error ? err.message : String(err);
    logger.errorEvent('step_failed', { step: stepName, durationMs, error });
    return { data: null, fallback: true, durationMs, error };
  }
}
