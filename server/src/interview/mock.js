/**
 * Canned LLM responses for MOCK_LLM=1.
 *
 * These exist so the deterministic parts of the interview — plan construction,
 * question counting, follow-up vs advance, termination, feedback shaping — can
 * be exercised end-to-end with no API key and no network. They are deliberately
 * obvious placeholders: nobody should mistake mock output for a real interview.
 */

export function mockOpening(session, topic) {
  const name = session.candidate?.member?.name || 'there';
  return {
    reply: `[MOCK] Hi ${name}. To start: ${topic.objectives[0]} — how would you approach that?`,
  };
}

/**
 * Alternates action so a single mock run exercises both the follow-up and the
 * advance path. Scores cycle 0..3 so the ledger contains every band and the
 * feedback composer's strength/gap partitioning gets tested.
 */
export function mockTurn(session, { currentTopic, nextTopic, allowFollowup, allowAdvance }) {
  const n = session.questionCount;

  // MOCK_ACTION forces a single branch so the worst cases can be tested:
  //   advance  — every topic closes after one question (candidate knows nothing),
  //              which is the path that must draw reserve topics to reach 8.
  //   followup — every answer invites a deeper probe, which must stop at the cap.
  const strategy = process.env.MOCK_ACTION || 'alternate';
  const wantFollowup =
    strategy === 'followup' ? true : strategy === 'advance' ? false : n % 2 === 1;

  const action = wantFollowup && allowFollowup ? 'followup' : allowAdvance ? 'next_topic' : 'followup';
  const target = action === 'next_topic' ? nextTopic : currentTopic;

  return {
    assessment: {
      // Keyed to the day, not the turn counter, so a topic scores consistently
      // across its opener and follow-up. Turn-keyed scores averaged out to a
      // dead-centre 1.5 for every day, which hid the composer's strength and
      // gap paths behind the neutral middle band.
      score: currentTopic.day % 4,
      covered: [`mentioned ${currentTopic.tools[0]}`],
      missed: [`did not explain ${currentTopic.objectives[1] || 'the trade-offs'}`],
    },
    action,
    reply:
      action === 'followup'
        ? `[MOCK follow-up on Day ${currentTopic.day}] You mentioned ${currentTopic.tools[0]} — go deeper on that.`
        : `[MOCK pivot to Day ${target.day}] ${target.objectives[0]} — talk me through it.`,
  };
}

/**
 * Returns the labelled-line format the real prompt asks for, deliberately
 * messy: a markdown bullet, a bold label, a blank line and a stray line with no
 * label, so the parser's tolerance gets exercised. Only SUMMARY and NEXT are
 * emitted, so the fallback merge for the missing fields is exercised too.
 */
export function mockFeedback(session) {
  const days = [...new Set((session.ledger || []).map((e) => e.day))];
  return [
    `SUMMARY: [MOCK] You covered ${days.length} topics over ${session.questionCount} questions.`,
    '',
    'Here is some preamble the model was told not to write.',
    ...days.slice(0, 3).map((d, i) =>
      i === 0
        ? `- **NEXT**: [MOCK] Rebuild the Day ${d} project from scratch.`
        : `NEXT: [MOCK] Rebuild the Day ${d} project from scratch.`
    ),
  ].join('\n');
}

export function mockGrade(session) {
  return {
    assessment: {
      score: session.questionCount % 4,
      covered: ['mock: partial answer'],
      missed: ['mock: missing depth'],
    },
  };
}
