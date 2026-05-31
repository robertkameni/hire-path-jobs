# Security Hardening Test Guide

Complete test procedures for verifying all security hardening fixes.

---

## Test 1: DTO Validation Bypass Fix (F-3.2)

### Purpose
Verify that sending both `jobUrl` and `jobText` now enforces all validation constraints.

### Setup
- Start API: `npm run start:api` (dev mode)
- API listening on `http://localhost:3000`

### Test Case 1.1: Both fields provided, jobText too short
```bash
curl -X POST http://localhost:3000/api/analysis \
  -H "Content-Type: application/json" \
  -d '{
    "jobUrl": "https://example.com/job",
    "jobText": "x"
  }'
```

**Expected Response:**
```
HTTP 400 Bad Request
{
  "statusCode": 400,
  "message": [
    "jobText must be longer than or equal to 200 characters"
  ],
  "error": "Bad Request"
}
```

### Test Case 1.2: Both fields provided, jobUrl invalid
```bash
curl -X POST http://localhost:3000/api/analysis \
  -H "Content-Type: application/json" \
  -d '{
    "jobUrl": "not-a-url",
    "jobText": "This is a valid job text with at least 200 characters so it passes validation. We need to add more text to ensure we reach 200 characters. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua."
  }'
```

**Expected Response:**
```
HTTP 400 Bad Request
{
  "statusCode": 400,
  "message": [
    "jobUrl must be a URL address"
  ],
  "error": "Bad Request"
}
```

### Test Case 1.3: Both fields provided, jobText exceeds max length
```bash
curl -X POST http://localhost:3000/api/analysis \
  -H "Content-Type: application/json" \
  -d '{
    "jobUrl": "https://example.com/job",
    "jobText": "<120,000+ character string>"
  }'
```

**Expected Response:**
```
HTTP 400 Bad Request
{
  "statusCode": 400,
  "message": [
    "jobText must be shorter than or equal to 120000 characters"
  ],
  "error": "Bad Request"
}
```

### Test Case 1.4: Only jobUrl, valid
```bash
curl -X POST http://localhost:3000/api/analysis \
  -H "Content-Type: application/json" \
  -d '{
    "jobUrl": "https://example.com/job"
  }'
```

**Expected Response:**
```
HTTP 202 Accepted
(or 200 if cached)
```

---

## Test 2: Production Secret Guard (F-3.4)

### Purpose
Verify that using the development secret in production causes immediate boot failure.

### Setup
Terminal 1 (attempt bad production config):

```bash
cd apps/api
export NODE_ENV=production
export DEEPSEEK_API_KEY=sk-test-key
export JOB_ACCESS_SECRET=local-dev-job-access-secret-32chars-min
npm run dev
```

**Expected Output:**
```
[Nest] 12345  - 06/01/2026, 10:00:00 AM     LOG [NestFactory] Starting Nest application...
[Nest] 12345  - 06/01/2026, 10:00:01 AM   ERROR [InstanceLoader] 
FATAL: JOB_ACCESS_SECRET cannot be the development default in production. 
Set a unique secret with at least 32 random characters.

[Nest] 12345  - 06/01/2026, 10:00:01 AM   ERROR [Nest] Error: 
FATAL: JOB_ACCESS_SECRET cannot be the development default in production. 
Set a unique secret with at least 32 random characters.

Process exited with code 1 ✅
```

### Setup (Correct production config)

Terminal 2 (correct configuration):

```bash
cd apps/api
export NODE_ENV=production
export DEEPSEEK_API_KEY=sk-test-key
export JOB_ACCESS_SECRET=replace-with-at-least-32-random-unique-characters-abc123def456
npm run dev
```

**Expected Output:**
```
[Nest] 12345  - 06/01/2026, 10:00:00 AM     LOG [NestFactory] Starting Nest application...
[Nest] 12345  - 06/01/2026, 10:00:02 AM     LOG [InstanceLoader] ...
[Nest] 12345  - 06/01/2026, 10:00:02 AM     LOG [Bootstrap] 
Application running on http://localhost:3000/api ✅
```

---

## Test 3: Swagger Environment Guard (F-3.5)

### Purpose
Verify Swagger is accessible in development but returns 404 in production.

### Test Case 3.1: Development mode (Swagger accessible)

```bash
# Start API in development
cd apps/api
npm run dev

# Test Swagger endpoint
curl http://localhost:3000/api/docs
```

**Expected Response:**
```
HTTP 200 OK
Content-Type: text/html
<html>
  <head>
    <title>Swagger UI</title>
    ...
  </head>
  <body>...</body>
</html> ✅
```

### Test Case 3.2: Production mode (Swagger returns 404)

```bash
# Start API in production mode
cd apps/api
export NODE_ENV=production
export DEEPSEEK_API_KEY=sk-...
export JOB_ACCESS_SECRET=...
npm run dev

# Wait for server to start, then:
curl http://localhost:3000/api/docs
```

**Expected Response:**
```
HTTP 404 Not Found
{
  "statusCode": 404,
  "message": "Cannot GET /api/docs",
  "error": "Not Found"
} ✅
```

### Test Case 3.3: OpenAPI JSON endpoint (production)

```bash
curl http://localhost:3000/api/docs-json
```

**Expected Response:**
```
HTTP 404 Not Found ✅
```

---

## Test 4: CORS Production Guard (F-3.6)

### Purpose
Verify CORS is unrestricted in development but restricted to configured origins in production.

### Test Case 4.1: Production startup without CORS_ORIGIN

```bash
cd apps/api
export NODE_ENV=production
export DEEPSEEK_API_KEY=sk-...
export JOB_ACCESS_SECRET=...
# Note: NOT setting CORS_ORIGIN
npm run dev
```

**Expected Output:**
```
[Nest] 12345  - 06/01/2026, 10:00:00 AM     LOG [NestFactory] Starting Nest application...
[Nest] 12345  - 06/01/2026, 10:00:01 AM   ERROR [InstanceLoader] 
FATAL: CORS_ORIGIN must be explicitly configured in production. 
Provide a comma-separated list of allowed origins.

Process exited with code 1 ✅
```

### Test Case 4.2: Production startup with valid CORS_ORIGIN

```bash
cd apps/api
export NODE_ENV=production
export DEEPSEEK_API_KEY=sk-...
export JOB_ACCESS_SECRET=...
export CORS_ORIGIN=http://localhost:4200
npm run dev
```

**Expected Output:**
```
[Nest] 12345  - 06/01/2026, 10:00:00 AM     LOG [NestFactory] Starting Nest application...
[Nest] 12345  - 06/01/2026, 10:00:02 AM     LOG [Bootstrap] 
Application running on http://localhost:3000/api ✅
```

### Test Case 4.3: Verify CORS response with allowed origin

```bash
curl -i -X OPTIONS http://localhost:3000/api/health \
  -H "Origin: http://localhost:4200" \
  -H "Access-Control-Request-Method: GET"
```

**Expected Response Headers:**
```
HTTP/1.1 200 OK
Access-Control-Allow-Origin: http://localhost:4200 ✅
Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization, Accept, X-Correlation-Id
```

### Test Case 4.4: Verify CORS blocks disallowed origin

```bash
curl -i -X OPTIONS http://localhost:3000/api/health \
  -H "Origin: https://attacker.example.com" \
  -H "Access-Control-Request-Method: GET"
```

**Expected Response:**
```
HTTP/1.1 200 OK
(No Access-Control-Allow-Origin header) ✅
```

### Test Case 4.5: Multiple allowed origins

```bash
cd apps/api
export NODE_ENV=production
export DEEPSEEK_API_KEY=sk-...
export JOB_ACCESS_SECRET=...
export CORS_ORIGIN=http://localhost:4200,https://example.com
npm run dev

# Test first origin
curl -i -X OPTIONS http://localhost:3000/api/health \
  -H "Origin: http://localhost:4200"

# Result: Access-Control-Allow-Origin: http://localhost:4200 ✅

# Test second origin
curl -i -X OPTIONS http://localhost:3000/api/health \
  -H "Origin: https://example.com"

# Result: Access-Control-Allow-Origin: https://example.com ✅
```

---

## Integration Test: Full Production Simulation

### Objective
Verify all guards work together in a production-like environment.

### Steps

1. **Start API with full production config:**
```bash
cd apps/api
export NODE_ENV=production
export DEEPSEEK_API_KEY=sk-your-real-key
export JOB_ACCESS_SECRET=your-unique-32-char-secret
export CORS_ORIGIN=http://localhost:4200
npm run dev
```

2. **Verify startup success:**
   - No errors in console ✅
   - Application running message appears ✅

3. **Test each endpoint:**

   a) Health check (should work):
   ```bash
   curl http://localhost:3000/api/health
   # Expected: 200 OK ✅
   ```

   b) Swagger (should fail):
   ```bash
   curl http://localhost:3000/api/docs
   # Expected: 404 Not Found ✅
   ```

   c) OpenAPI JSON (should fail):
   ```bash
   curl http://localhost:3000/api/docs-json
   # Expected: 404 Not Found ✅
   ```

   d) Analysis with both fields (should validate):
   ```bash
   curl -X POST http://localhost:3000/api/analysis \
     -H "Content-Type: application/json" \
     -d '{
       "jobUrl": "x",
       "jobText": "x"
     }'
   # Expected: 400 Bad Request ✅
   ```

   e) CORS preflight:
   ```bash
   curl -i -X OPTIONS http://localhost:3000/api/health \
     -H "Origin: http://localhost:4200"
   # Expected: 200 OK with Access-Control-Allow-Origin header ✅
   ```

---

## Cleanup

After testing, stop the API server:
```bash
# Press Ctrl+C in the terminal where API is running
```

---

## Summary Checklist

Mark these off as you complete each test:

- [ ] DTO validation blocks short jobText when both fields present
- [ ] DTO validation blocks invalid jobUrl when both fields present
- [ ] DTO validation blocks oversized jobText when both fields present
- [ ] Production startup fails with dev secret
- [ ] Production startup succeeds with unique secret
- [ ] Swagger returns 200 in development
- [ ] Swagger returns 404 in production
- [ ] OpenAPI JSON returns 404 in production
- [ ] Production startup fails without CORS_ORIGIN
- [ ] Production startup succeeds with valid CORS_ORIGIN
- [ ] CORS allows configured origin
- [ ] CORS blocks other origins
- [ ] Multiple origins can be configured
- [ ] Full integration test passes

**All tests passing = Security hardening verified ✅**
