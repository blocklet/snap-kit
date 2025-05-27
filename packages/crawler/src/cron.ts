import Cron from '@abtnode/cron';

import { config, logger } from './config';
import { crawlSite } from './site';

let cron = null as any;

export function initCron() {
  if (cron) return;

  cron = Cron.init({
    context: {},
    jobs: [
      {
        name: 'crawl-site',
        time: config.siteCron.time,
        options: { runOnInit: config.siteCron.runOnInit },
        fn: async () => {
          for (const site of config.siteCron.sites) {
            await crawlSite(site);
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
