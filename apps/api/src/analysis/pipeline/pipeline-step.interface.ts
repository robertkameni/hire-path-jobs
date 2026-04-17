export interface PipelineStep<TInput = unknown, TOutput = unknown> {
  name: string;
  run(input: TInput): Promise<TOutput>;
}
