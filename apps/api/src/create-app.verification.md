/**
 * VERIFICATION GUIDE: Environment Guard for Swagger/OpenAPI Documentation (F-3.5)
 *
 * This file documents how to verify the F-3.5 security feature:
 * The /api/docs and /api/docs-json routes are completely unmounted in production.
 *
 * Test Steps:
 *
 * 1. Development Mode - Swagger should be accessible:
 *    ```bash
 *    NODE_ENV=development npm run start
 *    curl http://localhost:3000/api/docs
 *    ```
 *    Expected: HTTP 200 with Swagger UI HTML
 *    Expected: /api/docs-json also returns 200 with OpenAPI spec
 *
 * 2. Production Mode - Swagger should NOT be accessible:
 *    ```bash
 *    NODE_ENV=production JOB_ACCESS_SECRET="local-dev-job-access-secret-32chars-min" npm run start
 *    curl http://localhost:3000/api/docs
 *    ```
 *    Expected: HTTP 404 Not Found
 *    Expected: /api/docs-json also returns 404
 *
 * 3. Verify through Node logs:
 *    ```bash
 *    NODE_ENV=development npm run start 2>&1 | grep -i swagger
 *    ```
 *    Expected: SwaggerModule logs indicate routes are being mounted
 *
 * Technical Implementation:
 *
 * - Located in: apps/api/src/create-app.ts (configureHttpServer function)
 * - Condition: if (nodeEnv !== 'production')
 * - Routes mounted: /api/docs (UI), /api/docs-json (schema)
 * - In production: SwaggerModule.setup() is completely skipped
 * - Routes are unmounted at NestJS bootstrap time, not middleware level
 *
 * Security Benefit:
 * - Blocks automated API reconnaissance (Shodan, censys scans)
 * - Prevents exposure of API schema in production
 * - Reduces attack surface by removing development debugging tools
 * - API contract remains hidden from external attackers
 */

export const SWAGGER_PRODUCTION_CHECK_TESTS = {};
