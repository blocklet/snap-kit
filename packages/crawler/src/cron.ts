import Cron from '@abtnode/cron';

import { Config, logger } from './config';
import { crawlSite } from './site';

const CRON_CRAWL_BLOCKLET_KEY = 'cron-crawl-blocklet';

let cronCrawlBlockletJob = null as any;

// init cron crawl blocklet
export function startCron({ sites, time, runOnInit }: Config['cron']) {
  if (cronCrawlBlockletJob) return;
  if (!sites?.length || !time) return;

  logger.info('Init cron to crawl sitemap', { sites, time, runOnInit });

  cronCrawlBlockletJob = Cron.init({
    context: {},
    jobs: [
      {
        name: CRON_CRAWL_BLOCKLET_KEY,
        time,
        options: { runOnInit },
        fn: async () => {
          for (const site of sites) {
            await crawlSite(site);
          }
        },
      },
    ],
    onError: (err: Error) => {
      logger.error('Cron error', err);
    },
  });

  return cronCrawlBlockletJob;
}

export const stopCron = () => {
  if (cronCrawlBlockletJob) {
    cronCrawlBlockletJob.jobs[CRON_CRAWL_BLOCKLET_KEY].stop();
    cronCrawlBlockletJob = null;
    logger.info('Cron crawl blocklet stop, clear crawl queue');
  }
};
