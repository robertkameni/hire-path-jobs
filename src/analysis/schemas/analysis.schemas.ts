import { z } from 'zod';

/** Shared constraints */
const shortString = z.string().min(1).max(500);
const longString = z.string().min(1).max(2_000);
const stringArray = z.array(shortString).max(30);

export const ParsedJobSchema = z.object({
  title: shortString,
  company: shortString,
  location: shortString,
  salary: z.string().max(200).nullable().optional(),
  skills: stringArray,
  requirements: stringArray,
  responsibilities: stringArray,
  remote: z.boolean().optional(),
});

export const JobInsightsSchema = z.object({
  competitionLevel: z.enum(['low', 'medium', 'high']),
  competitionReason: shortString,
  competitionConfidence: z.number().int().min(0).max(100),
  signalsLoweringCompetition: stringArray,
  signalsRaisingCompetition: stringArray,
  ghostRisk: z.enum(['low', 'medium', 'high']),
  ghostRiskReason: shortString,
  ghostRiskConfidence: z.number().int().min(0).max(100),
  salaryFairness: z.enum(['below-market', 'market', 'above-market', 'unknown']),
  redFlags: stringArray,
  positives: stringArray,
  verdict: z.object({
    apply: z.boolean(),
    reason: shortString,
  }),
});

export const ParsedJobAndInsightsSchema = z.object({
  job: ParsedJobSchema,
  insights: JobInsightsSchema,
});

export const ContactStrategySchema = z.object({
  targetRole: shortString,
  contactChannels: z.array(shortString).min(1).max(10),
  talkingPoints: z.array(shortString).min(1).max(10),
  timing: shortString,
});

export const OutreachMessageSchema = z.object({
  subject: z.string().min(1).max(200),
  body: z.string().min(20).max(2_000),
  tone: z.enum(['formal', 'friendly', 'direct']),
});

/** Re-export longString for use in other schema files if needed */
export { longString };
