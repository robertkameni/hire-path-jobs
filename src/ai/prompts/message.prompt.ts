import type {
  ParsedJob,
  ContactStrategy,
} from '../../analysis/interfaces/analysis.types';

interface UserProfile {
  role?: string;
  skills?: string[];
}

/**
 * Generates a personalized outreach message for the job application.
 */
export function messagePrompt(
  job: ParsedJob,
  strategy: ContactStrategy,
  userProfile?: UserProfile,
): string {
  return `
You are an expert at writing professional outreach messages. Write a concise, personalized message for the candidate below.

Job:
${JSON.stringify(job, null, 2)}

Contact strategy:
${JSON.stringify(strategy, null, 2)}

${userProfile ? `Candidate profile:\n${JSON.stringify(userProfile, null, 2)}` : ''}

Return ONLY a valid JSON object matching this exact shape (no markdown, no explanation):
{
  "subject": "string",
  "body": "string",
  "tone": "formal" | "friendly" | "direct"
}
`.trim();
}
