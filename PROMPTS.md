# AI Usage Log — ABTalks Vibe Code Hackathon

Every meaningful prompt given to Claude Code during this build, in chronological order.

---

## [Aug 8, 6:30 PM IST] Initial scaffold prompt
I'm building a solo submission for "The Interview Agent" — a 48-hour hackathon problem statement. Full spec:

TASK: Build an AI Interview Agent that conducts a realistic, multi-turn technical interview based on a candidate's progress through a 31-day AI Cohort curriculum.

REQUIRED API CONTRACT (exact — do not deviate):
- Single endpoint: POST /api/interview
- No authentication.
- Start interview request: { "sessionId": "abc-123", "candidate": {...candidate object} }
  -> Response: { "reply": "...", "done": false }
- Subsequent turns: { "sessionId": "abc-123", "message": "..." }
  -> Response: { "reply": "...", "done": false }
- Final turn response when interview ends:
  { "reply": "...", "done": true, "feedback": { "summary": "string", "strengths": ["..."], "gaps": ["..."], "next": ["..."] } }

MINIMUM REQUIREMENTS:
- Minimum 8 questions, spanning at least 4 different curriculum days.
- Follow-up questions must be generated based on the candidate's previous answer (not scripted/static).
- Maintain full conversation context per sessionId across requests.
- Produce structured feedback in the exact shape above at the end.

DATA PROVIDED (already in repo at /data/curriculum.json and /data/candidates.json):
- curriculum.json: 31 days across 8 modules (env setup, data foundations, embeddings/vector search, LLM core/prompting/fine-tuning, chatbot build, agentic AI/MCP, eval/security/deployment, production/capstone). Each day has title, type, tools, objectives.
- candidates.json: array of candidates, each with member info (name, jobRole, yearsExperience, education), a missions array (day, title, passed, attempts, sometimes skipped: true), and signals (commitDays, missionsCompleted, missionsFirstTry).

MY STACK PREFERENCE (I have shipped this exact combination before on a similar project — an AI mock-interview platform using Groq/LLaMA):
- Backend: Node.js + Express, deployed as a PERSISTENT server (Render or Railway) — NOT Vercel serverless, because serverless cold-starts will lose my in-memory sessionId state.
- LLM: Groq AI (LLaMA) via their API for question generation and follow-ups — I have an existing GROQ_API_KEY workflow.
- Frontend: React (Vite) + Tailwind, a simple chat interface calling the deployed backend URL.
- Optional: use Breeth (MCP memory layer, docs at docs.thebreeth.com) to persist per-sessionId conversation state instead of/alongside an in-memory map, since I have Breeth Pro access from the hackathon sponsor.

WHAT I NEED YOU TO DO, IN ORDER:
1. Propose the interview-generation strategy first, before writing code: how will you select which curriculum days to probe based on a given candidate's missions/signals (e.g., prioritize days they skipped or took many attempts on), and how will follow-ups be generated from their answers (describe the prompting approach). Confirm this with me before implementing.
2. Scaffold the repo: /server (Express) and /client (Vite React), .env.example for GROQ_API_KEY (and BREETH_API_KEY if used), README.md skeleton.
3. Implement POST /api/interview exactly matching the contract above — validate request shape, handle both "start" and "turn" request forms, return correct response shape every time.
4. Implement the interview logic: build an interview plan from the candidate's data (pick ≥4 days, weighted toward skipped/high-attempt topics), generate the first question, then on each turn generate a context-aware follow-up or move to the next planned topic, tracking question count until minimum 8 is reached, then produce the final feedback object.
5. Add basic input validation and error handling (missing sessionId, unknown sessionId on a turn request, malformed body) — return clean error responses, don't crash the server.
6. Build the React chat UI: text input, message history, calls the backend, shows the final feedback nicely when done: true.
7. After each major piece (API scaffold, interview logic, feedback generation, frontend), stop and tell me exactly what you built and why, so I can log it in PROMPTS.md and commit it as a separate commit — do not bundle everything into one final commit.
8. Give me the exact deploy steps for backend (Render/Railway) and frontend (Vercel), including required environment variables, and a post-deploy checklist to verify the live URL actually works end-to-end (not just that it builds).
9. Flag any ambiguity in the spec instead of guessing silently.

Start with step 1 only — propose the strategy and wait for my confirmation before scaffolding.

---

## [Aug 8, 7:00 PM IST] strategy confirmation and ambiguity resolutions
Data files are now in place at data/curriculum.json, data/candidates.json, data/technical-spec.md — read them directly to confirm field names before scaffolding.

Answers to your flagged ambiguities:

1. Data files — fixed, see above. Confirm the actual schema matches what you assumed before proceeding; flag me immediately if it doesn't.

2. Start response combining greeting + Q1: Yes, combine them. Count it as question 1.

3. candidate object trust: Use the posted candidate object as-is, exactly as the contract implies. No fallback lookup needed — keep it simple, the contract is explicit that the client posts it.

4. Turn posted after done: true: Idempotently replay the final feedback payload. Do not error.

5. Error response shape: 400 + { "error": "...", "code": "..." } for malformed requests, 404 + same shape for unknown sessionId. Everything else returns 200.

6. Greeting counting toward "8 questions": Confirmed — only actual interrogative turns count, guarantee minimum 8 of those.

7. Fairness of probing unreached days: Your proposed approach is correct — weight near-zero, never let them displace a real signal from attempted/skipped days. Keep as designed.

8. Breeth: Defer it as you proposed. Build the in-memory Map first. Only add Breeth as an optional persistence adapter if time remains after the core interview flow, feedback generation, and frontend are all working and deployed. Do not let it block the critical path.

Your topic-scoring strategy, question budget/pacing, single structured-JSON-call-per-turn approach, and deterministic feedback fallback are all approved as designed — this is exactly the kind of grounded, guaranteed-compliant design I want. Proceed to step 2: scaffold /server, /client, .env.example (GROQ_API_KEY, PORT — no Breeth key for now), and README skeleton. Stop and report back before writing any interview logic, as you proposed.

---

## [Aug 8, 7:30 PM IST] Add deterministic interview planner, turn engine, and E2E verification
proceed

---

## [Aug 8, 7:50 PM IST] Add deterministic interview planner, turn engine, and E2E verification
that was a mistake to not proceed with the tool use. proceed

---

## [Aug 8, 8:00 PM IST] follow-up conversation
tell me how to add the groq api key ?
and tell me how to do these steps in detail-
cd server && cp .env.example .env   # add your key
npm run dev
node scripts/verify-interviews.mjs   # no MOCK_LLM — hits real Groq

---

## [Aug 8, 9:00 PM IST] backend-testing
test the backend completely
it should be working 100% successfully and correctly without any errors or flaws

---

## [Aug 8, 9:30 PM IST] Frontend
Backend is confirmed working. Now build the /client React chat UI: message input, scrolling message history, call the backend at an env-configurable API URL (not hardcoded localhost), show a clean feedback summary card when done: true is received. Keep it simple and polished over feature-rich — this is what "polish" gets judged on.
