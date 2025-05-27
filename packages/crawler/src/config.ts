import createLogger from '@blocklet/logger';

export type Site = {
  url: string;
  pathname: string;
  interval?: number;
};

export type Config = {
  isProd: boolean;
  redisUrl?: string;
  dataDir: string;
  appDir: string;
  appUrl: string;
  cacheDir: string;
  puppeteerPath?: string;
  siteCron: {
    sites: Site[];
    time: string;
    runOnInit: boolean;
  };
};

export const logger = createLogger('crawler', { level: process.env.LOG_LEVEL || 'info' });

export const config: Config = {
  isProd: process.env.NODE_ENV === 'production',

  redisUrl: process.env.REDIS_URL!,
  dataDir: process.env.BLOCKLET_DATA_DIR!,
  appDir: process.env.BLOCKLET_APP_DIR! || process.cwd(),
  appUrl: process.env.BLOCKLET_APP_URL!,
  puppeteerPath: process.env.PUPPETEER_EXECUTABLE_PATH!,
  cacheDir: process.env.BLOCKLET_CACHE_DIR!,

  // cron
  siteCron: {
    sites: [],
    time: '0 0 */12 * * *',
    runOnInit: false,
  },
};
