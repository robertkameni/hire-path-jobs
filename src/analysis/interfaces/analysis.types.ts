export interface UserProfile {
  role?: string;
  skills?: string[];
}

export interface AnalyzeJobInput {
  jobText: string;
  userProfile?: UserProfile;
  /** Propagated from JobsService for structured log correlation. */
  jobId?: string;
}

export interface ParsedJob {
  title: string;
  company: string;
  location: string;
  salary?: string | null;
  skills: string[];
  requirements: string[];
  responsibilities: string[];
  remote?: boolean;
}

export interface JobInsights {
  competitionLevel: 'low' | 'medium' | 'high';
  competitionReason: string;
  competitionConfidence: number;
  signalsLoweringCompetition: string[];
  signalsRaisingCompetition: string[];
  ghostRisk: 'low' | 'medium' | 'high';
  ghostRiskReason: string;
  ghostRiskConfidence: number;
  salaryFairness: 'below-market' | 'market' | 'above-market' | 'unknown';
  redFlags: string[];
  positives: string[];
  verdict: {
    apply: boolean;
    reason: string;
  };
}

export interface ContactStrategy {
  targetRole: string;
  contactChannels: string[];
  talkingPoints: string[];
  timing: string;
}

export interface OutreachMessage {
  subject: string;
  body: string;
  tone: 'formal' | 'friendly' | 'direct';
}

export interface FallbackInfo {
  step: string;
  reason: string;
}

/**
 * Returned by every analysis run.
 * status='complete' — all steps succeeded.
 * status='partial'  — one or more steps failed; failed fields are null and
 *                     fallbacks[] describes what was substituted.
 */
export interface AnalysisResult {
  job: ParsedJob | null;
  insights: JobInsights | null;
  strategy: ContactStrategy | null;
  message: OutreachMessage | null;
  status: 'complete' | 'partial';
  fallbacks: FallbackInfo[];
  /** Raw scraped text — present only when the parse step itself failed. */
  /** Wall-clock milliseconds per pipeline step for observability. */
  timings: Record<string, number>;
}
