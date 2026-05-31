import { createHmac, timingSafeEqual } from 'node:crypto';

function signDigest(jobId: string, secret: string): string {
  return createHmac('sha256', secret).update(jobId).digest('base64url');
}

/** Returns `{jobId}.{hmac}` suitable for Bearer authorization on GET /analysis/:id. */
export function signJobAccessToken(jobId: string, secret: string): string {
  return `${jobId}.${signDigest(jobId, secret)}`;
}

export function verifyJobAccessToken(jobId: string, token: string, secret: string): boolean {
  const separator = token.indexOf('.');
  if (separator <= 0) return false;

  const tokenJobId = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  if (tokenJobId !== jobId || signature.length === 0) return false;

  const expected = signDigest(jobId, secret);
  if (signature.length !== expected.length) return false;

  return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}
