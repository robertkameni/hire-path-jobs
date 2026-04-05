/**
 * Parses a raw job description into a structured JSON object.
 */
export function jobParsePrompt(jobText: string): string {
  return `
You are a job description parser. Extract structured data from the job description below.

Return ONLY a valid JSON object matching this exact shape (no markdown, no explanation):
{
  "title": "string",
  "company": "string",
  "location": "string",
  "salary": "string or null",
  "skills": ["string"],
  "requirements": ["string"],
  "responsibilities": ["string"],
  "remote": true | false
}

Job description:
"""
${jobText}
"""
`.trim();
}
