import createLogger from '@blocklet/logger';

export const logger = createLogger('crawler', { level: process.env.LOG_LEVEL || 'info' });

export const config = {
  redisUrl: process.env.REDIS_URL!,
  dataDir: process.env.BLOCKLET_DATA_DIR!,
  appDir: process.env.BLOCKLET_APP_DIR! || process.cwd(),
  appUrl: process.env.BLOCKLET_APP_URL!,
  puppeteerPath: process.env.PUPPETEER_EXECUTABLE_PATH!,
  cacheDir: process.env.BLOCKLET_CACHE_DIR!,
  testOnInitialize: process.env.NODE_ENV === 'production',
};
