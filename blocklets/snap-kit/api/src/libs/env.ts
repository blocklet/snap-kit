import env from '@blocklet/sdk/lib/env';

// FIXME: Temporarily use process.env.SITE_CRON to get cron tasks cause preferences might not be available
const siteCron = process.env.SITE_CRON ? JSON.parse(process.env.SITE_CRON) : env.preferences.siteCron;

export default {
  isDev: process.env.NODE_ENV === 'development',
  siteCron,
  runCronOnInit: process.env.RUN_CRON_ON_INIT === 'true',
  ...env,
};
