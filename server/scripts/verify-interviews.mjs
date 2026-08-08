/**
 * End-to-end contract verification.
 *
 * Drives a complete interview for every candidate in the dataset through the
 * real HTTP endpoint and asserts the guarantees the spec requires:
 *
 *   - at least 8 questions
 *   - at least 4 distinct curriculum days
 *   - every non-final response is exactly { reply, done: false }
 *   - the final response carries a well-formed feedback object
 *   - the interview always terminates
 *
 * Starts its own server in-process — nothing else needs to be running.
 *
 *   MOCK_LLM=1 node scripts/verify-interviews.mjs     all 20, offline, free
 *   LIMIT=2 node scripts/verify-interviews.mjs        2 candidates, real Groq
 *
 * Each candidate costs ~11 Groq calls, so the full 20-candidate sweep is ~220
 * calls and will hit free-tier rate limits. Use LIMIT for real-API runs.
 */
import { createApp } from '../src/app.js';
import * as store from '../src/lib/sessions.js';
import { readFileSync } from 'node:fs';

const all = JSON.parse(readFileSync(new URL('../../data/candidates.json', import.meta.url))).candidates;
const limit = Number(process.env.LIMIT) || all.length;
const candidates = all.slice(0, limit);

const MAX_TURNS = 40;
const ANSWERS = [
  'Embeddings map text into a dense vector space where cosine distance approximates semantic similarity.',
  "I'm not really sure about that one.",
  'We used a HNSW index because brute-force search got too slow past a few hundred thousand vectors.',
  'You chunk the documents, embed each chunk, then retrieve top-k by similarity before passing to the model.',
  'Honestly I skipped that part of the course.',
  'I would add a reranker and measure recall@k before and after to see if it actually helped.',
];

const app = createApp();
const server = await new Promise((resolve) => {
  const s = app.listen(0, () => resolve(s));
});
const base = `http://localhost:${server.address().port}`;

const post = async (body) => {
  const res = await fetch(`${base}/api/interview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
};

function checkFeedback(fb) {
  const problems = [];
  if (typeof fb !== 'object' || fb === null) return ['feedback is not an object'];
  if (typeof fb.summary !== 'string' || !fb.summary.trim()) problems.push('summary not a non-empty string');
  for (const key of ['strengths', 'gaps', 'next']) {
    if (!Array.isArray(fb[key])) { problems.push(`${key} is not an array`); continue; }
    if (fb[key].length === 0) problems.push(`${key} is empty`);
    if (!fb[key].every((s) => typeof s === 'string' && s.trim())) {
      problems.push(`${key} contains a non-string or empty entry`);
    }
  }
  const extra = Object.keys(fb).filter((k) => !['summary', 'strengths', 'gaps', 'next'].includes(k));
  if (extra.length) problems.push(`unexpected feedback keys: ${extra.join(', ')}`);
  return problems;
}

let failures = 0;
const stats = [];

for (const candidate of candidates) {
  const id = candidate.member.id;
  const sessionId = `verify-${id}`;
  const problems = [];

  let res = await post({ sessionId, candidate });
  if (res.status !== 200) problems.push(`start returned ${res.status}`);
  if (res.body.done !== false) problems.push('start did not return done:false');
  if (typeof res.body.reply !== 'string' || !res.body.reply.trim()) problems.push('start reply empty');

  let questions = 1;
  let turns = 0;
  let final = null;

  while (turns < MAX_TURNS) {
    const answer = ANSWERS[turns % ANSWERS.length];
    res = await post({ sessionId, message: answer });
    turns += 1;

    if (res.status !== 200) { problems.push(`turn ${turns} returned ${res.status}`); break; }
    if (typeof res.body.reply !== 'string' || !res.body.reply.trim()) {
      problems.push(`turn ${turns} reply empty`);
    }

    if (res.body.done === true) { final = res.body; break; }

    if (res.body.done !== false) problems.push(`turn ${turns} done is not a boolean false`);
    if ('feedback' in res.body) problems.push(`turn ${turns} leaked feedback before done`);
    questions += 1;
  }

  if (!final) problems.push(`interview did not terminate within ${MAX_TURNS} turns`);
  else problems.push(...checkFeedback(final.feedback));

  // Same-process inspection for coverage the HTTP surface does not expose.
  const session = store.get(sessionId);
  const days = new Set((session?.transcript || []).filter((t) => t.day).map((t) => t.day));

  if (questions < 8) problems.push(`only ${questions} questions asked (minimum 8)`);
  if (days.size < 4) problems.push(`only ${days.size} distinct days covered (minimum 4)`);

  // Idempotent replay after completion.
  const replay = await post({ sessionId, message: 'anything' });
  if (replay.status !== 200 || replay.body.done !== true || !replay.body.feedback) {
    problems.push('post-completion turn did not replay the final payload');
  }

  stats.push({ id, questions, days: days.size, mode: session?.mode, problems });
  if (problems.length) failures += 1;
}

console.log('candidate  questions  days  mode   result');
console.log('-'.repeat(64));
for (const s of stats) {
  console.log(
    `${s.id}   ${String(s.questions).padStart(6)}   ${String(s.days).padStart(4)}  ${(s.mode || '?').padEnd(6)} ` +
      (s.problems.length ? `FAIL: ${s.problems.join('; ')}` : 'ok')
  );
}

const qs = stats.map((s) => s.questions);
console.log('-'.repeat(64));
console.log(
  `${stats.length - failures}/${stats.length} passed  |  questions min ${Math.min(...qs)} max ${Math.max(...qs)}  |  ` +
    `days min ${Math.min(...stats.map((s) => s.days))}`
);

server.close();
process.exit(failures ? 1 : 0);
