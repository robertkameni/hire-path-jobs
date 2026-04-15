export interface JobRecord {
  id: string;
  status: 'queued' | 'processing' | 'completed' | 'partial' | 'failed';
  result?: unknown;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}
