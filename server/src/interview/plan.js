import { getDay, getModule, allDays } from '../lib/curriculum.js';

/**
 * Deterministic interview planner.
 *
 * No LLM is involved here. Which curriculum days get probed — and therefore the
 * "at least 4 different days across modules" guarantee — is decided by plain
 * scoring over the candidate's mission history. The model only writes language.
 */

export const PLAN_SIZE = 5;
export const MIN_QUESTIONS = 8;
export const MAX_QUESTIONS = 12;
export const MAX_FOLLOWUPS_PER_TOPIC = 1;

/** Max topics drawn from any single module, so the plan spans the curriculum. */
const MODULE_CAP = 2;

const TIERS = {
  skipped:   { score: 100, label: 'skipped this day entirely — never attempted the mission' },
  failed:    { score:  80, label: 'attempted the mission but did not pass' },
  struggled: { score:  60, label: 'passed, but only after several attempts' },
  friction:  { score:  40, label: 'passed on the second attempt' },
  clean:     { score:  15, label: 'passed first try' },
  unknown:   { score:  10, label: 'mission outcome not recorded' },
  // Only ever used to top the plan up to the minimum day count when a candidate
  // record is too thin to fill it. Never competes with real evidence.
  unattempted: { score: 0, label: 'has no recorded attempt at this material' },
};

/**
 * Classify one mission.
 *
 * Order matters. A skipped mission carries NO `passed` and NO `attempts` key at
 * all — `{ day, title, skipped: true }` is the whole object — so `skipped` is
 * tested first and `passed` is compared by identity. A truthiness test like
 * `!m.passed` would misfile every skipped mission as a failure.
 */
export function classifyMission(mission) {
  if (mission?.skipped === true) return { kind: 'skipped', attempts: null };
  if (mission?.passed === false) {
    return { kind: 'failed', attempts: Number(mission.attempts) || null };
  }
  if (mission?.passed === true) {
    const attempts = Number(mission.attempts) || 1;
    if (attempts >= 3) return { kind: 'struggled', attempts };
    if (attempts === 2) return { kind: 'friction', attempts };
    return { kind: 'clean', attempts: 1 };
  }
  return { kind: 'unknown', attempts: null };
}

/**
 * Tier score plus a small attempts bonus, so a 5-attempt struggle outranks a
 * 3-attempt one. The bonus caps at 5, well below the ~20-point tier gaps, so it
 * orders within a tier without ever promoting across tiers.
 */
export function scoreMission(mission) {
  const { kind, attempts } = classifyMission(mission);
  return TIERS[kind].score + Math.min(attempts || 0, 5);
}

function toTopic(mission) {
  // Join on day number only. 21 of the 200 missions carry a title that differs
  // from the curriculum's, so the mission title is never used for lookup or
  // display — the curriculum title is canonical. Coerced because a client may
  // post the day as a string.
  const dayNumber = Number(mission?.day);
  const day = getDay(dayNumber);
  if (!day) return null;

  const mod = getModule(dayNumber);
  const { kind, attempts } = classifyMission(mission);

  return {
    day: day.day,
    title: day.title,
    type: day.type,
    tools: day.tools,
    objectives: day.objectives,
    moduleN: mod?.n ?? null,
    moduleTitle: mod?.title ?? 'Unknown Module',
    signal: { kind, attempts, label: TIERS[kind].label },
    score: scoreMission(mission),
  };
}

/**
 * Build the interview plan.
 *
 * The candidate pool is drawn ONLY from days present in `missions`. The missions
 * array is a sample, not a complete record — candidates list 9-11 of 31 days
 * while `signals.missionsCompleted` runs as high as 31 — so a day's absence is
 * not evidence that it was never reached. Probing days we have no evidence for
 * would be guessing. Every candidate has at least 9 recorded days, comfortably
 * more than the 8 topics a worst-case interview could need.
 */
export function buildPlan(candidate, { size = PLAN_SIZE } = {}) {
  const missions = Array.isArray(candidate?.missions) ? candidate.missions : [];

  const scored = missions
    .map(toTopic)
    .filter(Boolean)
    // score desc, then day asc — fully deterministic, no ties left to chance.
    .sort((a, b) => b.score - a.score || a.day - b.day);

  // One topic per curriculum day. A client can post two mission entries for the
  // same day; without this the same day can be selected twice and the plan
  // reports five topics covering only four distinct days.
  const pool = [];
  const seenDays = new Set();
  for (const topic of scored) {
    if (seenDays.has(topic.day)) continue; // already sorted, so this keeps the highest score
    seenDays.add(topic.day);
    pool.push(topic);
  }

  const selected = [];
  const perModule = new Map();
  const remaining = new Set(pool);

  while (selected.length < size && remaining.size > 0) {
    // Respect the per-module cap while it still leaves something to pick. If a
    // candidate's recorded days cluster into very few modules, relax rather
    // than return a short plan.
    const underCap = [...remaining].filter(
      (t) => (perModule.get(t.moduleN) || 0) < MODULE_CAP
    );
    const pickFrom = underCap.length > 0 ? underCap : [...remaining];

    const best = pickFrom.reduce((a, b) => (isBetterPick(b, a, perModule) ? b : a));

    selected.push(best);
    remaining.delete(best);
    perModule.set(best.moduleN, (perModule.get(best.moduleN) || 0) + 1);
  }

  applyStrengthAnchor(selected, pool);
  topUpFromCurriculum(selected, size, perModule);

  const chosen = new Set(selected.map((t) => t.day));
  const reserve = pool.filter((t) => !chosen.has(t.day));

  // A candidate with no skips, no failures and no repeated attempts (three of
  // the twenty are exactly this) has no gaps to probe. Scoring collapses to a
  // single tier, so the interview switches to testing depth on material they
  // already passed rather than hunting for weaknesses that are not there.
  const mode = pool.some((t) => t.signal.kind !== 'clean' && t.signal.kind !== 'unknown')
    ? 'gap'
    : 'depth';

  return { topics: selected, reserve, mode };
}

/**
 * Last-resort top-up so the "at least 4 different curriculum days" guarantee
 * never depends on how much history a candidate record happens to carry.
 *
 * The supplied dataset never reaches this — every candidate has at least 9
 * recorded days — but a client is free to post a candidate with two missions,
 * and the contract requirement is absolute. Days added here are marked
 * `unattempted` and score 0, so they are always ranked below real evidence and
 * the prompt can frame them as new material rather than as a suspected gap.
 */
function topUpFromCurriculum(selected, size, perModule) {
  if (selected.length >= size) return;

  const chosen = new Set(selected.map((t) => t.day));

  const fillers = allDays()
    .filter((d) => !chosen.has(d.day))
    .map((d) => {
      const mod = getModule(d.day);
      return {
        day: d.day,
        title: d.title,
        type: d.type,
        tools: d.tools,
        objectives: d.objectives,
        moduleN: mod?.n ?? null,
        moduleTitle: mod?.title ?? 'Unknown Module',
        signal: { kind: 'unattempted', attempts: null, label: TIERS.unattempted.label },
        score: TIERS.unattempted.score,
      };
    });

  while (selected.length < size && fillers.length > 0) {
    // Spread across modules the plan does not already cover, so a padded plan
    // still samples the curriculum rather than three consecutive days.
    const fresh = fillers.filter((t) => (perModule.get(t.moduleN) || 0) === 0);
    const pickFrom = fresh.length > 0 ? fresh : fillers;
    const best = pickFrom.reduce((a, b) => (a.day <= b.day ? a : b));

    selected.push(best);
    perModule.set(best.moduleN, (perModule.get(best.moduleN) || 0) + 1);
    fillers.splice(fillers.indexOf(best), 1);
  }
}

/**
 * Selection order: score first, breadth only as a tiebreak.
 *
 * Signal never loses to cosmetics — a 5-attempt failure always outranks a clean
 * pass regardless of module. But when two topics score identically (every topic
 * ties for a candidate with a spotless record) the one from an unrepresented
 * module wins, which buys curriculum breadth for free. Day number is the final
 * tiebreak so the plan is fully deterministic.
 */
function isBetterPick(a, b, perModule) {
  if (a.score !== b.score) return a.score > b.score;

  const aFresh = (perModule.get(a.moduleN) || 0) === 0;
  const bFresh = (perModule.get(b.moduleN) || 0) === 0;
  if (aFresh !== bFresh) return aFresh;

  return a.day < b.day;
}

/**
 * Guarantee at least one topic the candidate passed first try.
 *
 * Two reasons: an interview built purely from failures reads as an
 * interrogation, and the final feedback's `strengths` array needs real
 * evidence to cite. The swap is skipped if it would drop the plan below four
 * distinct modules.
 */
function applyStrengthAnchor(selected, pool) {
  if (selected.some((t) => t.signal.kind === 'clean')) return;

  // Compare by day, not object identity — otherwise a second topic for a day
  // already in the plan can be swapped in, duplicating that day.
  const selectedDays = new Set(selected.map((t) => t.day));
  const anchor = pool.find((t) => t.signal.kind === 'clean' && !selectedDays.has(t.day));
  if (!anchor) return;

  // Drop the weakest signal, not the strongest — we trade away the least
  // informative gap question.
  const victimIndex = selected.length - 1;
  const candidateSelection = selected.slice();
  candidateSelection[victimIndex] = anchor;

  const modulesAfter = new Set(candidateSelection.map((t) => t.moduleN)).size;
  const modulesBefore = new Set(selected.map((t) => t.moduleN)).size;
  if (modulesAfter < 4 && modulesAfter < modulesBefore) return;

  selected[victimIndex] = anchor;
}

/** Compact plan description for logging and for the final feedback prompt. */
export function describePlan(plan) {
  return plan.topics
    .map((t) => `Day ${t.day} (${t.moduleTitle}) — ${t.title} [${t.signal.kind}]`)
    .join('\n');
}
