import type { ParsedJob } from '../../analysis/interfaces/analysis.types';

/**
 * Evaluates the quality and trustworthiness of a job posting.
 */
export function jobTruthPrompt(job: ParsedJob, originalText: string): string {
  return `
You are a job market analyst. Evaluate the quality and honesty of the following job posting.

Parsed job data:
${JSON.stringify(job, null, 2)}

Original job text:
"""
${originalText}
"""

Return ONLY a valid JSON object matching this exact shape (no markdown, no explanation):
{
  "competitionLevel": "low" | "medium" | "high",
  "ghostRisk": "low" | "medium" | "high",
  "salaryFairness": "below-market" | "market" | "above-market" | "unknown",
  "redFlags": ["string"],
  "positives": ["string"]
}
`.trim();
}
