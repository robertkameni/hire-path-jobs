/**
 * Base contract for every analysis pipeline step.
 *
 * Design goals:
 * - Each step is independently retryable and replaceable.
 * - durationMs provides per-step observability without external APM.
 * - Fallbacks are declared next to the step that produces them, not in the orchestrator.
 */
export interface StepResult<T> {
  data: T;
  /** true when the step failed and data was filled by a rule-based fallback */
  fallback: boolean;
  durationMs: number;
  /** present only when fallback=true */
  error?: string;
}

export interface PipelineStep<TInput, TOutput> {
  readonly name: string;
  execute(input: TInput): Promise<StepResult<TOutput>>;
}
