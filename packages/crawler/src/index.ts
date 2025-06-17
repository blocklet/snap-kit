/* eslint-disable @typescript-eslint/indent */
import merge from 'lodash/merge';

import { Config, config, logger } from './config';
import { initCron } from './cron';
import { ensureBrowser } from './puppeteer';

export * from './crawler';
export * from './site';
export * from './services/snapshot';
export * as utils from './utils';
export { migrate } from './store/migrate';

export async function initCrawler(
  params: Pick<Config, 'puppeteerPath' | 'siteCron' | 'cookies' | 'localStorage' | 'concurrency'>,
) {
  merge(config, params);

  logger.info('Init crawler', { params, config });

  try {
    await ensureBrowser();

    if (config.siteCron?.enabled) {
      await initCron();
    }
  } catch (err) {
    logger.error('Init crawler error', { err });
    throw err;
  }
}
