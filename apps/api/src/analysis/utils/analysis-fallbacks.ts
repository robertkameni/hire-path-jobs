import type { OutreachMessage, ParsedJob } from '../schemas/analysis.schemas.js';
import { applyRecruiterValidationSubjectWhenAnonymous } from './recruiter-validation-subject.js';

export function buildParseFailureResult(reason: string | undefined, durationMs: number) {
  return {
    job: null,
    insights: null,
    strategy: null,
    message: null,
    status: 'partial',
    fallbacks: [{ step: 'parseJobAndTruth', reason }],
    timings: { parseJobAndTruth: durationMs },
  };
}

function shortJobTitleForFallback(title: string): string {
  const t = title.trim();
  const head = /\s-\s/.test(t) ? (t.split(/\s-\s/).at(0)?.trim() ?? t) : t;
  return head.length <= 72 ? head : `${head.slice(0, 71)}…`;
}

function clipForFallbackSentence(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(0, max - 1))}…`;
}

function buildZeroProfileFallbackBridge(job: ParsedJob): string {
  const resp = job.responsibilities
    .map((s) => clipForFallbackSentence(s, 110))
    .filter((s) => s.length > 0)
    .slice(0, 2);
  const req = job.requirements
    .map((s) => clipForFallbackSentence(s, 110))
    .filter((s) => s.length > 0)
    .slice(0, 2);

  if (resp.length > 0 || req.length > 0) {
    const taskPart = resp.length > 0 ? `Als Aufgabenfelder werden etwa ${resp.join(' sowie ')} beschrieben.` : '';
    const reqPart = req.length > 0 ? `Hervorgehoben werden zudem Punkte wie ${req.join(' bzw. ')}.` : '';
    const out = `Aus der Ausschreibung lese ich Folgendes: ${taskPart} ${reqPart}`.trim().replace(/\s+/g, ' ');
    return out.length <= 720 ? out : `${out.slice(0, 719)}…`;
  }

  const skills = job.skills
    .map((s) => clipForFallbackSentence(s, 48))
    .filter((s) => s.length > 0)
    .slice(0, 5);

  if (skills.length > 0) {
    return `Im Profil der Stelle werden Themen und Anforderungen wie ${skills.join(', ')} stark betont; wie sich das im Tagesgeschäft konkret verteilt, wird für mich daraus allein noch nicht ganz klar.`;
  }

  return 'Worin der Schwerpunkt im Alltag im Vergleich zur formellen Titelbeschreibung wirklich liegt, wird mir aus der Anzeige noch nicht plastisch genug; genau das möchte ich vor einer Bewerbung kurz schärfen.';
}

function buildZeroProfileFallbackQuestion(job: ParsedJob): string {
  const blob = [job.title, ...job.responsibilities, ...job.requirements, ...job.skills].join(' ').toLowerCase();

  if (
    /\b(phd|quant|forschung|research|wissenschaft|modell|optimization|optimierung|liquidit|handel|trading)\b/.test(blob) &&
    /\b(software|entwicklung|developer|engineering|code|implementierung|system)\b/.test(blob)
  ) {
    return 'Liegt aus Ihrer Sicht der Schwerpunkt eher bei der Weiterentwicklung und dem Betrieb konkreter Trading- bzw. Optimierungssoftware, oder stärker bei methodischer Modellierung bzw. Forschung und späterer Übergabe in produktive Komponenten?';
  }

  if (/\b(junior|entry|einstieg|trainee|starter|berufseinsteiger|without experience|no dev experience)\b/.test(blob)) {
    return 'Wie sieht die typische erste Zeit aus: eher strukturierte Einarbeitung mit begleiteten Aufgaben, oder relativ frühe Verantwortung in klar abgegrenzten Arbeitspaketen?';
  }

  if (/\b(lead|principal|architect|staff|head of|manager|verantwortlich fürs team)\b/.test(blob)) {
    return 'Ist die Rolle in der Praxis eher stark technisch hands-on mit geleglicher Steuerung, oder überwiegend organisational mit Architektur-/Teamfokus und weniger eigener Implementierung?';
  }

  return 'Können Sie vorab einordnen, ob das Team die Rolle derzeit eher als operative Umsetzung mit kurzen Lieferzyklen oder als fachlich tiefgehende Arbeit an weniger, dafür anspruchsvolleren Themenblöcken versteht?';
}

function buildZeroProfileFallbackBody(job: ParsedJob): string {
  const shortTitle = shortJobTitleForFallback(job.title);
  const block1 = `ich interessiere mich für die ausgeschriebene Position „${shortTitle}“ bei ${job.company}. Bevor ich mich bewerbe, möchte ich die Rolle inhaltlich noch besser einordnen und stelle dazu eine konkrete Nachfrage.`;

  const bridge = buildZeroProfileFallbackBridge(job);
  const question = buildZeroProfileFallbackQuestion(job);

  return `Hallo,\n\n${block1}\n\n${bridge}\n\n${question}\n\nVielen Dank im Voraus für eine kurze Einordnung.\n\nViele Grüße`;
}

export function buildFallbackMessage(job: ParsedJob, hasTrustedProfile: boolean): OutreachMessage {
  if (!hasTrustedProfile) {
    return applyRecruiterValidationSubjectWhenAnonymous(
      job,
      {
        subject: '_',
        body: buildZeroProfileFallbackBody(job),
        tone: 'friendly',
      },
      false,
    );
  }
  const skillLine =
    job.skills.length > 0 ? ` Mein Hintergrund in ${job.skills.slice(0, 2).join(' und ')} passt direkt zu den Anforderungen dieser Stelle.` : '';
  return {
    subject: `${job.title} — ${job.company}`,
    body: `Hallo, ich bin auf die Stelle als ${job.title} bei ${job.company} aufmerksam geworden und möchte mich vor einer formellen Bewerbung direkt melden.${skillLine} Sind Sie die richtige Ansprechperson für diese Position, oder können Sie mich an jemanden weiterleiten?`,
    tone: 'direct',
  };
}
