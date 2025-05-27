import createLogger from '@blocklet/logger';
import config from '@blocklet/sdk/lib/config';
import path from 'node:path';

export const env = {
  databasePath: path.join(config.env.dataDir, 'crawler-middleware/snapshot.db'),
};

export const logger = createLogger('@arcblock/crawler-middleware', { level: process.env.LOG_LEVEL || 'info' });
