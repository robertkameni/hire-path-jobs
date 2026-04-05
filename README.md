# hire-path-jobs

AI-powered job analysis backend. Send a job posting URL and get back structured job data, quality insights, a contact strategy, and a ready-to-send outreach message — all in one API call.

Built with **NestJS**, **TypeScript**, and **Google Gemini**.

---

## How it works

1. `POST /api/analysis` with a job posting URL
2. The server scrapes the page and extracts the job description text
3. Three sequential Gemini calls run through the pipeline:
   - **Step 1** — Parse structured job data + analyze quality (ghost risk, competition level, salary fairness, red flags, verdict)
   - **Step 2** — Generate a contact strategy (who to reach, which channels, talking points, timing)
   - **Step 3** — Write a personalized outreach message
4. The full result is returned as a single JSON response

---

## Project structure

```
src/
├── analysis/
│   ├── controllers/       # HTTP layer
│   ├── dto/               # Request validation (class-validator)
│   ├── interfaces/        # Shared TypeScript types
│   ├── prompts/           # One file per LLM prompt
│   │   ├── job-parse-and-truth.prompt.ts
│   │   ├── contact-strategy.prompt.ts
│   │   └── message.prompt.ts
│   ├── schemas/           # Zod schemas for AI response validation
│   ├── analysis.module.ts
│   └── analysis.service.ts
├── ai/
│   └── ai.service.ts      # Gemini client (retry, timeout, concurrency)
├── scraper/
│   └── scraper.service.ts # URL fetcher + HTML → plain text
├── common/
│   ├── filters/           # Global exception filter
│   └── middleware/        # Correlation ID middleware
└── main.ts
```

---

## Prerequisites

- Node.js 20+
- A [Google Gemini API key](https://aistudio.google.com/app/apikey)

---

## Setup

```bash
npm install
```

Create a `.env` file in the project root:

```env
GEMINI_API_KEY=your_api_key_here
GEMINI_MODEL=gemini-2.5-flash   # optional, this is the default
```

---

## Running the server

```bash
# development (watch mode)
npm run start:dev

# production
npm run build
npm run start:prod
```

The server starts at `http://localhost:3000`.

---

## API

### `POST /api/analysis`

**Request body:**

```json
{
  "jobUrl": "https://example.com/job/some-role",
}
```

`userProfile` is optional. When provided, the contact strategy and outreach message are tailored to the candidate.

**Response:**

```json
{
  "job": {
    "title": "string",
    "company": "string",
    "location": "string",
    "salary": "string | null",
    "skills": ["string"],
    "requirements": ["string"],
    "responsibilities": ["string"],
    "remote": true
  },
  "insights": {
    "competitionLevel": "low | medium | high",
    "competitionReason": "string",
    "competitionConfidence": 0,
    "signalsLoweringCompetition": ["string"],
    "signalsRaisingCompetition": ["string"],
    "ghostRisk": "low | medium | high",
    "ghostRiskReason": "string",
    "ghostRiskConfidence": 0,
    "salaryFairness": "below-market | market | above-market | unknown",
    "redFlags": ["string"],
    "positives": ["string"],
    "verdict": {
      "apply": true,
      "reason": "string"
    }
  },
  "strategy": {
    "targetRole": "string",
    "contactChannels": ["string"],
    "talkingPoints": ["string"],
    "timing": "string"
  },
  "message": {
    "subject": "string",
    "body": "string",
    "tone": "formal | friendly | direct"
  }
}
```

**Error responses:**

| Status | `error` field     | Meaning                                                            |
| ------ | ----------------- | ------------------------------------------------------------------ |
| `400`  | —                 | Validation error (e.g. missing or invalid `jobUrl`)                |
| `502`  | `SCRAPE_BLOCKED`  | The site actively blocks automated access (e.g. Indeed, LinkedIn)  |
| `502`  | `SCRAPE_FAILED`   | Could not fetch the URL (network error, redirect loop, empty page) |
| `502`  | `AI_INVALID_JSON` | Gemini returned malformed JSON                                     |
| `502`  | `AI_SCHEMA_ERROR` | Gemini response did not match the expected schema                  |
| `502`  | `Bad Gateway`     | Gemini API returned an error or timed out                          |
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

Results are cached in-memory, keyed by a SHA-256 hash of `jobUrl + userProfile`. Repeated requests for the same URL (and same profile) are served instantly without hitting the scraper or Gemini.

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

---

## Tests

```bash
# unit tests (mocked AI + scraper)
npm test

# integration tests (real Gemini API calls — requires GEMINI_API_KEY)
npm run test:integration

# watch mode
npm run test:watch

# coverage report
npm run test:cov
```

Unit tests cover: `AiService` (retry, timeout, fences), `AnalysisService` (pipeline, Zod validation), `AnalysisController` (cache, stampede protection), `ScraperService` (SSRF guards, extraction).

---

## Environment variables

| Variable               | Required | Default            | Description                                         |
| ---------------------- | -------- | ------------------ | --------------------------------------------------- |
| `GEMINI_API_KEY`       | Yes      | —                  | Your Google Gemini API key                          |
| `GEMINI_MODEL`         | No       | `gemini-2.5-flash` | Gemini model to use                                 |
| `PORT`                 | No       | `3000`             | Server port                                         |
| `CORS_ORIGIN`          | No       | `*`                | Allowed CORS origin                                 |
| `CACHE_TTL_SECONDS`    | No       | `86400`            | How long to cache results (seconds). Default = 24 h |
| `CACHE_MAX_ITEMS`      | No       | `500`              | Maximum number of results to keep in memory         |
| `THROTTLE_TTL_SECONDS` | No       | `60`               | Rate limit window in seconds                        |
| `THROTTLE_LIMIT`       | No       | `10`               | Max requests per IP per window                      |

---

## License

MIT

---

## How it works

1. You `POST` a job URL to `/api/analysis`
2. The server scrapes the page and extracts the job text
3. Three sequential Gemini calls run through the pipeline:
   - **Step 1** — Parse structured job data + analyze quality (ghost risk, competition, red flags)
   - **Step 2** — Generate a contact strategy (who to reach, talking points, timing)
   - **Step 3** — Write a personalized outreach message
4. The full result is returned as JSON

---

## Project structure

```
src/
├── analysis/
│   ├── controllers/       # HTTP layer
│   ├── dto/               # Request validation (class-validator)
│   ├── interfaces/        # Shared TypeScript types
│   ├── prompts/           # One file per LLM prompt
│   │   ├── job-parse-and-truth.prompt.ts
│   │   ├── contact-strategy.prompt.ts
│   │   └── message.prompt.ts
│   ├── analysis.module.ts
│   └── analysis.service.ts
├── ai/
│   └── ai.service.ts      # Gemini client wrapper
├── scraper/
│   └── scraper.service.ts # URL fetcher + HTML → plain text
├── common/
│   ├── filters/           # Global exception filter
│   └── middleware/        # Correlation ID middleware
└── main.ts
```

---

## Prerequisites

- Node.js 20+
- A [Google Gemini API key](https://aistudio.google.com/app/apikey)

---

## Setup

```bash
npm install
```

Create a `.env` file in the project root:

```env
GEMINI_API_KEY=your_api_key_here
GEMINI_MODEL=gemini-2.5-flash   # optional, this is the default
```

---

## Running the server

```bash
# development (watch mode)
npm run start:dev

# production
npm run build
npm run start:prod
```

The server starts at `http://localhost:3000`.

---

## API

### `POST /api/analysis`

**Request body:**

```json
{
  "jobUrl": "https://example.com/job/some-role",
  "userProfile": {
    "role": "Frontend Developer",
    "skills": ["React", "TypeScript"]
  }
}
```

`userProfile` is optional. When provided, the contact strategy and outreach message are tailored to the candidate.

**Response:**

```json
{
  "job": {
    "title": "string",
    "company": "string",
    "location": "string",
    "salary": "string | null",
    "skills": ["string"],
    "requirements": ["string"],
    "responsibilities": ["string"],
    "remote": true
  },
  "insights": {
    "competitionLevel": "low | medium | high",
    "ghostRisk": "low | medium | high",
    "salaryFairness": "below-market | market | above-market | unknown",
    "redFlags": ["string"],
    "positives": ["string"]
  },
  "strategy": {
    "targetRole": "string",
    "contactChannels": ["string"],
    "talkingPoints": ["string"],
    "timing": "string"
  },
  "message": {
    "subject": "string",
    "body": "string",
    "tone": "formal | friendly | direct"
  }
}
```

### `GET /api/health`

Returns `{ "status": "ok", "timestamp": "..." }`. Use this to check the server is running.

---

## Caching

Results are cached in-memory keyed by a SHA-256 hash of `jobUrl + userProfile`. Repeated requests for the same URL (and same profile) are served instantly without hitting the scraper or Gemini.

| Setting             | Default | Description                     |
| ------------------- | ------- | ------------------------------- |
| `CACHE_TTL_SECONDS` | `86400` | TTL per entry (24 h)            |
| `CACHE_MAX_ITEMS`   | `500`   | Max entries before LRU eviction |

Set `CACHE_TTL_SECONDS=0` to disable caching entirely.

---

## Scraper compatibility

The scraper fetches plain HTML and strips noise (scripts, nav, footer, etc.). It works on server-rendered job boards. Client-side rendered boards (e.g. LinkedIn) will return an error asking you to use a different URL.

Compatible examples: Ratbacher, Lever, Ashby, Workable, Greenhouse, Bundesagentur für Arbeit.

---

## Tests

```bash
# unit tests
npm test

# watch mode
npm run test:watch

# coverage
npm run test:cov
```

---

## Environment variables

| Variable               | Required | Default            | Description                                         |
| ---------------------- | -------- | ------------------ | --------------------------------------------------- |
| `GEMINI_API_KEY`       | Yes      | —                  | Your Google Gemini API key                          |
| `GEMINI_MODEL`         | No       | `gemini-2.5-flash` | Gemini model to use                                 |
| `PORT`                 | No       | `3000`             | Server port                                         |
| `CORS_ORIGIN`          | No       | `*`                | Allowed CORS origin                                 |
| `CACHE_TTL_SECONDS`    | No       | `86400`            | How long to cache results (seconds). Default = 24 h |
| `CACHE_MAX_ITEMS`      | No       | `500`              | Maximum number of results to keep in memory         |
| `THROTTLE_TTL_SECONDS` | No       | `60`               | Rate limit window in seconds                        |
| `THROTTLE_LIMIT`       | No       | `10`               | Max requests per IP per window                      |

---

## License

MIT
