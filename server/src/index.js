import { createApp } from './app.js';
import { config, assertConfig } from './config.js';
import * as store from './lib/sessions.js';

// Skipped during scaffolding so the server runs without a key; step 4 turns
// this on, since by then every turn genuinely needs Groq.
// assertConfig();

const app = createApp();

const server = app.listen(config.port, () => {
  console.log(`[server] listening on :${config.port}`);
  console.log(`[server] POST http://localhost:${config.port}/api/interview`);
  if (!config.groqApiKey) console.warn('[server] GROQ_API_KEY not set — engine stub only');
});

store.startSweeper();

// Render/Railway send SIGTERM on redeploy; exit cleanly so in-flight requests finish.
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    console.log(`[server] ${signal} received, shutting down`);
    server.close(() => process.exit(0));
  });
}
