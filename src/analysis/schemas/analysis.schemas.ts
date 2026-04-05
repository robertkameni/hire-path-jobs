import { z } from 'zod';

export const ParsedJobSchema = z.object({
  title: z.string(),
  company: z.string(),
  location: z.string(),
  salary: z.string().nullable().optional(),
  skills: z.array(z.string()),
  requirements: z.array(z.string()),
  responsibilities: z.array(z.string()),
  remote: z.boolean().optional(),
});

export const JobInsightsSchema = z.object({
  competitionLevel: z.enum(['low', 'medium', 'high']),
  competitionReason: z.string(),
  competitionConfidence: z.number().int().min(0).max(100),
  signalsLoweringCompetition: z.array(z.string()),
  signalsRaisingCompetition: z.array(z.string()),
  ghostRisk: z.enum(['low', 'medium', 'high']),
  ghostRiskReason: z.string(),
  ghostRiskConfidence: z.number().int().min(0).max(100),
  salaryFairness: z.enum(['below-market', 'market', 'above-market', 'unknown']),
  redFlags: z.array(z.string()),
  positives: z.array(z.string()),
  verdict: z.object({
    apply: z.boolean(),
    reason: z.string(),
  }),
});

export const ParsedJobAndInsightsSchema = z.object({
  job: ParsedJobSchema,
  insights: JobInsightsSchema,
});

export const ContactStrategySchema = z.object({
  targetRole: z.string(),
  contactChannels: z.array(z.string()),
  talkingPoints: z.array(z.string()),
  timing: z.string(),
});

export const OutreachMessageSchema = z.object({
  subject: z.string(),
  body: z.string(),
  tone: z.enum(['formal', 'friendly', 'direct']),
});
