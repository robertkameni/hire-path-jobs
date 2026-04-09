export interface PipelineStep {
  name: string;
  run(input: any): Promise<any>;
}
