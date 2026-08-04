import type { OutreachMessage, ParsedJob } from '../schemas/analysis.schemas.js';
import { decodeHtmlEntitiesDeep } from './ai-structured-step.js';

const SUBJECT_MAX_LEN = 88;
const PREFIX = 'Frage zur Rolle ';

function softenCompanyLegalForm(company: string): string {
  const t = company.trim();
  const stripped = t.replace(/\s+(GmbH|AG|UG|Ltd\.|LLC|S\.r\.l\.)\s*$/i, '').trim();
  return stripped.length > 0 ? stripped : t;
}

function truncateAtWordBoundary(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  const cut = text.slice(0, maxLen);
  const lastSpace = cut.lastIndexOf(' ');
  return `${lastSpace > 4 ? cut.slice(0, lastSpace) : cut}…`;
}

export function buildRecruiterValidationSubject(job: { title: string; company: string }): string {
  const decodedTitle = (decodeHtmlEntitiesDeep(job.title, { count: 0 }) as string).trim();
  const company = softenCompanyLegalForm(job.company);
  const head = /\s-\s/.test(decodedTitle) ? (decodedTitle.split(/\s-\s/).at(0)?.trim() ?? decodedTitle) : decodedTitle;
  const suffix = ` bei ${company}`;
  let budget = SUBJECT_MAX_LEN - PREFIX.length - suffix.length;
  if (budget < 14) budget = 14;
  const role = head.length > budget ? truncateAtWordBoundary(head, budget - 1) : head;
  return `${PREFIX}${role}${suffix}`;
}

/** When the caller has no trusted profile, force the recruiter-validation subject; otherwise leave the model’s subject. */
export function applyRecruiterValidationSubjectWhenAnonymous(job: ParsedJob, message: OutreachMessage, hasTrustedProfile: boolean): OutreachMessage {
  if (hasTrustedProfile) return message;
  return { ...message, subject: buildRecruiterValidationSubject(job) };
}
