import { ensureBrowserDownloaded } from '@arcblock/crawler/src/puppeteer';
import fallback from '@blocklet/sdk/lib/middlewares/fallback';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import dotenv from 'dotenv-flow';
import express, { ErrorRequestHandler } from 'express';
import 'express-async-errors';
import path from 'path';

import logger from './libs/logger';
import routes from './routes';

dotenv.config();

const { name, version } = require('../../package.json');

ensureBrowserDownloaded({
  executablePath: process.env.BLOCKLET_EXECUTABLE_PATH!,
  cacheDir: process.env.BLOCKLET_CACHE_DIR!,
  appDir: process.env.BLOCKLET_APP_DIR! || process.cwd(),
});

export const app = express();

app.set('trust proxy', true);
app.use(cookieParser());
app.use(express.json({ limit: '1 mb' }));
app.use(express.urlencoded({ extended: true, limit: '1 mb' }));
app.use(cors());

const router = express.Router();
router.use('/api', routes);
app.use(router);

const isProduction = process.env.NODE_ENV === 'production' || process.env.ABT_NODE_SERVICE_ENV === 'production';

if (isProduction) {
  const staticDir = path.resolve(process.env.BLOCKLET_APP_DIR!, 'dist');
  app.use(express.static(staticDir, { maxAge: '30d', index: false }));
  app.use(fallback('index.html', { root: staticDir }));

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use<ErrorRequestHandler>((err, _req, res, _next) => {
    logger.error('API Error:', err);

    const statusCode = err.statusCode || (err.name === 'ValidationError' ? 400 : 500);
    const code = err.code || -1;

    res.status(statusCode).json({
      code,
      message: err.message,
    });

    res.status(500).send('Something broke!');
  });
}

const port = parseInt(process.env.BLOCKLET_PORT!, 10);

export const server = app.listen(port, (err?: any) => {
  if (err) throw err;
  logger.info(`> ${name} v${version} ready on ${port}`);
});
