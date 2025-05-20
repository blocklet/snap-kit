import { createPool } from 'generic-pool';
import { createClient } from 'redis';

import { logger } from './config';

const cacheKeyPrefix = process.env?.BLOCKLET_REAL_DID ? `${process.env.BLOCKLET_REAL_DID}:` : '';
const MAX_REDIS_RETRY = 3;
const ttl = 1000 * 60 * 60 * 24 * 7;

export const cachePool = createPool(
  {
    create: async () => {
      try {
        const redisUrl = process.env.REDIS_URL;

        const redisClient = createClient({
          url: redisUrl as string,
          socket: {
            // @ts-ignore
            reconnectStrategy: (retries) => {
              if (retries >= MAX_REDIS_RETRY) {
                return new Error('Retry Time Exhausted');
              }
              return Math.min(retries * 500, 1000 * 3);
            },
          },
        });

        redisClient.on('error', (err) => logger.warn('Redis Client Error:', err));
        await redisClient.connect();
        logger.info(`Successfully connected to Redis: ${redisUrl}`);

        return redisClient;
      } catch (error) {
        logger.warn('Redis connection failed', error);
        return null;
      }
    },
    destroy: async (client: any) => {
      // if is redis client
      if (client.isReady) {
        await client.quit();
      }
    },
  },
  {
    max: 2, // 2 clients
    min: 0,
    // evictionRunIntervalMillis: 0,
  },
);

export const withCache = async (cb: Function) => {
  const client = await cachePool.acquire();

  if (client) {
    try {
      return cb(client);
    } finally {
      // release client to pool, let other use
      await cachePool.release(client);
    }
  }
};

export const formatKey = (key: string) => {
  return `${cacheKeyPrefix}${key}`;
};

export const useCache = {
  get: (key: string) => {
    return withCache(async (client: any) => {
      const value = await client.get(formatKey(key));
      try {
        return JSON.parse(value);
      } catch (error) {
        // ignore error
      }
      return value;
    });
  },
  set: (key: string, value: any, options?: any) => {
    return withCache((client: any) => {
      const formatValue = typeof value === 'string' ? value : JSON.stringify(value);
      return client.set(formatKey(key), formatValue, { PX: ttl, ...options });
    });
  },
  remove: (key: string) => {
    return withCache((client: any) => {
      return client.del(formatKey(key));
    });
  },
  list: (key: string = '*') => {
    return withCache((client: any) => {
      return client.keys(formatKey(key));
    });
  },
};
