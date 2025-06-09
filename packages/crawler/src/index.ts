/* eslint-disable @typescript-eslint/indent */
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

export async function initCrawler(
  params: Pick<Config, 'puppeteerPath' | 'siteCron' | 'cookies' | 'localStorage' | 'siteCron' | 'concurrency'>,
) {
  merge(config, params);

  logger.info('Init crawler', { params, config });

  try {
    await initDatabase();
    await ensureBrowser();
    await createCrawlQueue();

    if (config.siteCron?.enabled) {
      await initCron();
    }
  } catch (err) {
    logger.error('Init crawler error', { err });
    throw err;
  }
}
