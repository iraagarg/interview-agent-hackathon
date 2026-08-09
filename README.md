# AI Interview Agent

An AI agent that conducts a realistic, multi-turn technical interview grounded in a
candidate's actual progress through a 31-day AI Cohort curriculum.

Built for the ABTalks Vibe Code Hackathon · solo submission.

---

## Live URLs

| Surface  | URL |
|----------|-----|
| **Frontend** | https://interview-agent-hackathon.vercel.app |
| **Backend**  | https://interview-agent-api-nipj.onrender.com |
| **Endpoint** | `POST https://interview-agent-api-nipj.onrender.com/api/interview` |

> The backend runs on Render's free tier, which sleeps after 15 minutes of inactivity.
> The first request after that takes ~50 seconds. To wake it:
> `curl -s https://interview-agent-api-nipj.onrender.com/health`

---

## What it does

The agent reads a candidate's mission history and interviews them on the material they
actually struggled with. Days they skipped, failed, or needed four attempts to pass get
probed first; a day they passed first try is included as a strength anchor. Follow-up
questions are generated from what the candidate just said, and the interview closes with
structured feedback that cites specific curriculum days.

**Guarantees, enforced in code rather than left to the model:**

- Minimum 8 questions
- At least 4 distinct curriculum days, spread across modules
- Every follow-up is generated from the previous answer
- Final feedback always matches the required shape

The last point is the important one. Topic selection, question counting and termination
are plain deterministic JavaScript. The LLM writes language and grades answers; it never
decides whether the interview has met its requirements. That is what makes the guarantees
real rather than probabilistic — and it is why the interview still completes correctly
when the LLM is unavailable (see [Resilience](#resilience)).

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
| 413 | Request body over 1MB | `{ "error": "...", "code": "..." }` |

Everything else returns 200 with the contract shape above. A turn posted after
`done: true` replays the final payload idempotently rather than erroring, and re-posting
a candidate for a live session replays the opening question rather than resetting it.

Two convenience routes outside the contract: `GET /` returns a service description, and
`GET /health` returns `{ ok, sessions, uptime }`.

---

## Interview strategy

### 1 · Choosing which days to probe — deterministic, no LLM

Every mission in the candidate's record is scored, and the top five become the interview
plan.

| Signal | Score | Reasoning |
|---|---|---|
| `skipped: true` | 100 | Never attempted — the largest true blind spot |
| `passed: false` | 80 | Attempted and failed — known weakness |
| passed, `attempts >= 3` | 60 | Struggled through; shallow understanding likely |
| passed, `attempts == 2` | 40 | Mild friction |
| passed, `attempts == 1` | 15 | One confirmation question, and a genuine win to cite |

A small attempts bonus (capped at 5) orders within a tier, so a 5-attempt struggle
outranks a 3-attempt one without ever crossing a tier boundary.

Three constraints sit on top:

- **Module spread** — at most 2 topics per module, so a candidate who bombed one module
  does not get five questions about it.
- **Breadth as a tiebreak** — when scores tie, an unrepresented module wins. Signal never
  loses to cosmetics, but ties are free.
- **Strength anchor** — at least one first-try pass is included. An interview built purely
  from failures reads as an interrogation, and `strengths` needs real evidence to cite.

### 2 · Question budget

Five planned topics, one opener plus up to one follow-up each — typically 10 questions,
hard floor 8, hard cap 12.

The floor is guaranteed by a **reserve list**. If a candidate answers "I don't know" to
everything, each topic closes after a single question and five topics would only yield
five. So `buildPlan` returns the plan *plus* a reserve, and the engine draws from it while
still below eight. Worst case measured across all 20 candidates: **9 questions, 8 distinct
days**.

### 3 · Generating follow-ups

One structured LLM call per turn does two jobs at once — grade the answer just given, and
write the next message:

```jsonc
{
  "assessment": { "score": 0-3, "covered": [...], "missed": [...] },
  "action": "followup" | "next_topic",
  "reply": "..."
}
```

The server decides which actions are *legal* before calling and offers only those. That
avoids the failure mode where the model writes a follow-up and the server overrides it to
advance, leaving a reply about the wrong topic.

Each prompt is grounded in the real curriculum: the day's `objectives` and `tools` are
injected verbatim, so questions are about what the candidate was actually taught rather
than generic LLM interview trivia. Mission signals are passed as interviewer-private
context ("they skipped this day entirely") so the agent can probe accordingly without
revealing that it can see their record.

Follow-ups are required to quote something specific from the candidate's answer. On a
topic change the agent must *bridge* through something they said rather than announce the
switch — stock transitions like "Let's move on to" are explicitly banned.

### 4 · Final feedback

The per-turn assessments accumulate into a ledger, so the closing call summarises evidence
that already exists rather than re-judging ten answers at once. Recommendations cite real
curriculum days by number and title.

Feedback is requested as labelled plain-text lines (`SUMMARY:`, `STRENGTH:`, `GAP:`,
`NEXT:`) rather than JSON. JSON mode on `llama-3.3-70b` reliably drifts once values get
long and prose-heavy — it emits unquoted strings and the request fails with
`json_validate_failed` — and Groq's schema-enforcing mode does not cover Llama models.
Line-labelled output removes the failure class entirely: there is no JSON for the model to
malform, and the parse is a regex.

---

## Resilience

Every LLM call is wrapped. If Groq errors, rate-limits, or returns something unparseable:

- questions fall back to prompts built from the day's curriculum objectives
- feedback falls back to a deterministic composer built from the assessment ledger
- the interview still completes with a valid contract-shaped response

This was verified against a real outage, not a simulation. Groq's free-tier daily token
limit was exhausted several times during development, and every affected run still
returned **9 questions across 8 distinct curriculum days with valid structured feedback**,
with no crash and no error surfaced to the user.

---

## Architecture

```
POST /api/interview
      │
      ▼
  routes/interview.js     validate shape, route start vs turn
      │
      ▼
  lib/sessions.js         in-memory Map keyed by sessionId
      │                   + per-session lock, TTL sweep
      ▼
  interview/engine.js     plan → question → grade → follow-up → conclude
      │
      ├── interview/plan.js       deterministic day scoring (no LLM)
      ├── interview/prompts.js    prompt construction, curriculum grounding
      ├── interview/feedback.js   LLM synthesis + deterministic fallback
      ├── interview/mock.js       canned responses for MOCK_LLM=1
      └── lib/groq.js             Groq LLaMA — JSON mode and text mode
```

Two decisions worth calling out:

**Persistent server, not serverless.** Session state lives in memory, so a cold start
would drop live interviews. This is why the backend is on Render rather than Vercel
functions.

**Per-session request serialization.** A turn reads session state, awaits the LLM, then
writes back. Two overlapping requests for one `sessionId` both read the same cursor and
push transcript entries out of order — producing a conversation like "answer answer answer
question question question". A double-clicked send button is enough to trigger it. Requests
for the same session are chained; different sessions still run fully in parallel.

---

## Tech stack

| Layer    | Choice |
|----------|--------|
| Backend  | Node.js + Express 5 (ESM) |
| LLM      | Groq · `llama-3.3-70b-versatile` |
| Frontend | React 19 + Vite 7 + Tailwind 4 |
| Hosting  | Render (backend) · Vercel (frontend) |

---

## Local development

```bash
# Terminal 1 — backend
cd server
cp .env.example .env        # add your GROQ_API_KEY
npm install
npm run dev                 # http://localhost:8080

# Terminal 2 — frontend
cd client
npm install
npm run dev                 # http://localhost:5173
```

Then open http://localhost:5173.

`MOCK_LLM=1` runs the whole app against canned responses — no API key, no network, no
token spend. Use it for anything that is not judging output quality:

```bash
cd server && MOCK_LLM=1 npm run dev
```

> A full interview costs roughly 20k tokens, and Groq's free tier allows 100k/day —
> about five interviews. Use `MOCK_LLM=1` while developing.

### Smoke test

```bash
# from the repository root
curl -s localhost:8080/health

curl -s -X POST localhost:8080/api/interview -H 'Content-Type: application/json' \
  -d "{\"sessionId\":\"t1\",\"candidate\":$(node -p 'JSON.stringify(require("./data/candidates.json").candidates[0])')}"

curl -s -X POST localhost:8080/api/interview -H 'Content-Type: application/json' \
  -d '{"sessionId":"t1","message":"Embeddings map text into a vector space where distance approximates semantic similarity."}'
```

The third call is the meaningful one — a reply that references your answer proves
conversation state is being maintained per `sessionId` across separate requests.

---

## Testing

```bash
cd server

npm test                # 204 assertions, 14 sections — offline, free
npm run verify          # all 20 candidates, balanced behaviour
npm run verify:advance  # worst case: every topic closes after one question
npm run verify:followup # every answer invites a deeper probe

npm run demo -- CAND-010       # read a full interview, canned responses
npm run demo:live -- CAND-010  # read a full interview, real Groq (~11 calls)
```

`npm test` covers the API contract, request validation, malformed and hostile input,
routing, session lifecycle, planner guarantees against all 20 candidates plus hand-built
edge cases, mission classification, feedback parsing and normalisation, composer
coherence, concurrency, and same-session serialization.

`npm run verify` drives a complete interview for every candidate through the real HTTP
endpoint and asserts the minimums. The three behavioural modes matter: `advance` is the
path that exercises reserve-topic drawing, which is what guarantees the 8-question floor.

Mocked LLM calls deliberately await a timer rather than returning synchronously, so tests
exercise the same event-loop interleaving as a real network call. Without that,
concurrency bugs are invisible under `MOCK_LLM` and only appear in production.

---

## Environment variables

### `server/`

| Variable | Required | Notes |
|----------|----------|-------|
| `GROQ_API_KEY` | yes | From console.groq.com |
| `GROQ_MODEL` | no | Defaults to `llama-3.3-70b-versatile` |
| `PORT` | no | Injected by Render; defaults to 8080. Do not set it on Render |
| `CORS_ORIGINS` | no | Comma-separated origins, or `*`. Defaults to `http://localhost:5173` |
| `MOCK_LLM` | no | `1` runs against canned responses. Never set this in production |

### `client/`

| Variable | Required | Notes |
|----------|----------|-------|
| `VITE_API_BASE_URL` | yes | Backend base URL, no trailing slash. Baked in at build time — changing it needs a redeploy, not a restart |

---

## Deployment

### Backend — Render

1. **New +** → **Web Service** → connect this repository.
2. Configure:

   | Field | Value |
   |---|---|
   | Language | `Node` |
   | Branch | `main` |
   | **Root Directory** | **`server`** |
   | Build Command | `npm install` |
   | Start Command | `npm start` |
   | Health Check Path | `/health` |

3. Environment variables: `GROQ_API_KEY`, `GROQ_MODEL=llama-3.3-70b-versatile`,
   `CORS_ORIGINS=*`. **Do not set `PORT`** — Render injects it.
4. Deploy.

Root Directory must be `server`; there is no `package.json` at the repository root. Setting
it does not hide `data/` — Render checks out the whole repository, and the server resolves
the curriculum files by absolute path.

### Frontend — Vercel

1. **Import** this repository at vercel.com/new.
2. Configure:

   | Field | Value |
   |---|---|
   | Framework Preset | `Vite` |
   | **Root Directory** | **`client`** |
   | Build Command | `npm run build` |
   | Output Directory | `dist` |

3. Environment variable: `VITE_API_BASE_URL` = the Render URL, no trailing slash.
4. Deploy.

The client keeps its own copy of the candidate list at `client/src/data/candidates.json`,
refreshed from `/data` by `scripts/sync-data.mjs` before every `dev` and `build`. This is
deliberate: Vercel builds with a root directory of `client`, and whether files above it are
available depends on a project setting — relying on it would make a successful local build
no guarantee of a successful deploy. When `/data` is unreachable the sync script leaves the
committed copy alone instead of failing the build.

### Post-deploy checklist

Verify behaviour, not just that the build succeeded.

```bash
API=https://interview-agent-api-nipj.onrender.com

# 1 · service is up
curl -s $API/health                          # -> {"ok":true,...}

# 2 · base URL is presentable
curl -s $API/                                # -> service description, not a 404

# 3 · interview starts (run from the repository root)
curl -s -X POST $API/api/interview -H 'Content-Type: application/json' \
  -d "{\"sessionId\":\"check\",\"candidate\":$(node -p 'JSON.stringify(require("./data/candidates.json").candidates[9])')}"

# 4 · state survives across requests — the reply must reference your answer
curl -s -X POST $API/api/interview -H 'Content-Type: application/json' \
  -d '{"sessionId":"check","message":"Embeddings map text into a dense vector space."}'

# 5 · errors are shaped correctly
curl -s -X POST $API/api/interview -H 'Content-Type: application/json' \
  -d '{"sessionId":"nope","message":"hi"}'   # -> 404 UNKNOWN_SESSION
```

Then, in the browser:

- [ ] Frontend loads and lists 20 candidates
- [ ] Starting an interview produces a real question, not `[MOCK]` text
- [ ] An answer produces a follow-up that references what was said
- [ ] DevTools → Network shows requests going to the Render URL, **not** `localhost`
- [ ] The interview reaches at least 8 questions
- [ ] The feedback card renders summary, strengths, gaps and next steps
- [ ] No console errors

Step 4 is the one that matters most — it is the only check that proves per-`sessionId`
conversation state, which is a core requirement of the spec.

---

## Repository layout

```
.
├── data/                     curriculum.json, candidates.json, technical-spec.md
├── server/                   Express backend
│   ├── src/
│   │   ├── routes/           endpoint, validation
│   │   ├── interview/        planner, engine, prompts, feedback
│   │   └── lib/              sessions, groq, curriculum, errors
│   └── scripts/              test suite, verification, demo
├── client/                   React frontend
│   └── src/components/       picker, message list, composer, feedback card
├── README.md
└── PROMPTS.md                every prompt used to build this
```

`server/` and `client/` are separate npm projects with their own `package.json`. There is
no package manifest at the repository root.

---

## AI usage

Every meaningful prompt used to build this is logged in [PROMPTS.md](PROMPTS.md).
