import { useCache } from './cache';
import { getFullUrl, isAcceptCrawler, isBotUserAgent, isSelfCrawler } from './utils';

export function initSEOMiddleware({
  autoReturnHtml = true,
  allowCrawler = true,
}: {
  autoReturnHtml?: Boolean;
  allowCrawler?: Boolean | Function;
}) {
  return async (req: any, res: any, next: Function) => {
    const isBot = isBotUserAgent(req);
    const isSelf = isSelfCrawler(req);

    if (!isBot || isSelf) {
      return next();
    }

    const fullUrl = getFullUrl(req);
    const canCrawl = await isAcceptCrawler(fullUrl);
    const allowCrawlerResult = typeof allowCrawler === 'function' ? allowCrawler(req) : allowCrawler;

    // can not crawl, skip
    if (!canCrawl || !allowCrawlerResult) {
      return next();
    }

    const cacheData = await useCache.get(fullUrl);

    // add cached html to req
    req.cachedHtml = cacheData?.content || cacheData || null;
    // add cached lastModified to req, ISO string to GMT string
    req.cachedLastmod = cacheData?.lastModified ? new Date(cacheData?.lastModified).toUTCString() : null;

    if (req.cachedLastmod) {
      res.setHeader('Last-Modified', req.cachedLastmod);
    }

    if (autoReturnHtml && req.cachedHtml) {
      res.send(req.cachedHtml);
      return;
    }
    // missing cache
    next();
  };
}
