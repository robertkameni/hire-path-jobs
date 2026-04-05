# hire-path-jobs

AI-powered job analysis backend. Paste a job posting URL and get back structured job data, quality insights, a contact strategy, and a ready-to-send outreach message — all in one API call.

Built with **NestJS**, **TypeScript**, and **Google Gemini**.

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

| Variable         | Required | Default            | Description                |
| ---------------- | -------- | ------------------ | -------------------------- |
| `GEMINI_API_KEY` | Yes      | —                  | Your Google Gemini API key |
| `GEMINI_MODEL`   | No       | `gemini-2.5-flash` | Gemini model to use        |
| `PORT`           | No       | `3000`             | Server port                |
| `CORS_ORIGIN`    | No       | `*`                | Allowed CORS origin        |

---

## License

MIT
