export interface UserProfile {
  role?: string;
  skills?: string[];
}

export interface AnalyzeJobInput {
  jobText: string;
  userProfile?: UserProfile;
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

export interface AnalysisResult {
  job: ParsedJob;
  insights: JobInsights;
  strategy: ContactStrategy;
  message: OutreachMessage;
}
