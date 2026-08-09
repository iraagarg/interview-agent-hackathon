/**
 * Post-deploy smoke test against a DEPLOYED backend.
 *
 * Unlike test-backend.mjs (which boots the app in-process) this talks to a real
 * URL over the network, so it verifies the thing judges will actually hit:
 * routing, CORS, environment variables, cold starts and per-session state on
 * the live instance.
 *
 *   node scripts/smoke-remote.mjs https://your-service.onrender.com
 *   node scripts/smoke-remote.mjs https://your-service.onrender.com --full
 *
 * Default runs 3 turns (~4 Groq calls). --full drives a complete interview
 * (~11 calls) and additionally asserts the 8-question and 4-day minimums.
 */
import { readFileSync } from 'node:fs';

const base = (process.argv[2] || '').replace(/\/+$/, '');
const full = process.argv.includes('--full');

if (!base) {
  console.error('Usage: node scripts/smoke-remote.mjs <backend-url> [--full]');
  process.exit(1);
}

const { candidates } = JSON.parse(
  readFileSync(new URL('../../data/candidates.json', import.meta.url))
);
const candidate = candidates.find((c) => c.member.id === 'CAND-010') || candidates[0];

let passed = 0;
const failures = [];

function check(label, ok, detail) {
  if (ok) {
    passed += 1;
    console.log(`  ok    ${label}`);
  } else {
    failures.push(label);
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

// Cold starts on a sleeping free-tier instance legitimately take ~50s.
async function post(body, timeoutMs = 120_000) {
  const started = Date.now();
  try {
    const res = await fetch(`${base}/api/interview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    return { status: res.status, json: await res.json().catch(() => null), ms: Date.now() - started };
  } catch (err) {
    return { status: 0, error: err.message, ms: Date.now() - started };
  }
}

console.log(`\nSmoke testing ${base}\n${'='.repeat(60)}`);

console.log('\nReachability');
const health = await fetch(`${base}/health`, { signal: AbortSignal.timeout(120_000) })
  .then(async (r) => ({ status: r.status, json: await r.json() }))
  .catch((e) => ({ status: 0, error: e.message }));
check('GET /health returns ok:true', health.status === 200 && health.json?.ok === true, health.error);

const root = await fetch(`${base}/`, { signal: AbortSignal.timeout(60_000) })
  .then(async (r) => ({ status: r.status, json: await r.json() }))
  .catch((e) => ({ status: 0, error: e.message }));
check('GET / describes the service (not a 404)', root.status === 200 && root.json?.status === 'ok');

console.log('\nError handling');
const unknown = await post({ sessionId: `missing-${Date.now()}`, message: 'hi' });
check('unknown sessionId -> 404 UNKNOWN_SESSION',
  unknown.status === 404 && unknown.json?.code === 'UNKNOWN_SESSION',
  `${unknown.status} ${unknown.json?.code}`);

const noSession = await post({ message: 'hi' });
check('missing sessionId -> 400 MISSING_SESSION_ID',
  noSession.status === 400 && noSession.json?.code === 'MISSING_SESSION_ID');

const noMessage = await post({ sessionId: 'x' });
check('turn without message -> 400 MISSING_MESSAGE',
  noMessage.status === 400 && noMessage.json?.code === 'MISSING_MESSAGE');

console.log('\nInterview');
const sessionId = `smoke-${Date.now()}`;
const start = await post({ sessionId, candidate });
check('start -> 200 { reply, done:false }',
  start.status === 200 && start.json?.done === false && typeof start.json?.reply === 'string',
  `${start.status} ${start.error || ''}`);
check('start body has exactly reply and done',
  Object.keys(start.json || {}).sort().join(',') === 'done,reply');
check('reply is real model output, not the mock harness',
  !String(start.json?.reply).includes('[MOCK]'));
console.log(`        first question (${start.ms}ms): ${String(start.json?.reply).slice(0, 100)}`);

const answers = [
  'Embeddings map text into a dense vector space where cosine distance approximates semantic similarity.',
  'We used an HNSW index because flat search got too slow past a few hundred thousand vectors.',
  'I would validate every input with Pydantic models before it reaches the handler.',
  "Honestly, I'm not confident on that one.",
  'You chunk the documents, embed each chunk, then retrieve top-k before generating.',
  'I would add a reranker and measure recall@k before and after.',
];

let questions = 1;
let final = null;
const limit = full ? 20 : 3;

for (let i = 0; i < limit; i += 1) {
  const res = await post({ sessionId, message: answers[i % answers.length] });
  if (res.status !== 200) {
    check(`turn ${i + 1} -> 200`, false, `${res.status} ${res.error || res.json?.code || ''}`);
    break;
  }
  if (res.json.done === true) { final = res.json; break; }
  check(`turn ${i + 1} -> 200 { reply, done:false }`,
    res.json.done === false && typeof res.json.reply === 'string' && !('feedback' in res.json));
  questions += 1;
  if (i === 0) {
    console.log(`        follow-up: ${String(res.json.reply).slice(0, 100)}`);
  }
}

check('conversation state persists across requests (more than one question asked)', questions > 1);

if (full) {
  check('interview reached the 8-question minimum', questions >= 8, `got ${questions}`);
  check('interview completed with done:true', final !== null);
  if (final) {
    const fb = final.feedback;
    check('final body has exactly reply, done and feedback',
      Object.keys(final).sort().join(',') === 'done,feedback,reply');
    check('feedback has exactly summary, strengths, gaps, next',
      Object.keys(fb || {}).sort().join(',') === 'gaps,next,strengths,summary');
    check('summary is a non-empty string', typeof fb?.summary === 'string' && fb.summary.trim().length > 0);
    for (const key of ['strengths', 'gaps', 'next']) {
      check(`${key} is a non-empty array of strings`,
        Array.isArray(fb?.[key]) && fb[key].length > 0 &&
        fb[key].every((s) => typeof s === 'string' && s.trim()));
    }
    const replay = await post({ sessionId, message: 'anything' });
    check('post-completion turn replays the final payload',
      replay.status === 200 && replay.json?.done === true && Boolean(replay.json?.feedback));
  }
} else {
  console.log(`\n  (run with --full to drive a complete interview and check the minimums)`);
}

console.log(`\n${'='.repeat(60)}`);
console.log(failures.length ? `${passed} passed, ${failures.length} FAILED` : `ALL PASSED — ${passed} checks`);
failures.forEach((f) => console.log(`  - ${f}`));
process.exit(failures.length ? 1 : 0);
