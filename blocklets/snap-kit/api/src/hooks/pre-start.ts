import { migrate } from '@arcblock/crawler';
import dotenv from 'dotenv-flow';

import { logger } from '../libs/logger';

if (process.env.NODE_ENV === 'development') {
  dotenv.config();
}

(async () => {
  try {
    logger.info('pre start');
    await migrate();
    process.exit(0);
  } catch (err) {
    logger.error('pre-start error', err);
    process.exit(1);
  }
})();
