import express from 'express';
import { errorHandler, notFound } from './middleware.js';
import { routes } from './routes.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '10kb' }));
  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  app.use(routes);
  app.use(notFound);
  app.use(errorHandler);
  return app;
}