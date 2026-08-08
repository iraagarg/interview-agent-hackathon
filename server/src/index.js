import { createApp } from './app.js';
import { config, assertConfig } from './config.js';
import * as store from './lib/sessions.js';

// Fail at boot rather than degrading silently to scripted fallback questions
// mid-demo. MOCK_LLM=1 is the explicit opt-out for offline runs.
if (!config.mockLlm) assertConfig();

const app = createApp();

const server = app.listen(config.port, () => {
  console.log(`[server] listening on :${config.port}`);
  console.log(`[server] POST http://localhost:${config.port}/api/interview`);
  if (config.mockLlm) console.warn('[server] MOCK_LLM=1 — canned responses, no Groq calls');
});

store.startSweeper();

// Render/Railway send SIGTERM on redeploy; exit cleanly so in-flight requests finish.
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    console.log(`[server] ${signal} received, shutting down`);
    server.close(() => process.exit(0));
  });
}
