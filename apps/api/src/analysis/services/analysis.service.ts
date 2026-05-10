import { performance } from 'node:perf_hooks';
import { Inject, Injectable, InternalServerErrorException } from '@nestjs/common';
import type { z } from 'zod';
import { AI_Port, type AiPort } from '../../ai/shared/ai.port.js';
import { StructuredLogger } from '../../common/logger/structured.logger.js';
import { jobParseAndTruthPrompt } from '../prompts/job-parse-and-truth.prompt.js';
import { strategyAndMessagePrompt } from '../prompts/strategy-and-message.prompt.js';
import { strategyAndMessageZeroProfilePrompt } from '../prompts/strategy-and-message-zero-profile.prompt.js';
import {
  type ContactStrategySchema,
  type JobInsightsSchema,
  type OutreachMessageSchema,
  ParsedJobAndInsightsSchema,
  type ParsedJobSchema,
  StrategyAndMessageSchema,
  StrategyAndMessageZeroProfileSchema,
} from '../schemas/analysis.schemas.js';
import { effectiveUserProfile } from '../utils/effective-user-profile.js';
import { buildRecruiterValidationSubject } from '../utils/recruiter-validation-subject.js';

type ParsedJob = z.infer<typeof ParsedJobSchema>;
type JobInsights = z.infer<typeof JobInsightsSchema>;
type ContactStrategy = z.infer<typeof ContactStrategySchema>;
type OutreachMessage = z.infer<typeof OutreachMessageSchema>;

type Fallback = { step: string; reason?: string };

function buildParseFailureResult(reason: string | undefined, durationMs: number) {
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

/** Keeps fallback mail bodies readable when bullet points from the ad are long. */
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

function buildFallbackMessage(job: ParsedJob, hasTrustedProfile: boolean): OutreachMessage {
  if (!hasTrustedProfile) {
    return {
      subject: buildRecruiterValidationSubject(job),
      body: buildZeroProfileFallbackBody(job),
      tone: 'friendly',
    };
  }
  const skillLine =
    job.skills.length > 0 ? ` Mein Hintergrund in ${job.skills.slice(0, 2).join(' und ')} passt direkt zu den Anforderungen dieser Stelle.` : '';
  return {
    subject: `${job.title} — ${job.company}`,
    body: `Hallo, ich bin auf die Stelle als ${job.title} bei ${job.company} aufmerksam geworden und möchte mich vor einer formellen Bewerbung direkt melden.${skillLine} Sind Sie die richtige Ansprechperson für diese Position, oder können Sie mich an jemanden weiterleiten?`,
    tone: 'direct',
  };
}

@Injectable()
export class AnalysisService {
  private logger = new StructuredLogger(AnalysisService.name);

  constructor(@Inject(AI_Port) private readonly aiPort: AiPort) {}

  async analyze(input: { jobText: string; userProfile?: unknown; jobId?: string }) {
    const { jobId } = input;
    const userProfile = effectiveUserProfile(input.userProfile);
    this.logger.event('pipeline_start', { jobId });
    const timings: Record<string, number> = {};
    const fallbacks: Fallback[] = [];

    const parseResult = await this.runStep('parseJobAndTruth', () => this.parseJobAndTruth(input.jobText));

    if (!parseResult.fallback) {
      timings.parseJobAndTruth = parseResult.durationMs;
    } else {
      this.logger.errorEvent('pipeline_aborted', {
        jobId,
        step: 'parseJobAndTruth',
        reason: parseResult.error,
      });

      return buildParseFailureResult(parseResult.error ?? 'Parse step failed', parseResult.durationMs);
    }
    const { job, insights } = parseResult.data;

    const strategyAndMessageResult = await this.runStep('strategyAndMessage', () => this.generateStrategyAndMessage(job, insights, userProfile));

    timings.strategyAndMessage = strategyAndMessageResult.durationMs;

    let strategy: ContactStrategy | null = null;
    let message: OutreachMessage;

    if (strategyAndMessageResult.fallback) {
      fallbacks.push({
        step: 'strategyAndMessage',
        reason: strategyAndMessageResult.error ?? 'Strategy+message step failed',
      });
      message = buildFallbackMessage(job, userProfile !== undefined);
    } else {
      strategy = strategyAndMessageResult.data.strategy;
      message = strategyAndMessageResult.data.message;
      if (userProfile === undefined) {
        message = {
          ...message,
          subject: buildRecruiterValidationSubject(job),
        };
      }
    }

    this.logger.event('pipeline_complete', {
      jobId,
      status: fallbacks.length === 0 ? 'complete' : 'partial',
      fallbackSteps: fallbacks.map((f) => f.step),
      ...Object.fromEntries(Object.entries(timings).map(([k, v]) => [`${k}Ms`, v])),
    });

    return {
      job,
      insights,
      strategy,
      message,
      status: fallbacks.length === 0 ? 'complete' : 'partial',
      fallbacks,
      timings,
    };
  }

  private async runStep<T>(name: string, fn: () => Promise<T>) {
    const start = performance.now();
    try {
      const data = await fn();
      const durationMs = Math.round(performance.now() - start);
      this.logger.event('step_complete', {
        step: name,
        durationMs,
        status: 'success',
      });
      return { data, fallback: false, durationMs };
    } catch (err: unknown) {
      const durationMs = Math.round(performance.now() - start);
      const error = err instanceof Error ? err.message : String(err);
      this.logger.errorEvent('step_failed', { step: name, durationMs, error });
      return { data: null, fallback: true, durationMs, error };
    }
  }

  private parseAiResponse<T>(raw: string, schema: z.ZodType<T>, step: string): T {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      throw new InternalServerErrorException(`AI returned invalid JSON at step: ${step}`);
    }
    const result = schema.safeParse(parsed);
    if (!result.success) {
      this.logger.errorEvent('schema_validation_failed', {
        step,
        errors: result.error.flatten(),
      });
      throw new InternalServerErrorException(`AI response did not match expected schema at step: ${step}`);
    }
    return result.data;
  }

  private async parseJobAndTruth(jobText: string) {
    const raw = await this.aiPort.generateText(jobParseAndTruthPrompt(jobText), {
      temperature: 0,
    });
    return this.parseAiResponse(raw, ParsedJobAndInsightsSchema, 'parseJobAndTruth');
  }

  private async generateStrategyAndMessage(job: ParsedJob, insights: JobInsights, userProfile: unknown) {
    const hasProfile = userProfile !== undefined;
    const raw = await this.aiPort.generateText(
      hasProfile ? strategyAndMessagePrompt(job, insights, userProfile) : strategyAndMessageZeroProfilePrompt(job, insights),
      { temperature: hasProfile ? 0.15 : 0 },
    );
    return this.parseAiResponse(raw, hasProfile ? StrategyAndMessageSchema : StrategyAndMessageZeroProfileSchema, 'generateStrategyAndMessage');
  }
}
