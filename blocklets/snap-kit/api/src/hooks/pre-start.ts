import dotenv from 'dotenv-flow';

import { logger } from '../libs/logger';

if (process.env.NODE_ENV === 'development') {
  dotenv.config();
}

(() => {
  try {
    logger.info('pre start');
    process.exit(0);
  } catch (err) {
    logger.error('pre-start error', err);
    process.exit(1);
  }
})();
