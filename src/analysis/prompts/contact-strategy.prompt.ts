import type {
    ParsedJob,
    JobInsights,
    UserProfile,
} from '../interfaces/analysis.types';

/**
 * Generates a targeted contact strategy based on the job and quality insights.
 */
export function contactStrategyPrompt(
  job: ParsedJob,
  insights: JobInsights,
  userProfile?: UserProfile,
): string {
  return `
You are a career coach. Create a contact strategy for a candidate applying to the job below.

Job:
${JSON.stringify(job, null, 2)}

Insights:
${JSON.stringify(insights, null, 2)}

${userProfile ? `Candidate profile:\n${JSON.stringify(userProfile, null, 2)}` : ''}

Return ONLY a valid JSON object matching this exact shape (no markdown, no explanation):
{
  "targetRole": "string (job title of the person to contact)",
  "contactChannels": ["string"],
  "talkingPoints": ["string"],
  "timing": "string (e.g. 'Apply immediately', 'Wait for next cycle')"
}
`.trim();
}
