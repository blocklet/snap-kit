import env from '@blocklet/sdk/lib/env';

export default {
  isDev: process.env.NODE_ENV === 'development',
  runCronOnInit: process.env.RUN_CRON_ON_INIT === 'true',
  ...env,
};
