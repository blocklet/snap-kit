import { utils } from '@arcblock/crawler';
import { NextFunction, Request, Response } from 'express';
import { joinURL } from 'ufo';

import { CacheManager } from './cache';
import { env, logger } from './env';

const { isSelfCrawler, isSpider, isStaticFile } = utils;

function getFullUrl(req: Request) {
  const blockletPathname = req.headers['x-path-prefix']
    ? joinURL(req.headers['x-path-prefix'] as string, req.originalUrl)
    : req.originalUrl;

  return joinURL(
    env.appUrl || req.get('host')!,
    blockletPathname == null || blockletPathname === 'undefined' ? '/' : blockletPathname,
  );
}

export function createSnapshotMiddleware({
  endpoint,
  accessKey,
  cacheMax = 500,
  updateInterval = 1000 * 60 * 60 * 24,
  failedUpdateInterval = 1000 * 60 * 60 * 24,
  updatedConcurrency = 10,
  autoReturnHtml = true,
  allowCrawler = () => true,
}: {
  /** SnapKit endpoint */
  endpoint: string;
  /** SnapKit access key */
  accessKey: string;
  /** Max cache size for LRU cache */
  cacheMax?: number;
  /** When cache exceeds this time, it will try to fetch and update cache from SnapKit */
  updateInterval?: number;
  /** When failed cache exceeds this time, it will try to fetch and update cache from SnapKit */
  failedUpdateInterval?: number;
  /** Update queue concurrency */
  updatedConcurrency?: number;
  /** Call res.send(html) when cache hit */
  autoReturnHtml?: boolean;
  /** Custom function to determine whether to return cached content */
  allowCrawler?: (req: Request) => boolean;
}) {
  if (!accessKey || !endpoint) {
    throw new Error('accessKey and endpoint are required');
  }

  const cacheManager = new CacheManager({
    endpoint,
    accessKey,
    cacheMax,
    updateInterval,
    failedUpdateInterval,
    updatedConcurrency,
  });

  return async (req: Request, res: Response, next: NextFunction) => {
    await cacheManager.waitReady();

    if (!allowCrawler(req)) {
      return next();
    }

    const fullUrl = getFullUrl(req);

    if (!isSpider(req) || isSelfCrawler(req) || isStaticFile(req)) {
      return next();
    }

    // fetch content from SnapKit and cache it
    // Don't await here, the cache will be effective after the next request
    if (await cacheManager.isCacheExpired(fullUrl)) {
      cacheManager.enqueueUpdateSnapshot(fullUrl);
    }

    // cache hit
    const cachedSnapshot = await cacheManager.getSnapshot(fullUrl);
    if (cachedSnapshot?.html) {
      logger.info(`Cache hit: ${fullUrl}`);

      // @ts-ignore
      req.cachedHtml = cachedSnapshot.html;

      if (cachedSnapshot.lastModified) {
        // @ts-ignore
        req.cachedLastmod = new Date(cachedSnapshot.lastModified).toUTCString();
        res.setHeader('Last-Modified', cachedSnapshot.lastModified);
      }

      if (autoReturnHtml) {
        logger.debug(`Cache hit: ${fullUrl} `, {
          lastModified: cachedSnapshot.lastModified,
          createdAt: cachedSnapshot.createdAt,
        });
        res.send(cachedSnapshot.html);
        return;
      }

      return next();
    }

    logger.info(`Cache miss: ${fullUrl}`);
    return next();
  };
}
