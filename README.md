# hire-path-jobs

AI-powered job analysis app.

Built with **Angular** (web) + **NestJS** (API) + **TypeScript** + **DeepSeek**.

---

## How it works

1. `POST /api/analysis` with a job posting URL (`jobUrl`) or pasted text (`jobText`)
2. Backend tries to fetch and extract the job description text (scrape step)
3. Text is normalized (cleanup / whitespace / dedupe)
4. The AI pipeline produces structured output:
   - **Parse job + insights** (ghost risk, competition level, salary fairness, red flags, verdict)
   - **Contact strategy**
   - **Outreach message**
5. The API returns a terminal job response (`completed`, `partial`, or `failed`) from the POST request

If a site blocks automated fetching (Indeed / LinkedIn / StepStone / Xing, etc.), you can retry the same request with `jobText` (paste the job description) and the backend will **skip scraping**.

---

## Project structure

```
apps/
├── api/                   # NestJS backend
└── web/                   # Angular frontend
libs/
└── shared-types/          # Shared DTO/types between web and api
```

---

## Deploying to Vercel

This repository is deployed as two Vercel projects:

| Project              | Root directory | Purpose          |
| -------------------- | -------------- | ---------------- |
| `hire-path-jobs-api` | `apps/api`     | NestJS backend   |
| `hire-path-jobs-web` | `apps/web`     | Angular frontend |

For the backend, Vercel treats this repo as **[NestJS on Vercel](https://vercel.com/docs/frameworks/backend/nestjs)** (“zero config”): **`src/main.ts`** must import **`NestFactory`** from **`@nestjs/core`** and call **`app.listen(process.env.PORT ?? 3000)`** (already the case).

Configure **`DEEPSEEK_API_KEY`** (and optional Upstash variables) in Vercel → Project → Environment Variables. Long AI runs may need a higher **function duration** limit in **Project Settings → Functions** (plan-dependent).

Local development uses **`npm run start:api`** (`node dist/main.js`).

The web project rewrites `/api/*` to the API project via `apps/web/vercel.json`.

---

## GitHub Actions deployment

The workflow in `.github/workflows/ci-deploy.yml` runs on pushes to `main`, pull requests to `main`, and manual dispatch.

Pipeline:

1. Checkout
2. Install dependencies with `npm ci`
3. Run Biome checks
4. Build API
5. Build web
6. Deploy API to Vercel
7. Deploy web to Vercel

Required GitHub repository secrets:

| Secret                  | Value                                      |
| ----------------------- | ------------------------------------------ |
| `VERCEL_TOKEN`          | Vercel account token                       |
| `VERCEL_ORG_ID`         | Vercel team/user ID                        |
| `VERCEL_API_PROJECT_ID` | Vercel project ID for `hire-path-jobs-api` |
| `VERCEL_WEB_PROJECT_ID` | Vercel project ID for `hire-path-jobs-web` |

Do not store `VERCEL_TOKEN` as a GitHub variable. It must be a repository secret.

---

## Prerequisites

- Node.js 20+
- A [DeepSeek API key](https://api-docs.deepseek.com/)

---

## Setup

```bash
npm install
```

Create a `.env` file in the project root:

```env
DEEPSEEK_API_KEY=your_api_key_here
DEEPSEEK_MODEL=deepseek-chat   # optional, this is the default
```

---

## Running (development)

```bash
# API (dev) from repo root
npm run start:api

# Web (dev) from repo root
npm run start:web
```

The API server is available at `http://localhost:3000` (API routes under `/api`).

---

## Swagger (OpenAPI)

Start the API, then open:

- Swagger UI: `http://localhost:3000/api/docs`
- OpenAPI JSON: `http://localhost:3000/api/docs-json`

---

## API

### `POST /api/analysis`

**Request body:**

```json
{
  "jobUrl": "https://example.com/job/some-role",
  "jobText": "optional pasted job description text (when scraping is blocked)"
}
```

`userProfile` is optional. When provided, the contact strategy and outreach message are tailored to the candidate.

**Response:**

- `POST /api/analysis` runs the scrape/AI pipeline and returns `{ jobId, status, result, ... }`
- `status` is usually `completed`, `partial`, or `failed`
- `GET /api/analysis/:id` can still be used to retrieve a stored job response

When completed/partial, `result` contains `job`, `insights`, `strategy`, and `message`.

**Error responses:**

| Status | `error` field     | Meaning                                                            |
| ------ | ----------------- | ------------------------------------------------------------------ |
| `400`  | —                 | Validation error (e.g. missing or invalid `jobUrl`)                |
| `502`  | `SCRAPE_BLOCKED`  | The site actively blocks automated access (e.g. Indeed, LinkedIn)  |
| `502`  | `SCRAPE_FAILED`   | Could not fetch the URL (network error, redirect loop, empty page) |
| `502`  | `AI_INVALID_JSON` | AI provider returned malformed JSON                                |
| `502`  | `AI_SCHEMA_ERROR` | AI provider response did not match the expected schema             |
| `502`  | `Bad Gateway`     | AI provider returned an error or timed out                         |
| `429`  | —                 | Rate limit exceeded (10 requests / 60 s per IP by default)         |

---

### `GET /api/health`

Returns `{ "status": "ok", "timestamp": "..." }`. Use this to verify the server is running.

---

## Insights explained

| Field                        | Type                                                        | Description                                                             |
| ---------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------- |
| `competitionLevel`           | `"low" \| "medium" \| "high"`                               | How many other applicants you're likely competing against               |
| `competitionReason`          | `string`                                                    | One-sentence explanation citing the decisive signals                    |
| `competitionConfidence`      | `0–100`                                                     | How confident the model is given the available evidence                 |
| `signalsLoweringCompetition` | `string[]`                                                  | Specific factors that reduce competition (niche stack, geo-lock, etc.)  |
| `signalsRaisingCompetition`  | `string[]`                                                  | Specific factors that increase competition (remote, trendy stack, etc.) |
| `ghostRisk`                  | `"low" \| "medium" \| "high"`                               | Probability the role is fake, stale, or pipeline-building               |
| `ghostRiskReason`            | `string`                                                    | One-sentence explanation citing the decisive signals                    |
| `ghostRiskConfidence`        | `0–100`                                                     | How confident the model is given the available evidence                 |
| `salaryFairness`             | `"below-market" \| "market" \| "above-market" \| "unknown"` | Salary vs. current market rate for this role and location               |
| `redFlags`                   | `string[]`                                                  | Concrete issues found in the posting                                    |
| `positives`                  | `string[]`                                                  | Genuine strengths of this specific role                                 |
| `verdict.apply`              | `boolean`                                                   | `false` only when ghost risk is high **and** there are no positives     |
| `verdict.reason`             | `string`                                                    | Decision rationale — includes caution language when ghost risk is high  |

---

## Caching

Results are cached, keyed by a SHA-256 hash of:

- `jobUrl`
- `userProfile` (or null)
- `jobText` hash (when provided) or `"scrape"` (when scraping)

Repeated requests for the same inputs are served instantly without hitting the scraper or AI.

When Upstash is configured, cache and job records are shared across serverless invocations. Without Upstash, cache and jobs are process-local and best suited for local development.

| Variable            | Default | Description                     |
| ------------------- | ------- | ------------------------------- |
| `CACHE_TTL_SECONDS` | `86400` | TTL per entry (24 h)            |
| `CACHE_MAX_ITEMS`   | `500`   | Max entries before LRU eviction |

Set `CACHE_TTL_SECONDS=0` to disable caching.

---

## Scraper compatibility

The scraper fetches server-rendered HTML and strips noise (scripts, nav, footer, forms, etc.) using a two-pass strategy: CSS selector extraction first, Mozilla Readability as fallback.

**Works with:** Lever, Ashby, Workable, Greenhouse, Ratbacher, Bundesagentur für Arbeit, and most static job boards.

**Blocked by:** Indeed, LinkedIn, Glassdoor, and other sites that use heavy bot-detection or client-side rendering. These return `SCRAPE_BLOCKED`.

In that case, retry with `jobText` (paste the job description section). The backend skips scraping and continues normally.

---

## Environment variables

When both `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are set, the API uses Upstash for shared cache and the job store unless `DISABLE_UPSTASH=true`.

| Variable                   | Required | Default         | Description                                                |
| -------------------------- | -------- | --------------- | ---------------------------------------------------------- |
| `DEEPSEEK_API_KEY`         | Yes      | —               | Your DeepSeek API key                                      |
| `DEEPSEEK_MODEL`           | No       | `deepseek-chat` | DeepSeek model to use                                      |
| `PORT`                     | No       | `3000`          | Server port                                                |
| `CORS_ORIGIN`              | No       | `*`             | Allowed CORS origin                                        |
| `CACHE_TTL_SECONDS`        | No       | `86400`         | How long to cache results (seconds). Default = 24 h        |
| `CACHE_MAX_ITEMS`          | No       | `500`           | Maximum number of results to keep in memory                |
| `THROTTLE_TTL_SECONDS`     | No       | `60`            | Rate limit window in seconds                               |
| `THROTTLE_LIMIT`           | No       | `10`            | Max requests per IP per window                             |
| `UPSTASH_REDIS_REST_URL`   | No       | —               | Upstash Redis REST URL (shared cache + optional job store) |
| `UPSTASH_REDIS_REST_TOKEN` | No       | —               | Upstash Redis REST token                                   |
| `DISABLE_UPSTASH`          | No       | `false`         | If `true`, never use Upstash (in-memory cache + job store) |

---

## Biome (formatting & linting)

Biome is installed once at the repo root (v2.4.12) and runs across both `apps/web` and `apps/api`.

```bash
npm run biome:check
npm run biome:write
npm run biome:ci
```

---

## License

MIT
