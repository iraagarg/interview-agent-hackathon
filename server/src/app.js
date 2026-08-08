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

  // Malformed JSON is thrown by express.json() before any route runs, so it
  // needs its own handler to come back as our error shape instead of Express's
  // default HTML error page.
  app.use((err, _req, res, next) => {
    if (err instanceof SyntaxError && 'body' in err) {
      return res.status(400).json({
        error: 'Request body is not valid JSON.',
        code: ErrorCodes.INVALID_BODY,
      });
    }
    return next(err);
  });

  app.get('/health', (_req, res) => {
    res.status(200).json({ ok: true, sessions: store.size(), uptime: process.uptime() });
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
