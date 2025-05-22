import createLogger from '@blocklet/logger';

export { createLogger };
export const logger = createLogger('snap-kit', { level: process.env.LOG_LEVEL || 'info' });
