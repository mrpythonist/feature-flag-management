import cors from 'cors';
import express from 'express';
import './types';
import { prisma } from './db';
import { initCache } from './lib/cache';
import { adminRouter } from './routes/admin';
import { sdkRouter } from './routes/sdk';

const app = express();
const PORT = Number(process.env.PORT ?? 3001);

app.use(cors());
app.use(express.json({ limit: '256kb' }));

// Dashboard requests arrive from the browser; keep it readable in logs.
app.use((req, _res, next) => {
  if (!req.path.startsWith('/evaluate')) {
    console.log(`${req.method} ${req.path}`);
  }
  next();
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

app.use('/admin', adminRouter);
app.use('/', sdkRouter);

// Unknown routes -> JSON 404 (not the Express HTML default).
app.use((_req, res) => {
  res.status(404).json({ error: 'not found' });
});

// Central error handler: never leak stack traces to clients.
app.use(
  (
    err: unknown,
    _req: express.Request,
    res: express.Response,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _next: express.NextFunction,
  ) => {
    console.error('[api] unhandled error:', err);
    res.status(500).json({ error: 'internal server error' });
  },
);

async function main(): Promise<void> {
  await initCache();
  // Fail fast on boot if the database is unreachable — the API is useless
  // without it, and a crash loop is louder than silent 500s.
  await prisma.$connect();
  console.log('[api] connected to PostgreSQL');
  app.listen(PORT, () => {
    console.log(`[api] listening on :${PORT}`);
  });
}

main().catch((err) => {
  console.error('[api] failed to start:', err);
  process.exit(1);
});
