import { config, logger } from './config';
import { createCrawlQueue } from './crawler';
import { ensureDatabase } from './db';
import { ensureBrowser } from './puppeteer';

export * from './blocklet';
export * from './crawler';
export * from './middleware';
export { Snapshot } from './db/snapshot';

export async function initCrawler(_config: Partial<typeof config>) {
  Object.assign(config, _config);

  logger.debug('init crawler', config);

  await ensureDatabase();
  await createCrawlQueue();
  await ensureBrowser();
}
