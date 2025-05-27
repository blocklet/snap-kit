import merge from 'lodash/merge';

import { Config, config, logger } from './config';
import { createCrawlQueue } from './crawler';
import { startCron } from './cron';
import { ensureDatabase } from './db';
import { ensureBrowser } from './puppeteer';

export * from './crawler';
export * from './middleware';
export * from './site';
export { Snapshot } from './db/snapshot';

type DeepPartial<T> = T extends object ? { [P in keyof T]?: DeepPartial<T[P]> } : T;

export async function initCrawler(params: DeepPartial<Config>) {
  merge(config, params);

  logger.debug('initCrawler', config);

  await ensureDatabase();
  await createCrawlQueue();
  await ensureBrowser();
  await startCron(config.cron);
}
