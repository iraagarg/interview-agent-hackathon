import 'dotenv/config';

/**
 * Central config. Read env once, here, so nothing else in the codebase
 * touches process.env directly.
 */
export const config = {
  port: Number(process.env.PORT) || 8080,
  groqApiKey: process.env.GROQ_API_KEY || '',
  groqModel: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',

  // Groq applies rate limits per model, so a second model carries its own
  // daily token budget. When the primary is exhausted the interview keeps
  // generating real questions on this one instead of dropping to the scripted
  // fallback. Set to an empty string to disable.
  groqFallbackModel:
    process.env.GROQ_FALLBACK_MODEL ?? 'llama-3.1-8b-instant',
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),

  // Session lifetime before the sweeper reclaims it.
  sessionTtlMs: 2 * 60 * 60 * 1000,

  // Which build is running. Render injects RENDER_GIT_COMMIT automatically, so
  // "did my deploy actually land?" is answerable with one curl instead of
  // guessing from uptime — uptime resets when a sleeping free-tier instance
  // wakes, which looks identical to a redeploy.
  commit: (process.env.RENDER_GIT_COMMIT || process.env.GIT_COMMIT || 'local').slice(0, 7),
  branch: process.env.RENDER_GIT_BRANCH || 'local',

  // MOCK_LLM=1 runs the whole interview against canned structured responses.
  // Lets the plan/turn/termination logic be tested deterministically with no
  // API key and no network — and gives a working offline demo fallback.
  mockLlm: process.env.MOCK_LLM === '1',

  // Artificial latency for mocked calls so tests exercise the same event-loop
  // interleaving as a real awaited network call.
  mockLatencyMs: Number(process.env.MOCK_LATENCY_MS) || 5,
};

/**
 * Fail fast and loudly at boot rather than at the first interview turn.
 * A missing key that only surfaces mid-demo is the worst failure mode.
 */
export function assertConfig() {
  if (!config.groqApiKey) {
    throw new Error(
      'GROQ_API_KEY is not set. Copy server/.env.example to server/.env and add your key.'
    );
  }
}
