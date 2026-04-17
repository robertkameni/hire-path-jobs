import { HttpErrorResponse } from '@angular/common/http';

const getStringProp = (value: unknown, key: string): string | undefined => {
  if (!value || typeof value !== 'object') return undefined;
  
  const record = value as Record<string, unknown>;
  const prop = record[key];
  
  return typeof prop === 'string' && prop.trim() ? prop : undefined;
};

export const formatError = (err: unknown): string => {
  if (err instanceof HttpErrorResponse) {
    // err.error can be a string, object, ProgressEvent, etc.
    const body = err.error;
    
    if (typeof body === 'string' && body.trim()) return body;

    const error = getStringProp(body, 'error');
    if (error) return error;

    const message = getStringProp(body, 'message');
    if (message) return message;

    return err.message || `Request failed (HTTP ${err.status})`;
  }

  if (err instanceof Error) return err.message;

  return typeof err === 'string' ? err : 'Request failed';
};
