/**
 * Evaluates the quality and trustworthiness of a job posting.
 * Works directly from the raw job text so this step can run in parallel with the parse step.
 */
export function jobTruthPrompt(jobText: string): string {
  return `
You are a job market analyst. Evaluate the quality and honesty of the following job posting.

Job text:
"""
${jobText}
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
