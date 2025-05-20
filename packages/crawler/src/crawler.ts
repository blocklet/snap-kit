import createQueue from '@abtnode/queue';
import { randomUUID } from 'crypto';
import { format } from 'date-fns';
import fs from 'fs-extra';
import path from 'path';

import { useCache } from './cache';
import { config, logger } from './config';
import { Snapshot } from './db/snapshot';
import { initPage } from './puppeteer';
import { isAcceptCrawler } from './utils';

let crawlQueue;

export function createCrawlQueue() {
  crawlQueue = createQueue({
    file: path.join(config.dataDir, 'crawler-queue.db'),
    concurrency: 1,
    onJob: async (job) => {
      logger.info('start crawling job:', job);

      const { id, url, includeScreenshot, includeHtml, width, height, saveToRedis } = job;

      const canCrawl = await isAcceptCrawler(url);
      if (!canCrawl) {
        await Snapshot.upsert({
          id,
          url,
          status: 'failed',
          error: 'The robots.txt does not allow crawling',
          options: {
            width,
            height,
            includeScreenshot,
            includeHtml,
          },
        });
        logger.error(`failed to crawl ${url}, the robots.txt does not allow crawling`, job);
        return null;
      }

      // if index reach autoCloseBrowserCount, close browser
      // try {
      //   if (index >= autoCloseBrowserCount) {
      //     await closeBrowser({ trimCache: false });
      //   }
      // } catch (error) {
      //   logger.error('failed to close browser when queue index reached autoCloseBrowserCount:', error);
      // }

      try {
        // get page content later
        const result = await getPageContent({
          url,
          includeScreenshot,
          includeHtml,
          width,
          height,
        });

        if (result && (result.html || result.screenshot)) {
          // save html and screenshot to data dir
          const { screenshotPath, htmlPath } = await saveSnapshotToLocal({
            id,
            screenshot: result.screenshot,
            html: result.html,
          });

          const lastModified = job.lastmodMap?.get(url) || new Date().toISOString();
          const shortScreenshotPath = screenshotPath?.replace(config.dataDir, '');
          const shortHTMLPath = htmlPath?.replace(config.dataDir, '');

          // save to db
          await Snapshot.upsert({
            id,
            url,
            status: 'success',
            html: shortHTMLPath,
            screenshot: shortScreenshotPath,
            lastModified,
            options: {
              width,
              height,
              includeScreenshot,
              includeHtml,
            },
          });

          // save to redis
          if (saveToRedis) {
            useCache.set(url, {
              html: result.html || '',
              lastModified,
            });
          }

          logger.info(`success to crawl ${url}`, job);
          return result;
        }
      } catch (error) {
        logger.error(`failed to crawl ${url}`, { error, job });

        await Snapshot.upsert({
          id,
          url,
          status: 'failed',
          error: error?.message || JSON.stringify(error),
          options: {
            width,
            height,
            includeScreenshot,
            includeHtml,
          },
        });

        return null;
      }
    },
  });
}

async function ensureDataDir() {
  const today = new Date();
  const dateStr = format(today, 'yyyy-MM-dd');
  const dir = path.join(config.dataDir, 'data', dateStr);

  await fs.ensureDir(dir);

  return dir;
}

async function saveSnapshotToLocal({
  id,
  screenshot,
  html,
}: {
  id: string;
  screenshot?: Uint8Array | null;
  html?: string | null;
}) {
  const dataDir = await ensureDataDir();

  let screenshotPath: string | null = null;
  let htmlPath: string | null = null;

  if (screenshot) {
    screenshotPath = path.join(dataDir, `${id}.png`);
    await fs.writeFile(screenshotPath, screenshot);
  }
  if (html) {
    htmlPath = path.join(dataDir, `${id}.html`);
    await fs.writeFile(htmlPath, html);
  }

  return {
    screenshotPath,
    htmlPath,
  };
}

function formatHtml(htmlString: string) {
  if (htmlString.includes('<h2>Unexpected Application Error!</h2>')) {
    return '';
  }
  return htmlString;
}

export const getPageContent = async ({
  url,
  formatPageContent,
  includeScreenshot = true,
  includeHtml = true,
  width = 1440,
  height = 900,
}: {
  url: string;
  formatPageContent?: Function;
  includeScreenshot?: boolean;
  includeHtml?: boolean;
  width?: number;
  height?: number;
}) => {
  const page = await initPage();

  if (width && height) {
    await page.setViewport({ width, height });
  }

  let html: string | null = null;
  let screenshot: Uint8Array | null = null;

  try {
    const response = await page.goto(url, {
      timeout: 60 * 1000,
    });

    if (!response) {
      throw new Error(`Failed to load page: response is null for ${url}`);
    }

    const statusCode = response.status();

    if (![200, 304].includes(statusCode)) {
      throw new Error(`Request failed with status ${statusCode}, in ${url}`);
    }

    // await for networkidle0
    // https://pptr.dev/api/puppeteer.page.goforward/#remarks
    await page.waitForNetworkIdle({
      idleTime: 1 * 1000,
    });

    // get screenshot
    if (includeScreenshot) {
      try {
        screenshot = await page.screenshot();
      } catch (err) {
        logger.error('Failed to get screenshot:', err);
      }
    }

    // get html
    if (includeHtml) {
      if (formatPageContent) {
        html = await formatPageContent({ page, url });
      } else {
        html = await page.content();
      }
    }
  } catch (error) {
    logger.error('Failed to get page content:', error);
    throw error;
  } finally {
    await page.close();
  }

  html = formatHtml(html || '');

  return {
    html,
    screenshot,
  };
};

/**
 * create crawl job
 */
export function createCrawlJob({
  url,
  lastmodMap,
  // formatPageContent,
  saveToRedis = false,
  screenshot = true,
  html = true,
  width = 1440,
  height = 900,
}: {
  url: string[] | string;
  lastmodMap?: Map<string, string>;
  // formatPageContent?: Function;
  saveToRedis?: boolean;
  screenshot?: boolean;
  html?: boolean;
  width?: number;
  height?: number;
}) {
  const urls = ([] as string[]).concat(url);

  for (const url of urls) {
    const task = crawlQueue.push({
      id: randomUUID(),
      url,
      html,
      lastmodMap,
      // formatPageContent,
      screenshot,
      width,
      height,
      saveToRedis,
    });

    task.on('finished', ({ result }) => {
      if (result) {
        logger.info(`Task for ${url} completed successfully`);
      }
    });

    task.on('failed', ({ error }) => {
      logger.error(`Task for ${url} failed: ${error.message}`, error);
    });
  }
}

/**
 * get snapshot from db or crawl queue
 */
export async function getSnapshot(url: string) {
  const snapshot = await Snapshot.findOne({ where: { url }, order: [['updatedAt', 'DESC']] });
  if (snapshot) {
    return snapshot;
  }

  const job = await new Promise<any>((resolve, reject) => {
    crawlQueue.store.db.findOne({ url }, (err, job) => {
      if (err) {
        reject(err);
      } else {
        resolve(job);
      }
    });
  });

  if (job) {
    return {
      id: job.id,
      status: 'pending',
    } as Snapshot;
  }

  return null;
}
