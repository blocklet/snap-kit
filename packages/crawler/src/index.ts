/* eslint-disable @typescript-eslint/indent */
import merge from 'lodash/merge';

import { Config, config, logger } from './config';
import { initQueue } from './crawler';
import { initCron } from './cron';
import { ensureBrowser } from './puppeteer';
import { migrate } from './store/migrate';

export * from './crawler';
export * from './services/snapshot';
export * from './store/job';
export * as utils from './utils';

export async function initCrawler(
  params: Pick<Config, 'puppeteerPath' | 'siteCron' | 'cookies' | 'localStorage' | 'concurrency'>,
) {
  merge(config, params);

  logger.info('Init crawler', { params, config });

  try {
    await migrate();
    await initQueue();
    await ensureBrowser();

    if (config.siteCron?.enabled) {
      await initCron();
    }
  } catch (err) {
    logger.error('Init crawler error', { err });
    throw err;
  }
}
