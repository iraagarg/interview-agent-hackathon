# AI Interview Agent

An AI agent that conducts a realistic, multi-turn technical interview grounded in a
candidate's actual progress through a 31-day AI Cohort curriculum.

Built for the ABTalks Vibe Code Hackathon · solo submission.

---

## Live URLs

| Surface  | URL |
|----------|-----|
| Frontend | _TBD — Vercel_ |
| Backend  | _TBD — Render_ |
| Endpoint | `POST {backend}/api/interview` |

---

## What it does

The agent reads a candidate's mission history and interviews them on the material
they actually struggled with. Days they skipped, failed, or needed four attempts to
pass get probed first; a day they passed first try is included as a strength anchor.
Follow-up questions are generated from what the candidate just said, and the
interview closes with structured feedback that cites specific curriculum days.

**Guarantees, enforced in code rather than left to the model:**

- Minimum 8 questions
- At least 4 distinct curriculum days, spread across different modules
- Every follow-up is generated from the previous answer
- Final feedback always matches the required shape

---

## API contract

Single endpoint, no authentication.

### Start an interview

```http
POST /api/interview
Content-Type: application/json

{ "sessionId": "abc-123", "candidate": { ...candidate object } }
```

```json
{ "reply": "...", "done": false }
```

### Conversation turn

```http
POST /api/interview

{ "sessionId": "abc-123", "message": "..." }
```

```json
{ "reply": "...", "done": false }
```

### Final turn

```json
{
  "reply": "...",
  "done": true,
  "feedback": {
    "summary": "string",
    "strengths": ["..."],
    "gaps": ["..."],
    "next": ["..."]
  }
}
```

### Errors

| Status | Case | Body |
|--------|------|------|
| 400 | Malformed body, missing/blank `sessionId`, missing `message` on a turn, invalid `candidate` | `{ "error": "...", "code": "..." }` |
| 404 | Turn posted for an unknown `sessionId` | `{ "error": "...", "code": "..." }` |

Everything else returns 200 with the contract shape above. A turn posted after
`done: true` replays the final payload idempotently rather than erroring.

---

## Architecture

```
POST /api/interview
      │
      ▼
  routes/interview.js     validate shape, route start vs turn
      │
      ▼
  lib/sessions.js         in-memory Map keyed by sessionId, TTL-swept
      │
      ▼
  interview/engine.js     plan → question → grade → follow-up → feedback
      │
      ├── interview/plan.js       deterministic day scoring (no LLM)
      ├── interview/prompts.js    prompt construction
      └── lib/groq.js             Groq LLaMA, JSON-mode
```

**Design principle:** the LLM writes language and grades answers; it never decides
whether the interview has met its requirements. Topic selection and question
counting are plain deterministic JavaScript, which is what makes the "8 questions
across 4+ days" guarantee real rather than probabilistic.

> The backend must run as a **persistent process**, not serverless — session state
> lives in memory and a cold start would drop live interviews.

---

## Tech stack

| Layer    | Choice |
|----------|--------|
| Backend  | Node.js + Express 5 (ESM) |
| LLM      | Groq · LLaMA 3.3 70B, JSON mode |
| Frontend | React 19 + Vite 7 + Tailwind 4 |
| Hosting  | Render (backend) · Vercel (frontend) |

---

## Local development

```bash
# Backend
cd server
cp .env.example .env        # add your GROQ_API_KEY
npm install
npm run dev                 # http://localhost:8080

# Frontend, in a second terminal
cd client
cp .env.example .env.local
npm install
npm run dev                 # http://localhost:5173
```

### Smoke test

```bash
curl -s localhost:8080/health

curl -s localhost:8080/api/interview \
  -H 'Content-Type: application/json' \
  -d '{"sessionId":"t1","candidate":'"$(node -p 'JSON.stringify(require("./data/candidates.json").candidates[0])')"'}'

curl -s localhost:8080/api/interview \
  -H 'Content-Type: application/json' \
  -d '{"sessionId":"t1","message":"Embeddings map text into a vector space where distance approximates semantic similarity."}'
```

---

## Environment variables

### `server/`

| Variable | Required | Notes |
|----------|----------|-------|
| `GROQ_API_KEY` | yes | From console.groq.com |
| `GROQ_MODEL` | no | Defaults to `llama-3.3-70b-versatile` |
| `PORT` | no | Injected by Render/Railway; defaults to 8080 |
| `CORS_ORIGINS` | no | Comma-separated origins; add the Vercel URL after deploy |

### `client/`

| Variable | Required | Notes |
|----------|----------|-------|
| `VITE_API_BASE_URL` | yes | Backend base URL, no trailing slash. Baked in at build time — changing it needs a redeploy |

---

## Deployment

_Filled in at step 8._

---

## Interview strategy

_Filled in alongside the engine implementation — topic scoring table, question
budget, prompting approach._

---

## AI usage

Every meaningful prompt used to build this is logged in [PROMPTS.md](PROMPTS.md).
