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

