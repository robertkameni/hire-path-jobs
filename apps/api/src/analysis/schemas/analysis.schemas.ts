import { z } from 'zod';

/** Zero-profile body: at least one question; allow a rare second ? (model slip) but not open-ended lists. */
function bodyQuestionMarkCountOk(body: string): boolean {
  const n = (body.match(/\?/g) ?? []).length;
  return n >= 1 && n <= 2;
}

/** Closing line required for recruiter-style mails. */
function bodyEndsWithGermanOutreachClosing(body: string): boolean {
  const lastNonEmpty =
    body
      .trimEnd()
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
      .at(-1) ?? '';
  if (/^(Viele Grüße|Beste Grüße)\.?$/i.test(lastNonEmpty)) return true;
  if (/^Mit freundlichen Grüßen\.?$/i.test(lastNonEmpty)) return true;
  return false;
}

const shortString = z.string().min(1).max(500);
export const longString = z.string().min(1).max(2000);
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
  verdict: z.object({ apply: z.boolean(), reason: shortString }),
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
  body: z.string().min(20).max(2000),
  tone: z.enum(['formal', 'friendly', 'direct']),
});

export const StrategyAndMessageSchema = z.object({
  strategy: ContactStrategySchema,
  message: OutreachMessageSchema,
});

/** Stricter caps when no profile — discourages CV-style bodies that pass generic message schema. */
export const OutreachMessageZeroProfileSchema = OutreachMessageSchema.extend({
  subject: z.string().min(1).max(100),
  body: z
    .string()
    .min(120)
    .max(1550)
    .refine(bodyQuestionMarkCountOk, {
      message: 'message.body must contain 1–2 question marks',
    })
    .refine(bodyEndsWithGermanOutreachClosing, {
      message: 'message.body must end with Viele Grüße, Beste Grüße, or Mit freundlichen Grüßen on its own line',
    }),
});

export const StrategyAndMessageZeroProfileSchema = z.object({
  strategy: ContactStrategySchema,
  message: OutreachMessageZeroProfileSchema,
});
