/**
 * Combines the parse and truth steps into a single LLM call.
 * Returns both the structured job data and the quality insights
 * so we save one round-trip to the AI provider.
 */
export function jobParseAndTruthPrompt(jobText: string): string {
  return `
You are a job description analyst. Analyse the job posting below and return TWO things in one JSON object:
1. Structured job data ("job")
2. Quality / trustworthiness insights ("insights")

Return ONLY a valid JSON object matching this exact shape (no markdown, no extra explanation):
{
  "job": {
    "title": "string",
    "company": "string",
    "location": "string",
    "salary": "string or null",
    "skills": ["string"],
    "requirements": ["string"],
    "responsibilities": ["string"],
    "remote": true | false
  },
  "insights": {
    "competitionLevel": "low" | "medium" | "high",
    "ghostRisk": "low" | "medium" | "high",
    "salaryFairness": "below-market" | "market" | "above-market" | "unknown",
    "redFlags": ["string"],
    "positives": ["string"]
  }
}

Job posting:
"""
${jobText}
"""
`.trim();
}
