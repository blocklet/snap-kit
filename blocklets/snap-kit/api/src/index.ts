import { initCrawler } from '@arcblock/crawler';
import createLogger from '@blocklet/logger';
import { env } from '@blocklet/sdk/lib/config';
// import fallback from '@blocklet/sdk/lib/middlewares/fallback';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import 'express-async-errors';
import path from 'path';

import { logger } from './libs/logger';
import routes from './routes';

const { name, version } = require('../../package.json');

initCrawler({
  redisUrl: process.env.REDIS_URL,
});

export const app = express();
createLogger.setupAccessLogger(app);

app.set('trust proxy', true);
app.use(cookieParser());
app.use(express.json({ limit: '1 mb' }));
app.use(express.urlencoded({ extended: true, limit: '1 mb' }));
app.use(cors());

const router = express.Router();

router.use('/api', routes);

app.use(router);
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

export const server = app.listen(port, (err?: any) => {
  if (err) throw err;
  logger.info(`> ${name} v${version} ready on ${port}`);
});
