import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { interviewRouter } from './routes/interview.js';
import { ApiError, ErrorCodes } from './lib/errors.js';
import * as store from './lib/sessions.js';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');

  app.use(
    cors({
      origin: config.corsOrigins.includes('*') ? true : config.corsOrigins,
    })
  );

  app.use(express.json({ limit: '1mb' }));

  // express.json() throws before any route runs, so its failures need their own
  // handler to come back as our error shape instead of Express's default HTML
  // error page — or, for an oversized body, an unhandled 500.
  app.use((err, _req, res, next) => {
    if (err?.type === 'entity.too.large') {
      return res.status(413).json({
        error: 'Request body is too large. The limit is 1MB.',
        code: ErrorCodes.PAYLOAD_TOO_LARGE,
      });
    }
    if (err instanceof SyntaxError && 'body' in err) {
      return res.status(400).json({
        error: 'Request body is not valid JSON.',
        code: ErrorCodes.INVALID_BODY,
      });
    }
    return next(err);
  });

  // The contract only requires POST /api/interview, but the base URL is what a
  // human pastes into a browser first. Answering with a 404 there makes a
  // working deployment look broken, so describe the API instead.
  app.get('/', (_req, res) => {
    res.status(200).json({
      service: 'AI Interview Agent',
      status: 'ok',
      description:
        'Conducts a multi-turn technical interview based on a candidate\'s progress through a 31-day AI cohort.',
      endpoints: {
        interview: 'POST /api/interview',
        health: 'GET /health',
      },
      usage: {
        start: { sessionId: 'abc-123', candidate: '{ ...candidate object }' },
        turn: { sessionId: 'abc-123', message: 'the candidate answer' },
        final: {
          reply: '...',
          done: true,
          feedback: { summary: 'string', strengths: [], gaps: [], next: [] },
        },
      },
      repository: 'https://github.com/iraagarg/interview-agent-hackathon',
    });
  });

  app.get('/health', (_req, res) => {
    res.status(200).json({
      ok: true,
      commit: config.commit,
      branch: config.branch,
      model: config.groqModel,
      fallbackModel: config.groqFallbackModel || null,
      sessions: store.size(),
      uptime: process.uptime(),
    });
  });

  app.use('/api', interviewRouter);

  app.use((req, res) => {
    res.status(404).json({
      error: `No route for ${req.method} ${req.path}.`,
      code: 'NOT_FOUND',
    });
  });

  // Express 5 forwards rejected promises from async handlers here automatically.
  app.use((err, _req, res, _next) => {
    if (err instanceof ApiError) {
      return res.status(err.status).json({ error: err.message, code: err.code });
    }
    console.error('[unhandled]', err);
    return res.status(500).json({
      error: 'Internal server error.',
      code: ErrorCodes.INTERNAL,
    });
  });

  return app;
}
