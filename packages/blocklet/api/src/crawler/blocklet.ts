import Cron from '@abtnode/cron';
import debounce from 'lodash/debounce';
import { joinURL } from 'ufo';

import { crawlUrl } from './crawler';
import { useCache } from './store';
import {
  closeBrowser,
  components,
  env,
  getBrowser,
  getComponentInfo,
  getRelativePath,
  getSitemapList,
  logger,
} from './utils';

// record crawl blocklet running
const crawlBlockletRunningMap = new Map();

// crawl blocklet sitemap urls
export const crawlBlocklet = async () => {
  // @ts-ignore
  const { mountPoint, did } = getComponentInfo();

  if (crawlBlockletRunningMap.has(did) && crawlBlockletRunningMap.get(did)) {
    logger.info(`Crawler blocklet ${did} is running, skip it`);
    return;
  }

  // check has browser can use
  try {
    const browser = await getBrowser();
    if (!browser) {
      throw new Error('No Browser can use');
    }
    logger.info('Crawler blocklet existing can use browser');
  } catch (error: any) {
    logger.info(`Crawler blocklet abort by error: ${error?.message || error?.reason || error}`);
    return;
  }

  const { appUrl } = env;

  if (!appUrl) {
    throw new Error('appUrl not found');
  }

  const sitemapList = await getSitemapList(appUrl);

  const matchMountPoint = joinURL(appUrl, !mountPoint || mountPoint === '/' ? '' : mountPoint);
  const otherMountPointList = components
    .filter((item) => item.mountPoint && item.mountPoint !== mountPoint)
    .map((item) => item.mountPoint);

  // get can use loc
  const blockletLocList = sitemapList.filter((item: any) => {
    if (mountPoint !== '/') {
      return item?.url?.indexOf(matchMountPoint) > -1;
    }
    // if mountPoint is /, skip other mountPoint
    return otherMountPointList.every((mountPoint) => item?.url?.indexOf(mountPoint) === -1);
  }) as [];

  const canUseBlockletLocList = [] as string[];
  const lastmodMap = new Map();
  let skipBlockletLocTotal = 0;
  let blockletLocTotal = 0;

  await Promise.all(
    blockletLocList.map(async (item: any) => {
      let tempLocList = [];

      if (item.url) {
        tempLocList.push(item.url);
      }

      if (item?.links?.length > 0) {
        tempLocList.push(...item.links.map((ytem: any) => ytem.url));
      }

      blockletLocTotal += tempLocList.length;

      tempLocList = (
        await Promise.all(
          tempLocList.map(async (loc) => {
            try {
              const { lastmod: cacheLastmod, nextDate } = await useCache.get(getRelativePath(loc));

              // sitemap item lastmod is same as cache lastmod, skip it
              if (item.lastmod && new Date(cacheLastmod).getTime() === new Date(item.lastmod).getTime()) {
                skipBlockletLocTotal++;
                return false;
              }

              // cache lastmod add cron time  is later than Date.now, skip it
              if (nextDate && new Date(nextDate).getTime() >= new Date().getTime()) {
                skipBlockletLocTotal++;
                return false;
              }

              return loc;
            } catch (error) {
              // ignore error
            }

            // if can not get cache, return loc
            return loc;
          }),
        )
      ).filter(Boolean);

      tempLocList.forEach((loc) => {
        if (item.lastmod) lastmodMap.set(loc, item.lastmod);
      });

      canUseBlockletLocList.push(...tempLocList);
    }),
  );

  const crawlerLogText = (step = '') => [
    `Crawler sitemap.xml about ${did} ${step}: `,
    {
      blockletLocTotal,
      canUseBlockletLocTotal: canUseBlockletLocList.length,
      skipBlockletLocTotal,
      lastmodMapTotal: lastmodMap.size,
    },
  ];

  logger.info(...crawlerLogText('start'));

  try {
    // record crawl blocklet running
    crawlBlockletRunningMap.set(did, true);

    await crawlUrl({
      // @ts-ignore
      urls: canUseBlockletLocList,
      lastmodMap,
      formatPageContent: async ({ page }: { page: any; url: string; lastmod?: string }) => {
        const pageContent = await page.evaluate(() => {
          const removeElements = (tagName: string) => {
            const elements = document.querySelectorAll(tagName);
            for (let i = elements.length - 1; i >= 0; i--) {
              try {
                elements[i]?.parentNode?.removeChild(elements[i] as Node);
              } catch (error) {
                // do noting
              }
            }
          };

          // remove script, style, link, noscript
          // removeElements('script');
          // removeElements('style');
          // removeElements('link');
          // removeElements('noscript');

          // remove uploader
          removeElements('[id="uploader-container"]');
          removeElements('[class^="uppy-"]');

          // remove point up component
          removeElements('[id="point-up-component"]');

          // add meta tag to record crawler
          const meta = document.createElement('meta');
          meta.name = 'blocklet-crawler';
          meta.content = 'true';
          document.head.appendChild(meta);

          return document.documentElement.outerHTML;
        });

        return pageContent;
      },
    });

    logger.info(...crawlerLogText('success'));

    await closeBrowser({
      trimCache: true,
    });
  } catch (error) {
    logger.info('Crawler blocklet abort by error', error);
  } finally {
    // delete crawl blocklet running
    crawlBlockletRunningMap.delete(did);
  }
};

const CRON_CRAWL_BLOCKLET_KEY = 'cron-crawl-blocklet';
let cronCrawlBlockletJob = null as any;

// init cron crawl blocklet
export const initCronCrawlBlocklet = (
  {
    time = '0 0 */12 * * *', // every 12 hours
    options,
  } = {} as { time: string; options: any },
) => {
  if (!cronCrawlBlockletJob) {
    cronCrawlBlockletJob = Cron.init({
      context: {},
      jobs: [
        {
          name: CRON_CRAWL_BLOCKLET_KEY,
          time,
          fn: debounce(crawlBlocklet),
          options: { runOnInit: false, ...options },
        },
      ],
      onError: (err: Error) => {
        console.error('run job failed', err);
      },
    });
  }

  return cronCrawlBlockletJob;
};

export const cancelCronCrawlBlocklet = () => {
  if (cronCrawlBlockletJob) {
    cronCrawlBlockletJob.jobs[CRON_CRAWL_BLOCKLET_KEY].stop();
    cronCrawlBlockletJob = null;
    logger.info('Cron crawl blocklet stop, clear crawl queue');
  }
};
