import { initCrawler } from '@arcblock/crawler';
import createLogger from '@blocklet/logger';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import dotenv from 'dotenv-flow';
import express from 'express';
import 'express-async-errors';
import path from 'path';

import env from './libs/env';
import { logger } from './libs/logger';
import routes from './routes';
import adminRoutes from './routes/admin';
import metricsRoutes from './routes/metrics';

const { name, version } = require('../../package.json');

dotenv.config();

export const app = express();
createLogger.setupAccessLogger(app);

app.set('trust proxy', true);
app.use(cookieParser());
app.use(express.json({ limit: '1 mb' }));
app.use(express.urlencoded({ extended: true, limit: '1 mb' }));
app.use(cors());

app.use('/api/admin', adminRoutes);
app.use('/api/metrics', metricsRoutes);
app.use('/api', routes);

app.use('/data', express.static(path.join(env.dataDir, 'data'), { maxAge: '365d', index: false }));

// const isProduction = process.env.NODE_ENV === 'production' || process.env.ABT_NODE_SERVICE_ENV === 'production';
// if (isProduction) {
//   const staticDir = path.resolve(process.env.BLOCKLET_APP_DIR!, 'dist');
//   app.use(express.static(staticDir, { maxAge: '30d', index: false }));
//   app.use(fallback('index.html', { root: staticDir }));
// }

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err, _req, res, _next) => {
  logger.error('API Error:', err);

  const statusCode = err.statusCode || (err.name === 'ValidationError' ? 400 : 500);
  const code = err.code || -1;

  res.status(statusCode).json({
    code,
    message: err.message,
  });
});

const port = parseInt(process.env.BLOCKLET_PORT!, 10);

export const server = app.listen(port, async (err?: any) => {
  if (err) throw err;

  logger.info(`> ${name} v${version} ready on ${port}`);

  try {
    await initCrawler({
      concurrency: Math.max(1, env.preferences.crawlConcurrency || 0),
      siteCron: {
        enabled: !!env.preferences.cronEnabled,
        immediate: !!env.preferences.cronImmediate,
        sites: env.preferences.cronSites,
        time: env.preferences.cronTime,
        concurrency: Math.max(1, env.preferences.sitemapConcurrency || 0),
      },
      cookies: env.preferences.cookies,
      localStorage: env.preferences.localStorage,
    });
    logger.info('Crawler ready');
  } catch (err) {
    logger.error('Crawler init error', err);
    process.exit(1);
  }
});
