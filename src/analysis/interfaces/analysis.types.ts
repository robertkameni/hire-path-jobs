export interface ParsedJob {
  title: string;
  company: string;
  location: string;
  salary?: string;
  skills: string[];
  requirements: string[];
  responsibilities: string[];
  remote?: boolean;
}

export interface JobInsights {
  competitionLevel: 'low' | 'medium' | 'high';
  ghostRisk: 'low' | 'medium' | 'high';
  salaryFairness: 'below-market' | 'market' | 'above-market' | 'unknown';
  redFlags: string[];
  positives: string[];
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
