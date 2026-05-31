import Joi from 'joi';

/** Local-only default; production must set JOB_ACCESS_SECRET explicitly. */
export const DEV_JOB_ACCESS_SECRET = 'local-dev-job-access-secret-32chars-min';

export function jobAccessSecretSchema(): Joi.StringSchema {
  return Joi.string()
    .min(32)
    .when('NODE_ENV', {
      is: 'production',
      // biome-ignore lint/suspicious/noThenProperty: Joi `.when()` conditional API
      then: Joi.required(),
      otherwise: Joi.string().default(DEV_JOB_ACCESS_SECRET),
    });
}
