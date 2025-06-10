import createLogger from '@blocklet/logger';
import { CookieParam } from '@blocklet/puppeteer';

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
  concurrency: number;
  siteCron?: {
    sites: Site[];
    time: string;
    enabled: boolean;
    immediate: boolean;
    concurrency: number;
  };
  cookies?: CookieParam[];
  localStorage?: { key: string; value: string }[];
};

export const logger = createLogger('@arcblock/crawler', { level: process.env.LOG_LEVEL || 'info' });

export const config: Config = {
  isProd: process.env.NODE_ENV === 'production',

  dataDir: process.env.BLOCKLET_DATA_DIR!,
  cacheDir: process.env.BLOCKLET_CACHE_DIR! || process.cwd(),
  appDir: process.env.BLOCKLET_APP_DIR! || process.cwd(),
  appUrl: process.env.BLOCKLET_APP_URL! || '/',
  puppeteerPath: process.env.PUPPETEER_EXECUTABLE_PATH!,

  concurrency: 2,
};
