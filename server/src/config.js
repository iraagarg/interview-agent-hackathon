import 'dotenv/config';

/**
 * Central config. Read env once, here, so nothing else in the codebase
 * touches process.env directly.
 */
export const config = {
  port: Number(process.env.PORT) || 8080,
  groqApiKey: process.env.GROQ_API_KEY || '',
  groqModel: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),

  // Session lifetime before the sweeper reclaims it.
  sessionTtlMs: 2 * 60 * 60 * 1000,

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
