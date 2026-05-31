import type { OutreachMessage, ParsedJob } from '../schemas/analysis.schemas.js';

const SUBJECT_MAX_LEN = 88;
const PREFIX = 'Frage zur Rolle ';

function softenCompanyLegalForm(company: string): string {
  const t = company.trim();
  const stripped = t.replace(/\s+(GmbH|AG|UG|Ltd\.|LLC|S\.r\.l\.)\s*$/i, '').trim();
  return stripped.length > 0 ? stripped : t;
}

export function buildRecruiterValidationSubject(job: { title: string; company: string }): string {
  const company = softenCompanyLegalForm(job.company);
  const fullTitle = job.title.trim();
  const head = /\s-\s/.test(fullTitle) ? (fullTitle.split(/\s-\s/).at(0)?.trim() ?? fullTitle) : fullTitle;
  const suffix = ` bei ${company}`;
  let budget = SUBJECT_MAX_LEN - PREFIX.length - suffix.length;
  if (budget < 14) budget = 14;
  let role = head;
  if (role.length > budget) {
    role = `${head.slice(0, Math.max(0, budget - 1))}…`;
  }
  return `${PREFIX}${role}${suffix}`;
}

/** When the caller has no trusted profile, force the recruiter-validation subject; otherwise leave the model’s subject. */
export function applyRecruiterValidationSubjectWhenAnonymous(job: ParsedJob, message: OutreachMessage, hasTrustedProfile: boolean): OutreachMessage {
  if (hasTrustedProfile) return message;
  return { ...message, subject: buildRecruiterValidationSubject(job) };
}
