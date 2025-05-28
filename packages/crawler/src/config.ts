import createLogger from '@blocklet/logger';

export type Site = {
  url: string;
  pathname: string;
  /** Minimum crawl interval to avoid frequent crawling by scheduled tasks, in milliseconds */
  interval?: number;
};

export type Config = {
  isProd: boolean;
  dataDir: string;
  appDir: string;
  appUrl: string;
  cacheDir: string;
  puppeteerPath?: string;
  siteCron: {
    sites: Site[];
    time: string;
    enabled: boolean;
    immediate: boolean;
    crawlConcurrency: number;
    sitemapConcurrency: number;
  };
};

export const logger = createLogger('@arcblock/crawler', { level: process.env.LOG_LEVEL || 'info' });

export const config: Config = {
  isProd: process.env.NODE_ENV === 'production',

  dataDir: process.env.BLOCKLET_DATA_DIR!,
  appDir: process.env.BLOCKLET_APP_DIR! || process.cwd(),
  appUrl: process.env.BLOCKLET_APP_URL!,
  puppeteerPath: process.env.PUPPETEER_EXECUTABLE_PATH!,
  cacheDir: process.env.BLOCKLET_CACHE_DIR!,

  // cron
  siteCron: {
    sites: [],
    enabled: true,
    time: '0 0 */12 * * *',
    immediate: false,
    crawlConcurrency: 1,
    sitemapConcurrency: 30,
  },
};
