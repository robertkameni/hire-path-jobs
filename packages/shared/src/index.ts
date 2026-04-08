export interface UserProfile {
  role?: string;
  skills?: string[];
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

export interface AnalysisResult {
  job: ParsedJob | null;
  insights: JobInsights | null;
  strategy: ContactStrategy | null;
  message: OutreachMessage | null;
  status: 'complete' | 'partial';
  fallbacks: FallbackInfo[];
  timings: Record<string, number>;
}

/** Full API response envelope returned by POST /api/analysis */
export interface AnalysisResponse {
  jobId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  result?: AnalysisResult;
  error?: string;
  createdAt: string;
  updatedAt: string;
}
