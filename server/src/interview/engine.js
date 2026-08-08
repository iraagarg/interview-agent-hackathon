/**
 * Interview engine — STUB.
 *
 * This is the boundary the HTTP layer talks to. Both functions currently return
 * placeholder text so the server is runnable end-to-end during scaffolding.
 *
 * Real implementation lands in step 4:
 *   - buildPlan()  : score curriculum days from the candidate's missions
 *   - startInterview() : build plan, generate greeting + question 1
 *   - handleTurn() : grade the answer, then follow up or advance topic,
 *                    and emit the final feedback object once complete
 *
 * Contract note: both functions return the exact response body the route
 * sends. The route does not reshape them.
 */

export async function startInterview(session) {
  const name = session.candidate?.member?.name || 'there';

  const reply =
    `Hi ${name}, thanks for making time. [SCAFFOLD STUB — the interview ` +
    `engine is not implemented yet; this endpoint currently echoes a ` +
    `placeholder so the request/response contract can be exercised.]`;

  session.questionCount = 1;
  session.transcript.push({ role: 'interviewer', content: reply, at: Date.now() });

  return { reply, done: false };
}

export async function handleTurn(session, message) {
  session.transcript.push({ role: 'candidate', content: message, at: Date.now() });
  session.questionCount += 1;

  return {
    reply:
      `[SCAFFOLD STUB] Received your answer (${message.length} chars). ` +
      `Question ${session.questionCount} would go here.`,
    done: false,
  };
}
