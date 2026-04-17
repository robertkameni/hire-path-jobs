export interface JobRecord {
  id: string;
  status: 'queued' | 'processing' | 'completed' | 'partial' | 'failed';
  result?: unknown;
  errorCode?: string;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}
