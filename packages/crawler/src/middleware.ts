import { NextFunction, Request, Response } from 'express';
import { LRUCache } from 'lru-cache';
import { joinURL } from 'ufo';

import { logger } from './config';
import { axios, getFullUrl, isAcceptCrawler, isSelfCrawler, isSpider, isStaticFile } from './utils';

export type Cache = LRUCache<string, { html: string; lastModified: number; createdAt: string }>;

export function createSnapKit({
  endpoint,
  accessKey,
  cacheMax = 500,
  cacheUpdateInterval = 1000 * 60 * 60 * 24,
  autoReturnHtml = true,
  allowCrawler = () => true,
}: {
  /** SnapKit endpoint */
  endpoint: string;
  /** SnapKit access key */
  accessKey: string;
  /** Max cache size for LRU cache */
  cacheMax?: number;
  /**
   * Cache update interval
   * When cache exceeds this time, it will try to fetch and update cache from SnapKit
   */
  cacheUpdateInterval?: number;
  /** Call res.send(html) when cache hit */
  autoReturnHtml?: boolean;
  /** Custom function to determine whether to return cached content */
  allowCrawler?: (req: Request) => boolean;
}) {
  const cache: Cache = new LRUCache({
    max: cacheMax,
  });

  /**
   * fetch content from SnapKit and cache it
   */
  async function fetchSnapKit(url: string) {
    const api = joinURL(endpoint, 'api/crawl');

    try {
      const { data } = await axios.get(api, {
        params: {
          url,
        },
        headers: {
          Authorization: accessKey,
        },
      });

      const { data: snapshot } = data || {};

      if (snapshot?.status !== 'success') {
        logger.info(`No valid HTML found for ${url} from SnapKit`, { snapshot, data });
        return;
      }

      cache.set(url, {
        html: snapshot.html,
        lastModified: snapshot.lastModified,
        createdAt: new Date().toISOString(),
      });
      logger.info('Success to fetch content by SnapKit and cache it', {
        url,
        jobId: snapshot.jobId,
        lastModified: snapshot.lastModified,
      });

      return snapshot;
    } catch (error) {
      logger.error('Failed to fetch content by SnapKit', { url, error });
    }
  }

  function isCacheExpired(url: string) {
    const cachedContent = cache.get(url);
    if (!cachedContent) {
      return true;
    }
    return Date.now() - new Date(cachedContent.createdAt).getTime() > cacheUpdateInterval;
  }

  return async (req: Request, res: Response, next: NextFunction) => {
    if (!accessKey || !endpoint) {
      throw new Error('accessKey and endpoint are required');
    }

    if (!allowCrawler(req)) {
      return next();
    }

    const fullUrl = getFullUrl(req);

    // Always fetch content from SnapKit and cache it, even for non-crawler requests
    if (isCacheExpired(fullUrl)) {
      logger.info(`Cache expired for ${fullUrl}, fetching from SnapKit`);
      fetchSnapKit(fullUrl);
    }

    if (!isSpider(req) || isSelfCrawler(req) || isStaticFile(req)) {
      return next();
    }

    const canCrawl = await isAcceptCrawler(fullUrl);

    if (!canCrawl) {
      logger.debug(`${fullUrl} is not accepted by crawler`);
      return next();
    }

    // cache hit
    const cachedContent = cache.get(fullUrl);
    if (cachedContent) {
      // @ts-ignore
      req.cachedHtml = cachedContent.html;

      if (cachedContent.lastModified) {
        // @ts-ignore
        req.cachedLastmod = new Date(cachedContent.lastModified).toUTCString();
        res.setHeader('Last-Modified', cachedContent.lastModified);
      }

      if (autoReturnHtml) {
        logger.debug(`Cache hit: ${fullUrl} `, {
          lastModified: cachedContent.lastModified,
          createdAt: cachedContent.createdAt,
        });
        res.send(cachedContent.html);
        return;
      }

      return next();
    }

    logger.debug(`Cache not hit: ${fullUrl}`);
    return next();
  };
}
