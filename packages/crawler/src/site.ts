import uniq from 'lodash/uniq';
import { SitemapItem } from 'sitemap';
import { joinURL } from 'ufo';

import { Site, logger } from './config';
import { crawlUrl } from './crawler';
import { Snapshot } from './db/snapshot';
import { formatUrl, getSitemapList } from './utils';

const crawlBlockletRunningMap = new Map();

function parseSitemapUrl(sitemapItem: SitemapItem) {
  const links = sitemapItem.links?.map((item) => item.url) || [];
  const urls = uniq([...links, sitemapItem.url]).filter(Boolean);
  return urls.map((url) => ({ url, sitemapItem }));
}

// function calculateNextCrawlDate(lastmod: string) {
//   const now = new Date();
//   const lastmodDate = new Date(lastmod);
//   const daysDiff = (now.getTime() - lastmodDate.getTime()) / (24 * 60 * 60 * 1000);

//   const CRAWL_INTERVALS = new Map<[number, number], number>([
//     [[0, 3], 1], // 3 天内活跃
//     [[3, 7], 3], // 7 天内活跃
//     [[7, 30], 14], // 30 天内活跃
//     [[30, 90], 30], // 90 天内活跃
//     [[90, Infinity], 365], // 长期不活跃
//   ]);

//   let interval = 30;

//   CRAWL_INTERVALS.forEach((value, [min, max]) => {
//     if (daysDiff > min && daysDiff <= max) {
//       interval = value;
//     }
//   });

//   return new Date(now.getTime() + interval * 24 * 60 * 60 * 1000).toISOString();
// }

export const crawlSite = async ({ url, pathname, interval = 0 }: Site) => {
  const fullUrl = joinURL(url, pathname);

  logger.info(`Start crawl from sitemap ${url} ${pathname}`);

  const sitemapList = await getSitemapList(url);

  logger.info(`Found ${sitemapList.length} sitemap items from ${url} ${pathname}`);

  const sitemapItems = sitemapList
    .filter((item) => pathname === '/' || item.url.indexOf(fullUrl) > -1)
    .flatMap((sitemapItem) => {
      return parseSitemapUrl(sitemapItem);
    });

  const crawlableItems = (
    await Promise.all(
      sitemapItems.map(async ({ url, sitemapItem }) => {
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
      }),
    )
  ).filter(Boolean) as { url: string; sitemapItem: SitemapItem }[];

  logger.info(`Found ${crawlableItems.length} pages to crawl from sitemap ${url} ${pathname}`);

  crawlBlockletRunningMap.set(fullUrl, crawlableItems);

  try {
    const jobIds = await Promise.all(
      crawlableItems.map(({ url, sitemapItem }) => {
        return crawlUrl({
          url,
          lastModified: sitemapItem.lastmod,
          includeScreenshot: true,
          includeHtml: true,
        });
      }),
    );
    return jobIds;
  } catch (error) {
    logger.error(`Failed to crawl from sitemap ${url} ${pathname}`, error);
    throw new Error(error);
  } finally {
    crawlBlockletRunningMap.delete(fullUrl);
  }
};
