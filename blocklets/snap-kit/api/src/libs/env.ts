import env from '@blocklet/sdk/lib/env';

export default {
  isDev: process.env.NODE_ENV === 'development',
  ...env,
};
