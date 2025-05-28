import uniq from 'lodash/uniq';
import pMap from 'p-map';
import { SitemapItem } from 'sitemap';

import { Site, config, logger } from './config';
import { crawlUrl } from './crawler';
import { Snapshot } from './store/snapshot';
import { formatUrl, getSitemapList } from './utils';

const crawlBlockletRunningMap = new Map();

function parseSitemapUrl(sitemapItem: SitemapItem) {
  const links = sitemapItem.links?.map((item) => item.url) || [];
  const urls = uniq([...links, sitemapItem.url]).filter(Boolean);
  return urls.map((url) => ({ url, sitemapItem }));
}

export const crawlSite = async ({ url, pathname, interval = 0 }: Site) => {
  logger.info(`Start crawl from sitemap ${url}`, { pathname });

  const sitemapList = await getSitemapList(url);
  const pathnameRegex = new RegExp(pathname);

  const sitemapItems = sitemapList
    .filter((item) => new URL(item.url).pathname.match(pathnameRegex))
    .flatMap((sitemapItem) => {
      return parseSitemapUrl(sitemapItem);
    });

  logger.info(`Found ${sitemapItems.length} sitemap items which match ${pathname} from ${url}`);

  const crawlableItems = (
    await pMap(
      sitemapItems,
      async ({ url, sitemapItem }) => {
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

        return { url, sitemapItem };
      },
      { concurrency: config.siteCron.sitemapConcurrency },
    )
  ).filter(Boolean) as { url: string; sitemapItem: SitemapItem }[];

  logger.info(`Found ${crawlableItems.length} pages to crawl from sitemap ${url}`, { pathname });

  const key = `${url}-${pathname}`;
  crawlBlockletRunningMap.set(key, crawlableItems);

  try {
    const jobIds = await pMap(
      crawlableItems,
      ({ url, sitemapItem }) => {
        return crawlUrl({
          url,
          lastModified: sitemapItem.lastmod,
          includeScreenshot: false,
          includeHtml: true,
        });
      },
      { concurrency: config.siteCron.concurrency },
    );
    return jobIds;
  } catch (error) {
    logger.error(`Failed to crawl from sitemap ${url} ${pathname}`, error);
    throw new Error(error);
  } finally {
    crawlBlockletRunningMap.delete(key);
  }
};
