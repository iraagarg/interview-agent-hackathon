import { chatJSON } from '../lib/groq.js';
import { openingPrompt, turnPrompt, gradeOnlyPrompt, firstName } from './prompts.js';
import { generateFeedback } from './feedback.js';
import {
  buildPlan,
  MIN_QUESTIONS,
  MAX_QUESTIONS,
  MAX_FOLLOWUPS_PER_TOPIC,
} from './plan.js';
import { mockOpening, mockTurn, mockGrade } from './mock.js';

/**
 * Interview engine.
 *
 * Division of labour: this module owns every guarantee (how many questions, how
 * many days, when the interview ends). The LLM owns wording and grading only.
 * If Groq disappears mid-interview the interview still completes correctly — the
 * questions just get less adaptive.
 */

const now = () => Date.now();

/** Models occasionally wrap replies in quotes or leak a label. Strip that. */
function cleanReply(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  return text
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/^(INTERVIEWER|Interviewer)\s*:\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function clampScore(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 1;
  return Math.max(0, Math.min(3, Math.round(n)));
}

const asStringList = (v) =>
  (Array.isArray(v) ? v : [])
    .map((s) => (typeof s === 'string' ? s.trim() : ''))
    .filter(Boolean)
    .slice(0, 3);

function recordAnswer(session, topic, assessment, answer) {
  session.ledger.push({
    day: topic.day,
    title: topic.title,
    moduleTitle: topic.moduleTitle,
    signal: topic.signal.kind,
    score: clampScore(assessment?.score),
    covered: asStringList(assessment?.covered),
    missed: asStringList(assessment?.missed),
    answer,
  });
}

/**
 * The next topic we are allowed to move to.
 *
 * Reserve topics are only drawn while we are still below the 8-question
 * minimum. That is the mechanism that guarantees the minimum even if the
 * candidate answers "I don't know" to everything and every topic closes after a
 * single question: 5 planned topics plus reserve covers it, and every candidate
 * has at least 9 recorded mission days to draw from.
 */
function peekNextTopic(session) {
  if (session.cursor + 1 < session.topics.length) return session.topics[session.cursor + 1];
  if (session.questionCount < MIN_QUESTIONS && session.reserve.length > 0) {
    return session.reserve[0];
  }
  return null;
}

function advanceTopic(session) {
  if (session.cursor + 1 < session.topics.length) {
    session.cursor += 1;
  } else if (session.reserve.length > 0) {
    session.topics.push(session.reserve.shift());
    session.cursor += 1;
  }
  session.topicFollowups = 0;
}

function shouldConclude(session) {
  if (session.questionCount >= MAX_QUESTIONS) return true;
  if (session.questionCount < MIN_QUESTIONS) return false; // never end early
  return (
    !peekNextTopic(session) && session.topicFollowups >= MAX_FOLLOWUPS_PER_TOPIC
  );
}

// --- opening -----------------------------------------------------------------

export async function startInterview(session) {
  const plan = buildPlan(session.candidate);

  session.topics = plan.topics;
  session.reserve = plan.reserve;
  session.mode = plan.mode;
  session.cursor = 0;
  session.topicFollowups = 0;
  session.questionCount = 0;

  if (session.topics.length === 0) {
    // Candidate posted with an empty missions array. Nothing to ground an
    // interview in, so say so plainly rather than inventing curriculum.
    const reply =
      `Thanks for joining. I don't have any recorded cohort progress for you yet, ` +
      `so there's nothing for me to interview you on — please check the candidate record.`;
    session.transcript.push({ role: 'interviewer', content: reply, at: now() });
    return { reply, done: false };
  }

  const topic = session.topics[0];
  let reply;

  try {
    const { system, user } = openingPrompt(session);
    const out = await chatJSON({
      system,
      user,
      temperature: 0.7,
      mock: () => mockOpening(session, topic),
    });
    reply = cleanReply(out.reply);
  } catch (err) {
    console.warn(`[engine] opening generation failed, using fallback: ${err.message}`);
  }

  if (!reply) {
    const name = firstName(session.candidate);
    reply =
      `Hi ${name}, thanks for making time — let's get started. ` +
      `To begin: ${topic.objectives[0]?.replace(/^./, (c) => c.toLowerCase())} — ` +
      `walk me through how you'd approach that.`;
  }

  session.questionCount = 1;
  session.transcript.push({ role: 'interviewer', content: reply, day: topic.day, at: now() });

  return { reply, done: false };
}

// --- turns -------------------------------------------------------------------

export async function handleTurn(session, message) {
  session.transcript.push({ role: 'candidate', content: message, at: now() });

  const currentTopic = session.topics[session.cursor];

  if (!currentTopic) {
    // Only reachable for the empty-missions case above.
    const reply = 'There is no interview in progress for this candidate record.';
    return { reply, done: false };
  }

  if (shouldConclude(session)) {
    return concludeInterview(session, currentTopic, message);
  }

  const nextTopic = peekNextTopic(session);
  let allowFollowup = session.topicFollowups < MAX_FOLLOWUPS_PER_TOPIC;
  let allowAdvance = Boolean(nextTopic);

  // Defensive: below the minimum with nowhere to go, keep probing the current
  // topic rather than ending the interview short of the contract requirement.
  if (!allowFollowup && !allowAdvance) allowFollowup = true;

  let out;
  try {
    const { system, user } = turnPrompt(session, {
      currentTopic,
      nextTopic,
      allowFollowup,
      allowAdvance,
    });
    out = await chatJSON({
      system,
      user,
      temperature: 0.6,
      mock: () => mockTurn(session, { currentTopic, nextTopic, allowFollowup, allowAdvance }),
    });
  } catch (err) {
    console.warn(`[engine] turn generation failed, using fallback: ${err.message}`);
    out = null;
  }

  // The server, not the model, has the final say on what happens next.
  let action = out?.action === 'next_topic' || out?.action === 'followup' ? out.action : null;
  if (action === 'next_topic' && !allowAdvance) action = 'followup';
  if (action === 'followup' && !allowFollowup) action = 'next_topic';
  if (!action) action = allowAdvance ? 'next_topic' : 'followup';

  recordAnswer(session, currentTopic, out?.assessment, message);

  if (action === 'next_topic') advanceTopic(session);
  else session.topicFollowups += 1;

  const askedTopic = session.topics[session.cursor];
  let reply = cleanReply(out?.reply);

  if (!reply) {
    reply =
      action === 'next_topic'
        ? `Understood — let's move on. ${askedTopic.objectives[0]} — how would you handle that?`
        : `Can you go a level deeper on that? Walk me through the specifics.`;
  }

  session.questionCount += 1;
  session.transcript.push({
    role: 'interviewer',
    content: reply,
    day: askedTopic.day,
    at: now(),
  });

  return { reply, done: false };
}

// --- conclusion --------------------------------------------------------------

async function concludeInterview(session, currentTopic, message) {
  let assessment = null;
  try {
    const { system, user } = gradeOnlyPrompt(session, currentTopic);
    const out = await chatJSON({
      system,
      user,
      temperature: 0.2,
      maxTokens: 400,
      mock: () => mockGrade(session),
    });
    assessment = out?.assessment;
  } catch (err) {
    console.warn(`[engine] final grade failed, scoring neutrally: ${err.message}`);
  }

  recordAnswer(session, currentTopic, assessment, message);

  const feedback = await generateFeedback(session);
  const name = firstName(session.candidate);

  const payload = {
    reply:
      `That's everything I wanted to cover, ${name}. Thanks for walking me through all of that — ` +
      `here's my honest read on where you stand.`,
    done: true,
    feedback,
  };

  session.done = true;
  session.finalPayload = payload;
  session.transcript.push({ role: 'interviewer', content: payload.reply, at: now() });

  return payload;
}
