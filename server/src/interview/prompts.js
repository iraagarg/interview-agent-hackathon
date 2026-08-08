/**
 * Prompt construction.
 *
 * Two rules shape everything here:
 *  1. Questions are grounded in the real curriculum. Each topic's objectives and
 *     tools are injected verbatim so the agent asks about what the candidate was
 *     actually taught, not generic LLM interview trivia.
 *  2. Mission signals are interviewer-private. The agent is told the candidate
 *     skipped a day so it can probe accordingly — never so it can accuse them.
 */

const MAX_TRANSCRIPT_TURNS = 24;

/** Interviewers use first names. "Hello Gerald Combs" reads like a form letter. */
export const firstName = (candidate) =>
  (candidate?.member?.name || '').trim().split(/\s+/)[0] || 'there';

function candidateBrief(candidate) {
  const m = candidate?.member || {};
  const s = candidate?.signals || {};
  return [
    `Name: ${m.name ?? 'Unknown'}`,
    `Role: ${m.jobRole ?? 'Unknown'}`,
    `Experience: ${m.yearsExperience ?? '?'} years`,
    `Education: ${m.education ?? 'Unknown'}`,
    `Cohort signals: committed on ${s.commitDays ?? '?'} of 31 days, ` +
      `${s.missionsCompleted ?? '?'} missions completed, ` +
      `${s.missionsFirstTry ?? '?'} passed first try`,
  ].join('\n');
}

function topicBrief(topic, label = 'TOPIC') {
  return [
    `${label}: Day ${topic.day} — ${topic.title}`,
    `Module: ${topic.moduleTitle}`,
    `Type: ${topic.type}`,
    `Tools taught: ${topic.tools.join(', ')}`,
    `Learning objectives:`,
    ...topic.objectives.map((o) => `  - ${o}`),
    `Private signal (never state this verbatim to the candidate): the candidate ${topic.signal.label}` +
      (topic.signal.attempts ? ` (${topic.signal.attempts} attempts)` : ''),
  ].join('\n');
}

/**
 * Depth calibration. A 15-year principal engineer and a career-changer with zero
 * years both deserve a real interview, but not the same one.
 */
function depthGuidance(candidate, mode) {
  const years = Number(candidate?.member?.yearsExperience) || 0;
  const seniority =
    years >= 8
      ? 'Senior. Push on trade-offs, failure modes, scaling limits and "why this over the alternative".'
      : years >= 3
        ? 'Mid-level. Ask how things work and why choices were made; expect working knowledge, not architecture philosophy.'
        : 'Early-career. Ask what things do and how they used them. Be encouraging; probe understanding, not war stories.';

  const modeLine =
    mode === 'depth'
      ? 'This candidate has a spotless record — no skips, no failures, no repeated attempts. ' +
        'There are no gaps to hunt for, so test the DEPTH behind their clean passes. ' +
        'Assume competence and go a level deeper than you normally would.'
      : 'This candidate has real gaps in their record. Probe them honestly but without hostility — ' +
        'the goal is an accurate picture, not a trap.';

  return `${seniority}\n${modeLine}`;
}

const INTERVIEWER_RULES = `
You are a senior engineer conducting a technical interview for an AI engineering cohort.

HARD RULES:
- Ask exactly ONE question per reply. Your reply must contain exactly one "?".
  Never append a second question with "and", "also", or "as well as".
- Keep the reply under 3 sentences. Be conversational, not robotic.
- Never reveal scores, ratings, or your assessment of the candidate.
- Never mention "the curriculum", "Day N", mission records, attempts, or that you
  can see their progress data. You are an interviewer, not a report reader.
- Do not praise excessively. A brief acknowledgement then the next question.
- Ground every question in the real material listed under the topic.

VOICE:
- Use the candidate's FIRST name only, and rarely — a real interviewer does not
  say someone's name in every message. Never use their full name.
- Never open with a stock transition. These are banned: "Let's move on to",
  "Let's shift gears", "Moving on", "Let's talk about", "Let's discuss",
  "Now let's", "Next up". Open with the substance instead.
- Vary how you start. Consecutive questions must not share an opening pattern.
- Write the way a person actually speaks in an interview: short, direct, curious.
`.trim();

function transcriptBlock(transcript) {
  const recent = transcript.slice(-MAX_TRANSCRIPT_TURNS);
  if (recent.length === 0) return '(no conversation yet)';
  return recent
    .map((t) => `${t.role === 'interviewer' ? 'INTERVIEWER' : 'CANDIDATE'}: ${t.content}`)
    .join('\n');
}

/** Opening turn: greeting and question 1, combined into one reply. */
export function openingPrompt(session) {
  const topic = session.topics[0];

  const system = `${INTERVIEWER_RULES}

${depthGuidance(session.candidate, session.mode)}

Respond with JSON only, in this exact shape:
{ "reply": "your greeting plus your first question, as one short message" }`;

  const user = `CANDIDATE
${candidateBrief(session.candidate)}

${topicBrief(topic)}

Open the interview: greet them as "${firstName(session.candidate)}" — first name only —
in one short sentence, then ask your first question on the topic above. Return JSON.`;

  return { system, user };
}

/**
 * Every subsequent turn: grade the answer just given AND write the next question
 * in a single call.
 *
 * The server decides which actions are legal before calling, and only the legal
 * ones are offered. That avoids the failure mode where the model writes a
 * follow-up and the server overrides it to advance — leaving a reply that talks
 * about the wrong topic.
 */
export function turnPrompt(session, { currentTopic, nextTopic, allowFollowup, allowAdvance }) {
  const actions = [];
  if (allowFollowup) actions.push('"followup"');
  if (allowAdvance) actions.push('"next_topic"');

  const system = `${INTERVIEWER_RULES}

${depthGuidance(session.candidate, session.mode)}

You must do two things: assess the candidate's most recent answer, and write your
next message.

Scoring guide for "score":
  0 = no answer, refusal, or "I don't know"
  1 = vague or largely incorrect; keywords without understanding
  2 = broadly correct but shallow or missing an important part
  3 = correct, specific, and demonstrates real understanding

Choose "action" from: ${actions.join(' or ')}.
${allowFollowup && allowAdvance
    ? 'Follow up when their answer opened a thread worth pulling — a claim to test, a gap to probe, ' +
      'or a strong answer that can take a harder question. Move to the next topic when the thread is ' +
      'exhausted, or when they clearly do not know the material — grinding a blank answer wastes the interview.'
    : allowFollowup
      ? 'You must use "followup" on this turn.'
      : 'You must use "next_topic" on this turn.'}

If your action is "followup", your reply MUST explicitly reference something specific
the candidate just said — quote a term, tool, or claim from their answer.

If your action is "next_topic", BRIDGE into the new topic instead of announcing a
change of subject. Find something in what they just said — a tool, a constraint, a
habit of thinking — and use it as the doorway into the NEXT TOPIC below. If their
answer gives you nothing to bridge from, just ask the new question cold. Either way,
do not narrate the transition.

Respond with JSON only, in this exact shape:
{
  "assessment": { "score": 0, "covered": ["what they got right"], "missed": ["what they missed"] },
  "action": ${actions.join(' | ')},
  "reply": "your next message to the candidate"
}`;

  const user = `CANDIDATE
${candidateBrief(session.candidate)}

CURRENT ${topicBrief(currentTopic, 'TOPIC')}

${nextTopic ? `NEXT ${topicBrief(nextTopic, 'TOPIC')}` : '(no further topics — you must follow up on the current one)'}

CONVERSATION SO FAR
${transcriptBlock(session.transcript)}

Assess the candidate's most recent answer and write your next message. Return JSON.`;

  return { system, user };
}

/**
 * Final feedback synthesis.
 *
 * Built from the assessment ledger rather than a fresh read of the transcript.
 * Every answer was already graded at the moment it was given, so this call
 * summarises evidence that already exists instead of re-judging ten answers at
 * once — cheaper, and far more specific.
 */
export function feedbackPrompt(session) {
  const byDay = new Map();
  for (const entry of session.ledger) {
    const group = byDay.get(entry.day) || { ...entry, scores: [], covered: [], missed: [] };
    group.scores.push(entry.score);
    group.covered.push(...(entry.covered || []));
    group.missed.push(...(entry.missed || []));
    byDay.set(entry.day, group);
  }

  const evidence = [...byDay.values()]
    .map((g) => {
      const mean = g.scores.reduce((a, b) => a + b, 0) / g.scores.length;
      return [
        `Day ${g.day} — ${g.title} (${g.moduleTitle})`,
        `  cohort record: ${g.signal}`,
        `  interview scores: ${g.scores.join(', ')} (avg ${mean.toFixed(1)} out of 3)`,
        `  demonstrated: ${[...new Set(g.covered)].join('; ') || 'nothing specific'}`,
        `  missing: ${[...new Set(g.missed)].join('; ') || 'nothing specific'}`,
      ].join('\n');
    })
    .join('\n\n');

  const skipped = (session.topics || [])
    .filter((t) => t.signal?.kind === 'skipped')
    .map((t) => `Day ${t.day} — ${t.title}`);

  const system = `You are writing closing feedback for a candidate who has just finished a
technical interview about an AI engineering cohort they completed.

Write TO the candidate, in second person ("You explained...", "You could not...").
Be direct and specific. This is useful precisely because it is honest — do not
inflate, but do not be cruel either. No hedging, no corporate filler.

OUTPUT FORMAT — this is strict. Emit ONLY lines of the form "LABEL: text".
One line each, no blank lines, no bullets, no markdown, no numbering, no preamble.

SUMMARY: <2-3 sentences on how they did overall, naming the sharpest contrast between their strongest and weakest area>
STRENGTH: <one sentence, max 25 words>
STRENGTH: <one sentence, max 25 words>
GAP: <one sentence, max 25 words>
GAP: <one sentence, max 25 words>
NEXT: <one sentence, max 25 words>
NEXT: <one sentence, max 25 words>

RULES:
- Exactly one SUMMARY line. Between 2 and 4 each of STRENGTH, GAP and NEXT.
- Each STRENGTH must cite something they ACTUALLY demonstrated in their answers.
  Never invent a strength to be kind. If the evidence is thin, say what little
  they showed rather than padding it out.
- Each GAP names a specific thing they could not explain or do.
- Each NEXT must reference a specific curriculum day by number and title from the
  evidence below, and state a concrete action — build, rebuild, implement,
  measure. Never "study more" or "review the material".
- No line repeats another. Never use a newline inside a line.
- Do not mention scores, ratings, or that their cohort record was available to you.`;

  const user = `CANDIDATE
${candidateBrief(session.candidate)}

EVIDENCE FROM THE INTERVIEW (${session.questionCount} questions across ${byDay.size} topics)
${evidence}

${skipped.length ? `MISSIONS THEY SKIPPED DURING THE COHORT\n${skipped.join('\n')}` : ''}

Write the closing feedback now, as LABEL: text lines and nothing else.`;

  return { system, user };
}

/** Final turn: grade the last answer only. Feedback is composed separately. */
export function gradeOnlyPrompt(session, currentTopic) {
  const system = `You are assessing a candidate's answer in a technical interview.

Scoring guide:
  0 = no answer, refusal, or "I don't know"
  1 = vague or largely incorrect
  2 = broadly correct but shallow
  3 = correct, specific, demonstrates real understanding

Respond with JSON only:
{ "assessment": { "score": 0, "covered": ["..."], "missed": ["..."] } }`;

  const user = `${topicBrief(currentTopic)}

CONVERSATION SO FAR
${transcriptBlock(session.transcript)}

Assess the candidate's most recent answer. Return JSON.`;

  return { system, user };
}
