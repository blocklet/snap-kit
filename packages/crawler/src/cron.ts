import Cron from '@abtnode/cron';

import { config, logger } from './config';
import { crawlSite } from './site';

let cron = null as any;

export function initCron() {
  if (cron) return;

  logger.info('Init cron', { config: config.siteCron });

  cron = Cron.init({
    context: {},
    jobs: [
      {
        name: 'crawl-site',
        time: config.siteCron.time,
        options: { runOnInit: config.siteCron.runOnInit },
        fn: async () => {
          logger.info('Start cron to crawl site', { sites: config.siteCron.sites });
          for (const site of config.siteCron.sites) {
            try {
              await crawlSite(site);
            } catch (err) {
              logger.error('Cron task error', { err, site });
            }
          }
        },
      },
    ],
    onError: (err: Error) => {
      logger.error('Cron error', err);
    },
  });

  return cron;
}
