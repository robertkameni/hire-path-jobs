export interface AiPort {
  generateText(prompt: string, options?: { temperature?: number }): Promise<string>;
}

export const AI_Port = Symbol('AI_Port');