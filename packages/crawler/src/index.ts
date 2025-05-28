import merge from 'lodash/merge';

import { Config, config, logger } from './config';
import { createCrawlQueue } from './crawler';
import { initCron } from './cron';
import { ensureBrowser } from './puppeteer';
import { initDatabase } from './store';

export * from './crawler';
export * from './site';
export * from './services/snapshot';
export * as utils from './utils';

type DeepPartial<T> = T extends object ? { [P in keyof T]?: DeepPartial<T[P]> } : T;

export async function initCrawler(params: DeepPartial<Pick<Config, 'puppeteerPath' | 'siteCron'>>) {
  logger.info('Init crawler', { params });

  merge(config, params);

  try {
    await initDatabase();
    await ensureBrowser();
    await createCrawlQueue();
    await initCron();
  } catch (err) {
    logger.error('Init crawler error', { err });
    throw err;
  }
}
