# Security Hardening Implementation Summary

## Overview
This document summarizes the three critical security hardening fixes implemented to address vulnerabilities identified in the application security audit.

---

## Changes Made

### 1. DTO Validation Bypass Fix (F-3.2)
**File:** `apps/api/src/analysis/dto/analyze-job.dto.ts`

**Change:** Fixed `@ValidateIf` logic to always validate provided fields

**Before (vulnerable):**
```typescript
@ValidateIf((o: AnalyzeJobDto) => !o.jobText?.trim())  // Only validate if jobText is empty
@IsUrl(...)
jobUrl?: string;

@ValidateIf((o: AnalyzeJobDto) => !o.jobUrl?.trim())   // Only validate if jobUrl is empty
@MinLength(200)
@MaxLength(120000)
jobText?: string;
```

**After (secure):**
```typescript
@ValidateIf((o: AnalyzeJobDto) => !!o.jobUrl?.trim())  // Validate when jobUrl is provided
@IsUrl(...)
jobUrl?: string;

@ValidateIf((o: AnalyzeJobDto) => !!o.jobText?.trim()) // Validate when jobText is provided
@MinLength(200)
@MaxLength(120000)
jobText?: string;
```

**Impact:** Prevents attackers from sending both fields and bypassing validation constraints.

---

### 2. Production Secret Guard (F-3.4)
**File:** `apps/api/src/config/env.validation.ts`

**Change:** Added custom Joi validator to reject development secret in production

```typescript
export function jobAccessSecretSchema(): Joi.StringSchema {
  return Joi.string()
    .min(32)
    .when('NODE_ENV', {
      is: 'production',
      then: Joi.required().custom((value: string) => {
        if (value === DEV_JOB_ACCESS_SECRET) {
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
```

**Impact:** Application crashes immediately if misconfigured with dev secret in production, preventing token forgery attacks.

---

### 3. Swagger Environment Guard (F-3.5)
**File:** `apps/api/src/create-app.ts` (lines 76–91)

**Change:** Wrapped Swagger setup in production environment check (pre-existing)

```typescript
// F-3.5: Environment Guard for Swagger/OpenAPI Documentation
if (nodeEnv !== 'production') {
  const spec = new DocumentBuilder()
    .setTitle('hire-path-jobs')
    .setDescription(...)
    .setVersion('1.0')
    .build();

  const document = SwaggerModule.createDocument(app, spec);
  SwaggerModule.setup('api/docs', app, document, {
    jsonDocumentUrl: 'api/docs-json',
  });
}
```

**Impact:** Swagger documentation is not accessible in production, preventing API reconnaissance.

---

### 4. CORS Production Guard (F-3.6)
**File:** `apps/api/src/create-app.ts` (lines 18–51)

**Change:** Added explicit production origin requirement with validation (pre-existing)

```typescript
let origin: boolean | string[];
if (nodeEnv === 'production') {
  const corsRaw = config.get<string>('CORS_ORIGIN', '').trim();
  if (!corsRaw) {
    throw new Error(
      'FATAL: CORS_ORIGIN must be explicitly configured in production. ' +
        'Provide a comma-separated list of allowed origins.',
    );
  }
  // ... parse and validate origins
}
```

**Impact:** Production deployment requires explicit CORS configuration, preventing misconfiguration with overly permissive defaults.

---

### 5. Frontend Helmet/CSP Boundary
**File:** `apps/web/src/server.ts`

**Change:** Added Helmet as the first Express middleware in the Angular SSR server. CSP now locks core directives to local assets and disables framing:

```typescript
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        'default-src': ["'self'"],
        'script-src': ["'self'", ...angularFrameworkScriptHashes],
        'style-src': ["'self'", ...angularFrameworkStyleHashes],
        'frame-ancestors': ["'none'"],
      },
    },
    xContentTypeOptions: true,
  }),
);
```

**Impact:** Security headers are applied before static asset routing or SSR handling, including `X-Content-Type-Options: nosniff`.

---

### 6. Angular Result Text Sanitization
**File:** `apps/web/src/app/components/results/results.ts`

**Change:** Dynamic AI-returned text in the results template is rendered through `[textContent]` and sanitized with `DomSanitizer.sanitize(SecurityContext.HTML, ...)`.

**Impact:** AI output remains text-only in the UI and cannot break out into executable markup.

---

### 7. BullMQ Queue Saturation Buffer
**File:** `apps/api/src/analysis/services/analysis-pipeline.service.ts`

**Change:** Added `MAX_BULLMQ_QUEUE_DEPTH = 100` and checks `waiting + active + delayed` via `analysisQueue.getJobCounts()` before creating and enqueueing a new queued job.

**Impact:** Saturated BullMQ queues reject new submissions with HTTP 429 without affecting the existing in-process background execution fallback.

---

### 8. Independent Polling Throttle
**File:** `apps/api/src/analysis/controllers/analysis.controller.ts`

**Change:** Added `@Throttle({ default: { limit: 120, ttl: 60_000 } })` to `GET /analysis/:id`.

**Impact:** Polling is isolated at 120 requests per minute without loosening submit-route queue protections.

---

## Verification Results

### Build Status
✅ **Latest targeted verification successful**
- TypeScript compilation: PASS
- Angular build: PASS
- Biome linting: PASS

### Test Coverage

#### DTO Validation
```bash
# Test: Send both jobUrl and short jobText
POST /api/analysis
{
  "jobUrl": "https://example.com/job",
  "jobText": "x"
}

# Result: 400 Bad Request (both fields validated) ✅
```

#### Production Secret Guard
```bash
# Test: Start with NODE_ENV=production and dev secret
NODE_ENV=production
JOB_ACCESS_SECRET=local-dev-job-access-secret-32chars-min

# Result: Application crashes with FATAL error ✅
```

#### Swagger Production Check
```bash
# Test: Access Swagger in production
GET /api/docs (with NODE_ENV=production)

# Result: 404 Not Found ✅
```

#### CORS Production Check
```bash
# Test: Start without CORS_ORIGIN in production
NODE_ENV=production
DEEPSEEK_API_KEY=sk-...
JOB_ACCESS_SECRET=valid-secret-...

# Result: Application crashes with FATAL error ✅
```

---

## Deployment Checklist

Before deploying to production, ensure:

- [ ] Set `NODE_ENV=production` in Vercel environment
- [ ] Set unique `DEEPSEEK_API_KEY` (from DeepSeek API dashboard)
- [ ] Set unique `JOB_ACCESS_SECRET` (≥32 random characters, NOT the dev default)
- [ ] Set `CORS_ORIGIN` to your web app origin(s), e.g., `https://hire-path-jobs-web.vercel.app`
- [ ] Run `npm run build` locally and verify success
- [ ] Verify Swagger returns 404: `curl https://your-api.vercel.app/api/docs`
- [ ] Test CORS: Verify preflight requests respect configured origins

---

## Files Modified

| File | Lines | Change |
|------|-------|--------|
| `apps/api/src/analysis/dto/analyze-job.dto.ts` | 60, 68 | DTO validation logic |
| `apps/api/src/config/env.validation.ts` | 11–16 | Production secret validation |
| `apps/api/src/create-app.ts` | 18–51, 76–91 | CORS & Swagger guards (pre-existing) |
| `apps/api/src/analysis/services/analysis-pipeline.service.ts` | Queue insertion path | BullMQ saturation buffer |
| `apps/api/src/analysis/controllers/analysis.controller.ts` | GET `/analysis/:id` | Polling throttle |
| `apps/web/src/server.ts` | SSR Express boundary | Helmet/CSP headers |
| `apps/web/src/app/components/results/results.ts` | Results component | Sanitized text helper |
| `apps/web/src/app/components/results/results.html` | Results template | `[textContent]` bindings |
| `SECURITY_HARDENING_VERIFICATION.md` | New | Full verification documentation |

---

## Security Impact Summary

| Risk | Severity (Before) | Status | Mitigation |
|------|------------------|--------|-----------|
| DTO bypass on dual input | Medium | ✅ Fixed | Always validate provided fields |
| Dev secret in production | Critical | ✅ Fixed | Crash on misconfiguration |
| Swagger reconnaissance | Medium | ✅ Fixed | 404 in production |
| CORS misconfiguration | Medium | ✅ Fixed | Required & validated |
| Missing frontend security headers | Medium | ✅ Fixed | Helmet with strict CSP directives |
| AI output DOM injection | High | ✅ Fixed | Sanitized `[textContent]` bindings |
| BullMQ saturation | Medium | ✅ Fixed | Queue-depth 429 buffer |
| Polling rate pressure | Medium | ✅ Fixed | Dedicated 120/min route throttle |

---

## Next Steps

1. **Deploy to staging:** Test with production environment variables
2. **Run integration tests:** Verify API behaves correctly with new guards
3. **Deploy to production:** Follow deployment checklist
4. **Monitor logs:** Watch for any configuration errors during rollout

---

## Notes

- All changes follow "fail-closed" principle: invalid configuration causes immediate boot failure
- Development experience is unchanged: sensible defaults allow local work without config
- No breaking changes to API contracts or response schemas
- All fixes are backward compatible for existing valid requests
