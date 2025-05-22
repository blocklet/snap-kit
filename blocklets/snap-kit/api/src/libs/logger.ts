import createLogger from '@blocklet/logger';

export const logger = createLogger('snap-kit', { level: process.env.LOG_LEVEL || 'info' });
