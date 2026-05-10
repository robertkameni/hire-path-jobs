import type { UserProfileDto } from '../dto/analyze-job.dto.js';

/**
 * Treats missing/empty profiles as absent so prompts do not show a "trusted" block for `{}`
 * and the model is not nudged into inventing credentials.
 */
export function effectiveUserProfile(userProfile: unknown): UserProfileDto | undefined {
  if (userProfile === null || userProfile === undefined) return undefined;
  if (typeof userProfile !== 'object') return undefined;
  const o = userProfile as Record<string, unknown>;
  const role = typeof o.role === 'string' ? o.role.trim() : '';
  const rawSkills = Array.isArray(o.skills) ? o.skills : [];
  const skills = rawSkills.filter((s): s is string => typeof s === 'string' && s.trim().length > 0).map((s) => s.trim());
  if (role.length === 0 && skills.length === 0) return undefined;
  const out: UserProfileDto = {};
  if (role.length > 0) out.role = role;
  if (skills.length > 0) out.skills = skills;
  return out;
}
