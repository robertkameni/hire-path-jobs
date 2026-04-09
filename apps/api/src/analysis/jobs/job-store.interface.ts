export interface JobRecord {
  id: string;
  status: 'queued' | 'processing' | 'completed' | 'partial' | 'failed';
  result?: any;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}
