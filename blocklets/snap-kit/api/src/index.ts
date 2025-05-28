import { initCrawler } from '@arcblock/crawler';
// import { createSnapshotMiddleware } from '@arcblock/crawler-middleware';
import createLogger from '@blocklet/logger';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import 'express-async-errors';
import path from 'path';

import env from './libs/env';
import { logger } from './libs/logger';
import routes from './routes';

const { name, version } = require('../../package.json');

logger.debug('env', env);

initCrawler({
  siteCron: {
    sites: env.preferences.siteCron || [],
    runOnInit: env.runCronOnInit,
  },
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

// if (process.env.SNAP_KIT_ACCESS_KEY) {
//   app.use(
//     createSnapshotMiddleware({
//       endpoint: process.env.SNAP_KIT_ENDPOINT || env.appUrl,
//       accessKey: process.env.SNAP_KIT_ACCESS_KEY,
//       allowCrawler: (req) => {
//         return req.path === '/';
//       },
//     }),
//   );
// }

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
