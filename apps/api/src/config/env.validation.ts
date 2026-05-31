import Joi from 'joi';

export const DEV_JOB_ACCESS_SECRET = 'local-dev-job-access-secret-32chars-min';

export function jobAccessSecretSchema(): Joi.StringSchema {
  return Joi.string()
    .min(32)
    .when('NODE_ENV', {
      is: 'production',
      // biome-ignore lint/suspicious/noThenProperty: Joi `.when()` conditional API
      then: Joi.required().custom((value: string) => {
        if (value === DEV_JOB_ACCESS_SECRET) {
          throw new Error(
            'FATAL: JOB_ACCESS_SECRET cannot be the development default in production. ' + 'Set a unique secret with at least 32 random characters.',
          );
        }
        return value;
      }),
      otherwise: Joi.string().default(DEV_JOB_ACCESS_SECRET),
    });
}
