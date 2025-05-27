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

export async function initCrawler(params: DeepPartial<Config>) {
  merge(config, params);

  logger.debug('initCrawler', config);

  await initDatabase();
  await ensureBrowser();
  await createCrawlQueue();
  await initCron();
}
