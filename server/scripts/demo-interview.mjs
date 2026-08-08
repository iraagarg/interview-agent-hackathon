/**
 * Run ONE full interview and print the whole transcript plus the final feedback.
 *
 * This is the script for judging prompt QUALITY — whether questions are grounded
 * in real curriculum material, whether follow-ups actually reference what the
 * candidate said, whether replies stay short. verify-interviews.mjs checks the
 * contract; this one you read with your eyes.
 *
 *   node scripts/demo-interview.mjs                 first candidate, real Groq
 *   node scripts/demo-interview.mjs CAND-010        a specific candidate
 *   MOCK_LLM=1 node scripts/demo-interview.mjs      offline, no API calls
 *
 * Costs about 11 Groq calls per run.
 */
import { createApp } from '../src/app.js';
import * as store from '../src/lib/sessions.js';
import { readFileSync } from 'node:fs';

const { candidates } = JSON.parse(
  readFileSync(new URL('../../data/candidates.json', import.meta.url))
);

const wanted = process.argv[2];
const candidate = wanted
  ? candidates.find((c) => c.member.id === wanted || c.member.name === wanted)
  : candidates[0];

if (!candidate) {
  console.error(`No candidate matched "${wanted}".`);
  console.error('Available:', candidates.map((c) => c.member.id).join(', '));
  process.exit(1);
}

/** Stand-in answers, deliberately uneven so grading and follow-ups have something to work with. */
const ANSWERS = [
  'Embeddings map text into a dense vector space where cosine distance approximates semantic similarity. We used them to match support tickets to past resolutions.',
  "Honestly, I'm not confident on that one — I know the term but I couldn't explain it properly.",
  'We picked an HNSW index because flat search got too slow past a few hundred thousand vectors. The trade-off is recall, so we tuned efSearch until recall@10 was above 0.95.',
  'You chunk the docs, embed each chunk, retrieve top-k by similarity, then stuff those into the prompt as context before generating.',
  'I skipped that part of the cohort, so I have not used it in practice.',
  'I would add a reranker over the top-50 and measure recall@k before and after, because retrieval quality was the actual bottleneck rather than the model.',
];

const app = createApp();
const server = await new Promise((resolve) => {
  const s = app.listen(0, () => resolve(s));
});
const base = `http://localhost:${server.address().port}`;
const sessionId = `demo-${candidate.member.id}`;

const post = (body) =>
  fetch(`${base}/api/interview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then((r) => r.json());

const wrap = (text, indent) =>
  text.replace(new RegExp(`(.{1,${92 - indent.length}})(\\s|$)`, 'g'), `${indent}$1\n`).trimEnd();

const m = candidate.member;
console.log(`\n${'='.repeat(94)}`);
console.log(`${m.name} · ${m.jobRole} · ${m.yearsExperience}y · ${m.id}`);
console.log(`${'='.repeat(94)}\n`);

let res = await post({ sessionId, candidate });

const session = store.get(sessionId);
console.log('PLAN  (mode: ' + session.mode + ')');
for (const t of session.topics) {
  console.log(
    `  Day ${String(t.day).padStart(2)}  score ${String(t.score).padStart(3)}  ` +
      `${t.signal.kind.padEnd(9)}  ${t.moduleTitle.padEnd(34)}  ${t.title}`
  );
}
console.log(`  reserve: ${session.reserve.map((t) => t.day).join(', ')}\n`);
console.log('-'.repeat(94) + '\n');

let q = 1;
console.log(`Q${q}\n${wrap(res.reply, '   ')}\n`);

for (let i = 0; i < 30 && !res.done; i += 1) {
  const answer = ANSWERS[i % ANSWERS.length];
  console.log(`A${q}\n${wrap(answer, '   ')}\n`);

  res = await post({ sessionId, message: answer });

  if (res.done) {
    console.log('-'.repeat(94));
    console.log(`\nCLOSING\n${wrap(res.reply, '   ')}\n`);
    console.log('FEEDBACK');
    console.log(JSON.stringify(res.feedback, null, 2));
    break;
  }

  q += 1;
  console.log(`Q${q}\n${wrap(res.reply, '   ')}\n`);
}

const days = [...new Set(session.transcript.filter((t) => t.day).map((t) => t.day))];
console.log(`\n${'-'.repeat(94)}`);
console.log(`questions: ${q}   distinct days: ${days.length} (${days.join(', ')})`);
console.log(
  `contract: ${q >= 8 ? 'PASS' : 'FAIL'} min-8-questions   ` +
    `${days.length >= 4 ? 'PASS' : 'FAIL'} min-4-days   ` +
    `${res.done && res.feedback ? 'PASS' : 'FAIL'} feedback-present`
);

server.close();
