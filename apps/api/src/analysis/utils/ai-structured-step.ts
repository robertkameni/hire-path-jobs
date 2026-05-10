import { performance } from 'node:perf_hooks';
import { InternalServerErrorException } from '@nestjs/common';
import type { z } from 'zod';
import type { StructuredLogger } from '../../common/logger/structured.logger.js';

export function parseAiJsonResponse<T>(logger: StructuredLogger, raw: string, schema: z.ZodType<T>, step: string): T {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new InternalServerErrorException(`AI returned invalid JSON at step: ${step}`);
  }
  const result = schema.safeParse(parsed);
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
  | { data: T; fallback: false; durationMs: number }
  | { data: null; fallback: true; durationMs: number; error: string };

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
