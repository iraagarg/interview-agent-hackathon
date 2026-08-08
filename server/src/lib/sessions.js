import { config } from '../config.js';

/**
 * In-memory session store, keyed by sessionId.
 *
 * This is the source of truth for conversation state and is the reason the
 * server must be deployed as a persistent process (Render/Railway), not as
 * serverless functions — a cold start would drop every in-flight interview.
 *
 * The store is deliberately kept behind this small interface so a persistent
 * adapter (e.g. Breeth) can be swapped in later without touching the engine.
 */
const sessions = new Map();

/**
 * Per-session serialization.
 *
 * A turn reads session state, awaits the LLM, then writes back. Two requests
 * for one sessionId that overlap across that await both read the same cursor,
 * both grade against the same topic, and push their transcript entries out of
 * order — producing a conversation like "answer answer answer question question
 * question". It is not hypothetical: a double-clicked send button or a
 * StrictMode double-invoke is enough once real network latency is involved.
 *
 * Tasks for the same sessionId are chained so they run one at a time. Different
 * sessionIds are untouched and still run fully in parallel.
 */
const chains = new Map();

export function runExclusive(sessionId, task) {
  const previous = chains.get(sessionId) ?? Promise.resolve();

  // Run the next task whether the previous one resolved or threw — a failed
  // request must never wedge the queue for that session.
  const result = previous.then(task, task);

  const tail = result.then(
    () => {},
    () => {}
  );
  chains.set(sessionId, tail);

  // Drop the entry once this is the last task in the chain, so the map does not
  // grow without bound across many sessions.
  tail.finally(() => {
    if (chains.get(sessionId) === tail) chains.delete(sessionId);
  });

  return result;
}

/** Outstanding lock chains. Should drain to 0 once requests settle. */
export const lockCount = () => chains.size;

export function has(sessionId) {
  return sessions.has(sessionId);
}

export function get(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) return null;
  session.lastSeenAt = Date.now();
  return session;
}

export function create(sessionId, candidate) {
  const now = Date.now();
  const session = {
    sessionId,
    candidate,
    createdAt: now,
    lastSeenAt: now,

    // --- filled in by the interview engine (step 4) ---
    plan: [],          // ordered list of curriculum days to probe
    cursor: 0,         // index into plan
    questionCount: 0,  // interrogative turns asked so far (minimum 8)
    topicFollowups: 0, // follow-ups spent on the current topic
    transcript: [],    // [{ role: 'interviewer' | 'candidate', content, at }]
    ledger: [],        // per-answer assessments, feeds the final feedback
    done: false,
    openingPayload: null, // cached so a duplicate start replays instead of resetting
    finalPayload: null,   // cached so post-completion turns replay idempotently
  };
  sessions.set(sessionId, session);
  return session;
}

export function remove(sessionId) {
  return sessions.delete(sessionId);
}

export function size() {
  return sessions.size;
}

/** Bound memory on a long-lived server. */
export function sweep(now = Date.now()) {
  let removed = 0;
  for (const [id, session] of sessions) {
    if (now - session.lastSeenAt > config.sessionTtlMs) {
      sessions.delete(id);
      removed += 1;
    }
  }
  return removed;
}

let sweepTimer = null;

export function startSweeper(intervalMs = 15 * 60 * 1000) {
  if (sweepTimer) return sweepTimer;
  sweepTimer = setInterval(() => {
    const removed = sweep();
    if (removed > 0) console.log(`[sessions] swept ${removed} expired session(s)`);
  }, intervalMs);
  sweepTimer.unref?.();
  return sweepTimer;
}
