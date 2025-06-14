import { env } from '@blocklet/sdk/lib/config';

export default {
  isDev: process.env.NODE_ENV === 'development',
  ...env,
};
