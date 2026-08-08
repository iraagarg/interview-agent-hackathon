import { Router } from 'express';
import * as store from '../lib/sessions.js';
import { badRequest, notFound, ErrorCodes } from '../lib/errors.js';
import { startInterview, handleTurn } from '../interview/engine.js';

export const interviewRouter = Router();

const isPlainObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * A request is a START if it carries a candidate, otherwise a TURN.
 * Per the contract the two forms are distinguished by payload, not by a flag.
 */
function validate(body) {
  if (!isPlainObject(body)) {
    throw badRequest(ErrorCodes.INVALID_BODY, 'Request body must be a JSON object.');
  }

  const { sessionId, candidate, message } = body;

  if (typeof sessionId !== 'string' || sessionId.trim() === '') {
    throw badRequest(
      ErrorCodes.MISSING_SESSION_ID,
      'sessionId is required and must be a non-empty string.'
    );
  }

  // An explicit null is treated as "no candidate", not as a malformed one. A
  // client that builds every request as { sessionId, candidate: x ?? null,
  // message } is doing something reasonable, and rejecting its turns over a
  // null placeholder would be hostile. Genuinely malformed candidates — a
  // string, an array, one missing member or missions — are still rejected.
  if (candidate !== undefined && candidate !== null) {
    if (!isPlainObject(candidate)) {
      throw badRequest(ErrorCodes.INVALID_CANDIDATE, 'candidate must be an object.');
    }
    if (!isPlainObject(candidate.member)) {
      throw badRequest(
        ErrorCodes.INVALID_CANDIDATE,
        'candidate.member is required and must be an object.'
      );
    }
    if (!Array.isArray(candidate.missions)) {
      throw badRequest(
        ErrorCodes.INVALID_CANDIDATE,
        'candidate.missions is required and must be an array.'
      );
    }
    return { kind: 'start', sessionId: sessionId.trim(), candidate };
  }

  if (typeof message !== 'string' || message.trim() === '') {
    throw badRequest(
      ErrorCodes.MISSING_MESSAGE,
      'message is required on a conversation turn and must be a non-empty string.'
    );
  }

  return { kind: 'turn', sessionId: sessionId.trim(), message: message.trim() };
}

async function startSession({ sessionId, candidate }) {
  // Re-posting the candidate for a live session replays rather than resetting,
  // so a double-submit from the UI cannot wipe an interview in progress.
  const existing = store.get(sessionId);
  if (existing) {
    const replay = existing.done ? existing.finalPayload : existing.openingPayload;
    if (replay) return replay;
  }

  const session = store.create(sessionId, candidate);
  const payload = await startInterview(session);
  session.openingPayload = payload;
  return payload;
}

async function continueSession({ sessionId, message }) {
  const session = store.get(sessionId);
  if (!session) {
    throw notFound(
      ErrorCodes.UNKNOWN_SESSION,
      `No interview session found for sessionId "${sessionId}". Start one by posting a candidate object.`
    );
  }

  // Completed interviews replay their final payload idempotently rather than
  // erroring on a late or duplicated turn.
  if (session.done && session.finalPayload) return session.finalPayload;

  return handleTurn(session, message);
}

interviewRouter.post('/interview', async (req, res) => {
  const parsed = validate(req.body);

  // Everything that reads session state, awaits the LLM, then writes back runs
  // under the session's lock. Validation stays outside it so a malformed
  // request is rejected immediately instead of queueing behind a live turn.
  const payload = await store.runExclusive(parsed.sessionId, () =>
    parsed.kind === 'start' ? startSession(parsed) : continueSession(parsed)
  );

  return res.status(200).json(payload);
});
