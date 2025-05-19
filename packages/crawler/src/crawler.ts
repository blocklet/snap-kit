// @ts-ignore
import * as PQueue from 'p-queue';

import { useCache } from './store';
import { closeBrowser, getRelativePath, initPage, isAcceptCrawler, logger, sleep } from './utils';

// eslint-disable-next-line new-cap
const crawlQueue = new PQueue.default({ concurrency: 1, timeout: 60 * 1000 });

const formatHtml = (htmlString: string | null | undefined) => {
  if (typeof htmlString !== 'string') {
    return '';
  }

  // happen js error
  if (htmlString.includes('<h2>Unexpected Application Error!</h2>')) {
    return '';
  }
  return htmlString;
};

export const getPageContent = async ({
  url,
  formatPageContent,
}: {
  url: string;
  headers?: Record<string, string>;
  formatPageContent?: Function;
}) => {
  const page = await initPage();

  let pageContent = null;

  try {
    const response = await page.goto(url, {
      timeout: 60 * 1000, // 60s
    });

    if (!response) {
      throw new Error(`Failed to load page: response is null for ${url}`);
    }

    const statusCode = response.status();

    if (![200, 304].includes(statusCode)) {
      throw new Error(`Request failed with status ${statusCode}, in ${url}`);
    }

    // await for networkidle0
    await page.waitForNetworkIdle({
      idleTime: 1 * 1000, // 1s
    }); // https://pptr.dev/api/puppeteer.page.goforward/#remarks

    if (formatPageContent) {
      // may be null
      pageContent = await formatPageContent({ page, url });
    } else {
      pageContent = await page.content();
    }
  } catch (error: any) {
    logger.error('Get page content error:', error.message || error);
  } finally {
    await page.close();
  }

  return formatHtml(pageContent);
};

function getNextCrawlDate(lastmod: string | null) {
  const now = new Date();
  const lastModTime = lastmod ? new Date(lastmod).getTime() || 0 : 0;
  const daysDiff = Math.max(0, (now.getTime() - lastModTime) / (24 * 60 * 60 * 1000));

  const CRAWL_INTERVALS = new Map([
    [[-1, 0], 1], // 无 lastmod
    [[0, 3], 1], // 3 天内活跃
    [[3, 7], 3], // 7 天内活跃
    [[7, 30], 14], // 30 天内活跃
    [[30, 90], 30], // 90 天内活跃
    [[90, Infinity], 365], // 长期不活跃
  ]);

  const interval =
    Array.from(CRAWL_INTERVALS.entries()).find(([[min, max]]) =>
      lastmod ? daysDiff > min! && daysDiff <= max! : min === -1,
    )?.[1] || 90;

  return new Date(now.getTime() + interval * 24 * 60 * 60 * 1000).toISOString();
}

export const getUrlInfoFromCache = async (url: string) => {
  const cache = await useCache.get(getRelativePath(url));
  return cache;
};

export const setUrlInfoToCache = ({
  url,
  content,
  lastmod,
  nextDate,
}: {
  url: string;
  content: string;
  lastmod?: string;
  nextDate?: string;
}) => {
  if (!content || !url) {
    return;
  }

  const lastmodValue = lastmod || new Date().toISOString();

  return useCache.set(getRelativePath(url), {
    content,
    lastmod: lastmodValue,
    updatedAt: new Date().toISOString(),
    nextDate: nextDate || getNextCrawlDate(lastmodValue),
  });
};

// crawl urls
export const crawlUrl = async ({
  urls,
  lastmodMap,
  formatPageContent,
  autoCloseBrowserCount = 50,
}: {
  urls: string[] | string;
  lastmodMap?: Map<string, string>;
  formatPageContent?: Function;
  autoCloseBrowserCount?: number;
}) => {
  if (typeof urls === 'string') {
    urls = [urls];
  }

  const crawlUrlJob = ({ url, retryCount = 0, index }: { url: string; retryCount?: number; index: number }) => {
    return async () => {
      try {
        // if index reach autoCloseBrowserCount, close browser
        if (index % autoCloseBrowserCount === 0) {
          // not trim cache
          await closeBrowser({
            trimCache: false,
          });
        }

        const canCrawl = await isAcceptCrawler(url);

        if (canCrawl) {
          // get page content later
          const pageContent = await getPageContent({
            url,
            formatPageContent,
          });

          if (pageContent) {
            const lastmodValue = lastmodMap?.get(url) || new Date().toISOString();
            // save to cache
            await setUrlInfoToCache({
              url,
              content: pageContent,
              lastmod: lastmodValue,
              nextDate: getNextCrawlDate(lastmodValue),
            });

            logger.info(`Crawler[${index}] ${url} success`);
          } else if (retryCount < 3) {
            // retry 3 times
            retryCount++;
            const timeout = 1000 * 5 * retryCount;

            logger.info(`Crawler[${index}] ${url} fail, continue after ${timeout}ms`);

            // sleep timeout, to avoid too many requests, and errors at the same time
            await sleep(timeout);

            crawlQueue.add(crawlUrlJob({ url, retryCount, index }), {
              priority: retryCount, // Operations with greater priority will be scheduled first.
            });
          } else {
            logger.info(`Crawler[${index}] ${url} fail reach 3 times, skip it`);
          }
        } else {
          logger.info(`Crawler[${index}] ${url} skip`);
        }

        if (global.gc) {
          global.gc();
        }
      } catch (error: any) {
        logger.info(`Crawler[${index}] ${url} abort by error, skip it: ${error?.message || error?.reason || error}`);
      }
    };
  };

  for (const [index, url] of urls.entries()) {
    // add to queue
    await crawlQueue.add(crawlUrlJob({ url, index: index + 1 }));
  }
};
