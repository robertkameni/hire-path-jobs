import { HttpErrorResponse } from "@angular/common/http";

export const formatError = (err: unknown): string => {
    if (err instanceof HttpErrorResponse) {
      // err.error can be a string, object, ProgressEvent, etc.
      const body = err.error;
      if (typeof body === 'string' && body.trim()) return body;

      if (body && typeof body === 'object' && 'error' in body && typeof (body as any).error === 'string') {
        return (body as any).error;
      }

      if (body && typeof body === 'object' && 'message' in body && typeof (body as any).message === 'string') {
        return (body as any).message;
      }

      return err.message || `Request failed (HTTP ${err.status})`;
    }

    if (err instanceof Error) return err.message;
    
    return typeof err === 'string' ? err : 'Request failed';
  }
