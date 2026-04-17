export type JobStatus =
  | 'queued'
  | 'processing'
  | 'partial'
  | 'completed'
  | 'failed';

export interface JobInfo {
  title: string;
  company: string;
  location: string;
  salary: string | null;
  skills: string[];
  requirements: string[];
  responsibilities: string[];
  remote?: boolean;
}

export interface Insights {
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

export interface Strategy {
  targetRole: string;
  contactChannels: string[];
  talkingPoints: string[];
  timing: string;
}

export interface Message {
  subject: string;
  body: string;
  tone: 'direct' | 'friendly' | 'formal';
}

export interface FallbackItem {
  step: string;
  reason?: string;
}

export interface JobResult {
  job: JobInfo | null;
  insights: Insights | null;
  strategy: Strategy | null;
  message: Message | null;
  // analysis-level status (not the job wrapper status)
  status: 'complete' | 'partial';
  fallbacks: FallbackItem[];
  timings: {
    parseJobAndTruth?: number;
    strategyAndMessage?: number;
  };
  cached?: boolean;
}

export interface JobResponse {
  jobId: string;
  status: JobStatus;
  result?: JobResult;
  error?: string;
  createdAt: string;
  updatedAt: string;
}
