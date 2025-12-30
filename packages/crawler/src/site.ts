import uniq from 'lodash/uniq';
import { randomUUID } from 'node:crypto';
import { SitemapItem } from 'sitemap';

import { Site, config, logger } from './config';
import { queueMap } from './crawler';
import { jobsEnqueuedTotal } from './metrics';
import { Job, Snapshot } from './store';
import { formatUrl, getSitemapList } from './utils';

const crawlBlockletRunningMap = new Map();

function parseSitemapUrl(sitemapItem: SitemapItem) {
  const links = sitemapItem.links?.map((item) => item.url) || [];
  const urls = uniq([...links, sitemapItem.url]).filter(Boolean);
  return urls.map((url) => ({ url, sitemapItem }));
}

export const crawlSite = async ({ url, pathname, interval = 0 }: Site) => {
  const { default: pMap } = await import('p-map');
  logger.info(`Start crawl from sitemap ${url}`, { pathname });

  const key = `${url}-${pathname}`;

  if (crawlBlockletRunningMap.has(key)) {
    logger.info(`Crawl from sitemap ${url} ${pathname} is already running, skip`);
    return [];
  }

  const sitemapList = await getSitemapList(url);
  const pathnameRegex = new RegExp(pathname);

  const sitemapItems = sitemapList
    .filter((item) => new URL(item.url).pathname.match(pathnameRegex))
    .flatMap((sitemapItem) => {
      return parseSitemapUrl(sitemapItem);
    });

  logger.info(`Found ${sitemapItems.length} sitemap items which match ${pathname} from ${url}`);

  let processCount = 0;
  let crawlCount = 0;
  crawlBlockletRunningMap.set(key, true);

  try {
    const jobIds = await pMap(
      sitemapItems,
      async ({ url, sitemapItem }) => {
        processCount++;

        const snapshot = await Snapshot.findOne({ where: { url: formatUrl(url) } });

        if (snapshot?.lastModified) {
          const lastModified = new Date(snapshot.lastModified);

          // skip if snapshot lastModified is greater than sitemap lastmod
          if (sitemapItem.lastmod && lastModified >= new Date(sitemapItem.lastmod)) {
            return null;
          }

          // skip if interval time has not been reached
          if (Date.now() - lastModified.getTime() < interval * 24 * 60 * 60 * 1000) {
            return null;
          }
        }

        logger.debug(`Sitemap process ${processCount} / ${sitemapItems.length}`, {
          snapshotExists: !!snapshot,
          lastModified: snapshot?.lastModified,
          sitemapLastmod: sitemapItem.lastmod,
          url,
        });

        crawlCount++;

        const jobId = randomUUID();

        queueMap.cronJobs.push({
          job: {
            id: jobId,
            url,
            lastModified: sitemapItem.lastmod,
            includeScreenshot: false,
            includeHtml: true,
            replace: true,
            enqueuedAt: Date.now(),
          },
          jobId,
          delay: 5,
        });
        jobsEnqueuedTotal.inc({ queue: 'cronJobs' });

        return jobId;
      },
      { concurrency: config.siteCron?.concurrency || 30 },
    );

    // Get current queue size for logging
    const queueSize = await Job.count();

    logger.info('Enqueued jobs from sitemap finished', {
      url,
      pathname,
      processCount,
      crawlCount,
      queueSize,
    });

    return jobIds;
  } catch (error) {
    logger.error(`Failed to crawl from sitemap ${url} ${pathname}`, error);
    throw new Error(error);
  } finally {
    crawlBlockletRunningMap.delete(key);
  }
};
