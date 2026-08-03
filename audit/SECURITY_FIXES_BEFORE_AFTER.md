# Security Fixes - Before/After Technical Comparison

---

## Fix #1: DTO Validation Bypass (F-3.2)

**Vulnerability:** Both `jobUrl` and `jobText` could be sent together, causing validation to be skipped on short/invalid inputs.

### Before (Vulnerable)
```typescript
// apps/api/src/analysis/dto/analyze-job.dto.ts

export class AnalyzeJobDto {
  @ValidateIf((o: AnalyzeJobDto) => !o.jobText?.trim())
  // ❌ Problem: Only validates if jobText is EMPTY
  // ❌ If both are provided, this validator is SKIPPED
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  jobUrl?: string;

  @ValidateIf((o: AnalyzeJobDto) => !o.jobUrl?.trim())
  // ❌ Problem: Only validates if jobUrl is EMPTY
  // ❌ If both are provided, this validator is SKIPPED
  @IsString()
  @MinLength(200)
  @MaxLength(120000)
  jobText?: string;

  @Validate(AtLeastOneOfJobUrlOrJobTextConstraint)
  @ApiHideProperty()
  readonly _atLeastOne?: true;

  @ApiPropertyOptional({
    type: UserProfileDto,
    description: 'Optional candidate profile...',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => UserProfileDto)
  userProfile?: UserProfileDto;
}

// Attack vector:
// POST /api/analysis
// {
//   "jobUrl": "not-validated-because-jobText-exists",
//   "jobText": "x"  // Not validated because jobUrl exists
// }
// Result: Short jobText bypasses MinLength(200) check
```

### After (Secure)
```typescript
// apps/api/src/analysis/dto/analyze-job.dto.ts

export class AnalyzeJobDto {
  @ValidateIf((o: AnalyzeJobDto) => !!o.jobUrl?.trim())
  // ✅ Now: Validates when jobUrl IS PROVIDED
  // ✅ Field constraints ALWAYS enforced if present
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  jobUrl?: string;

  @ValidateIf((o: AnalyzeJobDto) => !!o.jobText?.trim())
  // ✅ Now: Validates when jobText IS PROVIDED
  // ✅ MinLength(200) enforced on any provided jobText
  @IsString()
  @MinLength(200)
  @MaxLength(120000)
  jobText?: string;

  @Validate(AtLeastOneOfJobUrlOrJobTextConstraint)
  @ApiHideProperty()
  readonly _atLeastOne?: true;

  @ApiPropertyOptional({
    type: UserProfileDto,
    description: 'Optional candidate profile...',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => UserProfileDto)
  userProfile?: UserProfileDto;
}

// Attack prevented:
// POST /api/analysis
// {
//   "jobUrl": "https://example.com/job",  // VALIDATED as URL
//   "jobText": "x"                         // REJECTED: < 200 chars
// }
// Result: 400 Bad Request ✅
```

### Verification

| Scenario | Before | After |
|----------|--------|-------|
| Both valid | ✅ 202 | ✅ 202 |
| Both invalid | ⚠️ Mixed (one skipped) | ❌ 400 |
| jobUrl valid, jobText short | ❌ 202 (bypassed) | ✅ 400 |
| jobUrl invalid, jobText long | ❌ 202 (bypassed) | ✅ 400 |

---

## Fix #2: Production Secret Guard (F-3.4)

**Vulnerability:** Development default secret could be accidentally deployed to production, enabling token forgery.

### Before (Vulnerable)
```typescript
// apps/api/src/config/env.validation.ts

export const DEV_JOB_ACCESS_SECRET = 'local-dev-job-access-secret-32chars-min';

export function jobAccessSecretSchema(): Joi.StringSchema {
  return Joi.string()
    .min(32)
    .when('NODE_ENV', {
      is: 'production',
      // ❌ Problem: No validation of the secret value itself
      // ❌ If NODE_ENV=production and secret is the dev default,
      //    application boots successfully ⚠️
      then: Joi.required(),
      otherwise: Joi.string().default(DEV_JOB_ACCESS_SECRET),
    });
}

// Scenario (PROD misconfiguration):
// NODE_ENV=production
// JOB_ACCESS_SECRET=local-dev-job-access-secret-32chars-min
// CORS_ORIGIN=https://prod.example.com
// 
// Result: ⚠️ Application boots with PREDICTABLE HMAC SECRET
// Impact: Attacker can forge job access tokens (CRITICAL)
```

### After (Secure)
```typescript
// apps/api/src/config/env.validation.ts

export const DEV_JOB_ACCESS_SECRET = 'local-dev-job-access-secret-32chars-min';

export function jobAccessSecretSchema(): Joi.StringSchema {
  return Joi.string()
    .min(32)
    .when('NODE_ENV', {
      is: 'production',
      // ✅ Now: Custom validator checks secret value in production
      then: Joi.required().custom((value: string) => {
        if (value === DEV_JOB_ACCESS_SECRET) {
          // ✅ FAIL CLOSED: Crash immediately if misconfigured
          throw new Error(
            'FATAL: JOB_ACCESS_SECRET cannot be the development default in production. ' +
              'Set a unique secret with at least 32 random characters.',
          );
        }
        return value;
      }),
      otherwise: Joi.string().default(DEV_JOB_ACCESS_SECRET),
    });
}

// Scenario (PROD misconfiguration):
// NODE_ENV=production
// JOB_ACCESS_SECRET=local-dev-job-access-secret-32chars-min
// CORS_ORIGIN=https://prod.example.com
// 
// Result: ❌ Application CRASHES on boot with FATAL error
// Impact: Misconfiguration caught before running
```

### Verification

| State | Before | After |
|-------|--------|-------|
| NODE_ENV=dev, default secret | ✅ Boots | ✅ Boots |
| NODE_ENV=dev, custom secret | ✅ Boots | ✅ Boots |
| NODE_ENV=prod, default secret | ❌ Boots (VULN) | ❌ Crashes (SAFE) |
| NODE_ENV=prod, custom secret | ✅ Boots | ✅ Boots |

**Security Impact:**
- **Before:** Application runs with predictable HMAC → Token forgery possible
- **After:** Application cannot start with weak secret → Configuration error caught

---

## Fix #3: Swagger Environment Guard (F-3.5)

**Vulnerability:** Swagger documentation exposes API endpoints, parameters, and examples in production.

### Before (Vulnerable)
```typescript
// apps/api/src/create-app.ts

export function configureHttpServer(app: NestExpressApplication): void {
  const config = app.get(ConfigService);
  // ... CORS setup ...
  app.setGlobalPrefix('api');
  app.useGlobalPipes(...);

  // ❌ Problem: Swagger ALWAYS mounted
  // ❌ In production, documentation is publicly accessible
  const spec = new DocumentBuilder()
    .setTitle('hire-path-jobs')
    .setDescription(
      'Send a job posting URL and get back structured job data, ' +
        'ghost risk analysis, competition level, contact strategy, and a ready-to-send outreach message.',
    )
    .setVersion('1.0')
    .build();

  const document = SwaggerModule.createDocument(app, spec);
  SwaggerModule.setup('api/docs', app, document, {
    jsonDocumentUrl: 'api/docs-json',
  });
  // Swagger mounted without environment check
}

// Attack scenario:
// GET https://prod-api.example.com/api/docs
// Result: ⚠️ 200 OK - Full API documentation visible
// 
// GET https://prod-api.example.com/api/docs-json
// Result: ⚠️ 200 OK - OpenAPI spec JSON visible
// 
// Attacker can:
// - Enumerate all API endpoints
// - Discover parameter names and types
// - Read request/response examples
// - Automate exploitation using spec
```

### After (Secure)
```typescript
// apps/api/src/create-app.ts

export function configureHttpServer(app: NestExpressApplication): void {
  const config = app.get(ConfigService);
  const nodeEnv = config.get<string>('NODE_ENV', 'development');
  // ... CORS setup ...
  app.setGlobalPrefix('api');
  app.useGlobalPipes(...);

  // ✅ Now: Swagger ONLY in non-production
  // ✅ Production: Routes never registered, 404 response
  if (nodeEnv !== 'production') {
    const spec = new DocumentBuilder()
      .setTitle('hire-path-jobs')
      .setDescription(
        'Send a job posting URL and get back structured job data, ' +
          'ghost risk analysis, competition level, contact strategy, and a ready-to-send outreach message.',
      )
      .setVersion('1.0')
      .build();

    const document = SwaggerModule.createDocument(app, spec);
    SwaggerModule.setup('api/docs', app, document, {
      jsonDocumentUrl: 'api/docs-json',
    });
  }
  // Routes only registered in development/staging
}

// Secure scenario:
// GET https://prod-api.example.com/api/docs
// Result: ✅ 404 Not Found - Route not registered
// 
// GET https://prod-api.example.com/api/docs-json
// Result: ✅ 404 Not Found - Route not registered
// 
// Attacker cannot:
// - Enumerate API endpoints
// - Discover parameter names
// - Read examples or responses
// - Automate exploitation using spec
```

### Verification

| Environment | Before | After |
|-------------|--------|-------|
| Development | ✅ `/api/docs` → Swagger UI | ✅ `/api/docs` → Swagger UI |
| Staging | ✅ `/api/docs` → Swagger UI | ✅ `/api/docs` → Swagger UI |
| Production | ⚠️ `/api/docs` → Swagger UI (VULN) | ✅ `/api/docs` → 404 (SAFE) |

**Security Impact:**
- **Before:** API reconnaissance possible in production
- **After:** API reconnaissance impossible in production

---

## Fix #4: CORS Origin Requirement (F-3.6)

**Vulnerability:** Default `CORS_ORIGIN=*` allows requests from any origin in production.

### Before (Vulnerable)
```typescript
// apps/api/src/create-app.ts (original)

export function configureHttpServer(app: NestExpressApplication): void {
  const config = app.get(ConfigService);
  const corsRaw = config.get<string>('CORS_ORIGIN', '*').trim();
  // ❌ Problem: Default is '*' for all environments
  // ❌ Production can accidentally use wildcard
  let origin: boolean | string[] = true;
  if (corsRaw !== '*') {
    const list = corsRaw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    origin = list.length > 0 ? list : true;
  }
  app.enableCors({
    origin,
    // ... other config ...
  });
}

// Misconfiguration scenario:
// NODE_ENV=production
// # CORS_ORIGIN not set → uses default '*'
// 
// Request from attacker origin:
// Origin: https://evil.com
// 
// Response headers: ✅ Include:
// Access-Control-Allow-Origin: *
// 
// Result: ⚠️ Attacker can make cross-origin requests to API
```

### After (Secure)
```typescript
// apps/api/src/create-app.ts

export function configureHttpServer(app: NestExpressApplication): void {
  const config = app.get(ConfigService);
  const nodeEnv = config.get<string>('NODE_ENV', 'development');

  // ✅ Now: Different behavior for dev vs. production
  let origin: boolean | string[];
  if (nodeEnv === 'production') {
    const corsRaw = config.get<string>('CORS_ORIGIN', '').trim();
    // ✅ Production: CORS_ORIGIN is REQUIRED
    // ✅ Empty or missing → Application crashes on boot
    if (!corsRaw) {
      throw new Error(
        'FATAL: CORS_ORIGIN must be explicitly configured in production. ' +
          'Provide a comma-separated list of allowed origins.',
      );
    }
    const list = corsRaw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    origin = list.length > 0 ? list : false;
    // ✅ Validate that we have at least one origin
    if (!origin || (Array.isArray(origin) && origin.length === 0)) {
      throw new Error(
        'FATAL: CORS_ORIGIN resulted in empty origin list. ' +
          'Provide at least one valid origin for production.',
      );
    }
  } else {
    // Development: Allow flexible config or default to all
    const corsRaw = config.get<string>('CORS_ORIGIN', '*').trim();
    if (corsRaw === '*') {
      origin = true; // Allow all
    } else {
      const list = corsRaw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      origin = list.length > 0 ? list : true;
    }
  }

  app.enableCors({
    origin,
    credentials: true,
  });
}

// Secure scenario:
// NODE_ENV=production
// # CORS_ORIGIN not set → FATAL error, app crashes
// 
// NODE_ENV=production
// CORS_ORIGIN=https://app.example.com,https://www.example.com
// # Application boots
// 
// Request from allowed origin:
// Origin: https://app.example.com
// 
// Response headers: ✅ Include:
// Access-Control-Allow-Origin: https://app.example.com
// 
// Request from attacker origin:
// Origin: https://evil.com
// 
// Response headers: ❌ NO CORS headers
// Browser blocks cross-origin request
```

### Verification

| State | Before | After |
|-------|--------|-------|
| NODE_ENV=dev, CORS unset | ✅ Boots with `*` | ✅ Boots with `*` |
| NODE_ENV=prod, CORS unset | ⚠️ Boots with `*` (VULN) | ❌ Crashes (SAFE) |
| NODE_ENV=prod, CORS set | ✅ Boots with origins | ✅ Boots with origins |
| Preflight from evil.com | ⚠️ Allowed (VULN) | ❌ Blocked (SAFE) |

**Security Impact:**
- **Before:** Accidental wildcard CORS in production enables CSRF/CORS bypass
- **After:** Production CORS must be explicitly configured, cannot boot otherwise

---

## Security Posture Improvement Summary

| Risk | Severity | Before | After | Improvement |
|------|----------|--------|-------|-------------|
| DTO bypass | Medium | ❌ Exploitable | ✅ Blocked | Validation always enforced |
| Dev secret in prod | **Critical** | ⚠️ Runs with weak secret | ❌ Crashes | Fail-closed architecture |
| Swagger in prod | Medium | ⚠️ Endpoint exposed | ✅ Blocked | Routes not registered |
| CORS in prod | Medium | ⚠️ Wildcard possible | ❌ Crashes if missing | Explicit requirement |
| **Overall** | **High** | **Multiple exploits** | **All blocked** | **Production-hardened** |

---

## Deployment Safety

All four fixes follow the **fail-closed principle**:

1. **Invalid DTO** → `400 Bad Request` (request rejected)
2. **Dev secret in prod** → `FATAL error` (app crashes on boot)
3. **Swagger in prod** → Routes not registered (404 responses)
4. **No CORS in prod** → `FATAL error` (app crashes on boot)

**Result:** Configuration errors are caught **before** the system is exposed to users, not silently running with insecure defaults.

