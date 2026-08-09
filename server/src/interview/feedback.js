import { chatText } from '../lib/groq.js';
import { feedbackPrompt } from './prompts.js';
import { mockFeedback } from './mock.js';

/**
 * Feedback shaping.
 *
 * `normalizeFeedback` is the contract guard: whatever produced the feedback, the
 * object leaving this module always matches the required shape —
 * { summary: string, strengths: string[], gaps: string[], next: string[] }.
 *
 * `composeFeedback` is the deterministic composer built from the assessment
 * ledger. It is the guaranteed floor: LLM-authored feedback (next step) is
 * layered on top and falls back to this whenever the model errors or returns
 * something malformed.
 */

const MIN_ITEMS = 2;
const MAX_ITEMS = 4;

const asCleanString = (v) =>
  typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '';

function normalizeList(value, fallback) {
  const items = (Array.isArray(value) ? value : [])
    .map(asCleanString)
    .filter((s) => s.length > 0)
    .slice(0, MAX_ITEMS);

  for (const filler of fallback) {
    if (items.length >= MIN_ITEMS) break;
    if (!items.includes(filler)) items.push(filler);
  }

  return items.length > 0 ? items : fallback.slice(0, MIN_ITEMS);
}

export function normalizeFeedback(raw, fallback) {
  return {
    summary: asCleanString(raw?.summary) || fallback.summary,
    strengths: normalizeList(raw?.strengths, fallback.strengths),
    gaps: normalizeList(raw?.gaps, fallback.gaps),
    next: normalizeList(raw?.next, fallback.next),
  };
}

/**
 * Parse `LABEL: text` lines into the contract shape.
 *
 * Tolerant on input, strict on output: leading bullets, numbering, markdown
 * emphasis and stray blank lines are all stripped, and anything that is not a
 * recognised label is ignored rather than allowed to corrupt a field.
 */
export function parseFeedbackLines(text) {
  const out = { summary: '', strengths: [], gaps: [], next: [] };
  if (typeof text !== 'string') return out;

  for (const line of text.split('\n')) {
    const cleaned = line.replace(/^[\s>*\-–—•]+/, '').replace(/^\d+[.)]\s*/, '').trim();
    const match = cleaned.match(/^\*{0,2}(SUMMARY|STRENGTH|GAP|NEXT)S?\*{0,2}\s*:\s*(.+)$/i);
    if (!match) continue;

    const value = match[2].replace(/\*\*/g, '').trim();
    if (!value) continue;

    switch (match[1].toUpperCase()) {
      case 'SUMMARY':
        out.summary = out.summary ? `${out.summary} ${value}` : value;
        break;
      case 'STRENGTH':
        out.strengths.push(value);
        break;
      case 'GAP':
        out.gaps.push(value);
        break;
      case 'NEXT':
        out.next.push(value);
        break;
    }
  }

  return out;
}

/**
 * Produce the final feedback object.
 *
 * The LLM writes it; the deterministic composer is the floor. If Groq errors or
 * omits a field, that piece falls back to ledger-derived text. The contract
 * shape is guaranteed no matter what the model does.
 */
/**
 * Drop any item citing a curriculum day the interview did not actually cover.
 *
 * Models mis-map day numbers — one run recommended revisiting "Day 28" for API
 * security when security is Day 27 and Day 28 is Docker. Wrong study advice is
 * worse than generic advice, and a prompt instruction cannot guarantee this the
 * way a check can. Anything dropped is refilled from the deterministic composer
 * by normalizeFeedback.
 */
function dropUngroundedDayReferences(items, validDays) {
  if (!Array.isArray(items)) return items;

  return items.filter((item) => {
    const referenced = [...String(item).matchAll(/\bDay\s+(\d+)/gi)].map((m) => Number(m[1]));
    const grounded = referenced.every((day) => validDays.has(day));
    if (!grounded) {
      console.warn(`[feedback] dropped item citing an uncovered day: ${String(item).slice(0, 80)}`);
    }
    return grounded;
  });
}

export async function generateFeedback(session) {
  const fallback = composeFeedback(session);

  try {
    const { system, user } = feedbackPrompt(session);
    const raw = await chatText({
      system,
      user,
      temperature: 0.4,
      maxTokens: 900,
      mock: () => mockFeedback(session),
    });

    const parsed = parseFeedbackLines(raw);
    const validDays = new Set((session.ledger || []).map((e) => e.day));

    for (const key of ['strengths', 'gaps', 'next']) {
      parsed[key] = dropUngroundedDayReferences(parsed[key], validDays);
    }

    return normalizeFeedback(parsed, fallback);
  } catch (err) {
    console.warn(`[feedback] synthesis failed, using deterministic composer: ${err.message}`);
    return fallback;
  }
}

const avg = (nums) => (nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0);

/** Deterministic feedback composed purely from the ledger. No LLM involved. */
export function composeFeedback(session) {
  const ledger = session.ledger || [];

  const scores = ledger.map((e) => e.score).filter((n) => Number.isFinite(n));
  const mean = avg(scores);

  // Aggregate per curriculum day BEFORE judging. A topic is probed with an
  // opener and a follow-up, so it produces several ledger entries and can
  // easily score 3 on one and 0 on the next. Partitioning raw entries lets the
  // same day land in both strengths and gaps, which reads as incoherent.
  const byDay = new Map();
  for (const entry of ledger) {
    const group = byDay.get(entry.day) || {
      day: entry.day,
      title: entry.title,
      signal: entry.signal,
      scores: [],
      covered: [],
      missed: [],
    };
    group.scores.push(entry.score);
    group.covered.push(...(entry.covered || []));
    group.missed.push(...(entry.missed || []));
    byDay.set(entry.day, group);
  }

  const topics = [...byDay.values()].map((g) => ({
    ...g,
    covered: [...new Set(g.covered)],
    missed: [...new Set(g.missed)],
    mean: avg(g.scores),
  }));

  const daysCovered = topics.map((t) => t.day);

  // Anything between the two thresholds is "adequate" and belongs in neither
  // list — a middling topic is not a headline strength or a real gap.
  const strong = topics.filter((t) => t.mean >= 2).sort((a, b) => b.mean - a.mean);
  const weak = topics.filter((t) => t.mean <= 1).sort((a, b) => a.mean - b.mean);

  const band =
    mean >= 2.4
      ? 'answered confidently across the board'
      : mean >= 1.6
        ? 'showed solid working knowledge with some shallow spots'
        : mean >= 0.8
          ? 'showed partial understanding that thinned out under follow-up questions'
          : 'struggled to demonstrate working knowledge of the material covered';

  // Only name a weakest topic when it is genuinely a different topic from the
  // strongest — otherwise the summary contradicts itself.
  const best = strong[0];
  const worst = weak[0];
  const highlight =
    best && worst
      ? `Strongest on ${best.title}; weakest on ${worst.title}.`
      : best
        ? `Strongest on ${best.title}.`
        : worst
          ? `Weakest on ${worst.title}.`
          : 'Performance was even across the topics covered.';

  const summary =
    `You were interviewed across ${daysCovered.length} curriculum topics over ` +
    `${session.questionCount} questions and ${band}. ${highlight}`;

  const strengths = strong.map((t) =>
    t.covered[0]
      ? `${t.title} (Day ${t.day}) — ${t.covered[0]}`
      : `Answered clearly on ${t.title} (Day ${t.day})`
  );

  const gaps = weak.map((t) =>
    t.missed[0]
      ? `${t.title} (Day ${t.day}) — ${t.missed[0]}`
      : `Could not demonstrate working knowledge of ${t.title} (Day ${t.day})`
  );

  // Recommendations point at real curriculum days, weakest first, with days the
  // candidate skipped outright appended — those are gaps by definition even if
  // the interview never reached them.
  const revisit = weak.map(
    (t) => `Revisit Day ${t.day} — ${t.title}, then rebuild that piece from scratch without notes`
  );

  const skippedTopics = (session.topics || [])
    .filter((t) => t.signal?.kind === 'skipped' && !weak.some((e) => e.day === t.day))
    .map((t) => `Complete the Day ${t.day} mission — ${t.title} — which was skipped during the cohort`);

  const next = [...revisit, ...skippedTopics];

  return normalizeFeedback(
    { summary, strengths, gaps, next },
    {
      summary,
      strengths: [
        `Completed a full technical interview across ${daysCovered.length} curriculum topics`,
        'Engaged with follow-up questions rather than deflecting',
      ],
      gaps: [
        'Answers did not go deep enough to fully assess the material',
        'Several responses stayed at a definitional level',
      ],
      next: [
        'Rebuild the weakest topic end-to-end without reference material',
        'Revisit the cohort missions that were skipped or needed multiple attempts',
      ],
    }
  );
}
