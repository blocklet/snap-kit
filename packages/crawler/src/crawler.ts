import createQueue from '@abtnode/queue';
import SequelizeStore from '@abtnode/queue/lib/store/sequelize';
import { randomUUID } from 'crypto';
import fs from 'fs-extra';
import path from 'path';

import { config, logger } from './config';
import { initPage } from './puppeteer';
import { convertJobToSnapshot, formatSnapshot } from './services/snapshot';
import { Job, JobState } from './store/job';
import { Snapshot, SnapshotModel } from './store/snapshot';
import { formatUrl, isAcceptCrawler, md5 } from './utils';

const { BaseState } = require('@abtnode/models');

let crawlQueue;

export function createCrawlQueue() {
  const db = new BaseState(Job);

  crawlQueue = createQueue({
    store: new SequelizeStore(db, 'crawler'),
    concurrency: 1,
    onJob: async (job: JobState) => {
      logger.debug('job start:', job);

      const canCrawl = await isAcceptCrawler(job.url);
      if (!canCrawl) {
        logger.error(`failed to crawl ${job.url}, denied by robots.txt`, job);
        const snapshot = convertJobToSnapshot({
          job,
          snapshot: {
            status: 'failed',
            error: 'Denied by robots.txt',
          },
        });
        await Snapshot.upsert(snapshot);
        return snapshot;
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
        const result = await getPageContent(job);

        if (!result || (!result.html && !result.screenshot)) {
          logger.error(`failed to crawl ${job.url}, empty content`, job);

          const snapshot = convertJobToSnapshot({
            job,
            snapshot: {
              status: 'failed',
              error: 'Failed to crawl content',
            },
          });
          await Snapshot.upsert(snapshot);
          return snapshot;
        }

        // save html and screenshot to data dir
        const { screenshotPath, htmlPath } = await saveSnapshotToLocal({
          screenshot: result.screenshot,
          html: result.html,
        });
        // const lastModified = job.lastmodMap?.get(url) || new Date().toISOString();

        const snapshot = convertJobToSnapshot({
          job,
          snapshot: {
            status: 'success',
            screenshot: screenshotPath?.replace(config.dataDir, ''),
            html: htmlPath?.replace(config.dataDir, ''),
          },
        });
        await Snapshot.upsert(snapshot);
        return snapshot;
      } catch (error) {
        logger.error(`Failed to crawl ${job.url}`, { error, job });
        console.error(error.stack);

        const snapshot = convertJobToSnapshot({
          job,
          snapshot: {
            status: 'failed',
            error: 'Internal error',
          },
        });
        await Snapshot.upsert(snapshot);
        return snapshot;
      }
    },
  });
}

export async function getDataDir() {
  const htmlDir = path.join(config.dataDir, 'data', 'html');
  const screenshotDir = path.join(config.dataDir, 'data', 'screenshot');

  await fs.ensureDir(htmlDir);
  await fs.ensureDir(screenshotDir);

  return { htmlDir, screenshotDir };
}

async function saveSnapshotToLocal({ screenshot, html }: { screenshot?: Uint8Array | null; html?: string | null }) {
  const { htmlDir, screenshotDir } = await getDataDir();

  let screenshotPath: string | null = null;
  let htmlPath: string | null = null;

  if (screenshot) {
    const hash = md5(screenshot);
    screenshotPath = path.join(screenshotDir, `${hash}.webp`);

    logger.debug('saveSnapshotToLocal.screenshot', { screenshotPath });

    await fs.writeFile(screenshotPath, screenshot);
  }
  if (html) {
    const hash = md5(html);
    htmlPath = path.join(htmlDir, `${hash}.html`);

    logger.debug('saveSnapshotToLocal.html', { htmlPath });

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
  includeScreenshot = true,
  includeHtml = true,
  width = 1440,
  height = 900,
  quality = 80,
  timeout = 60 * 1000,
  fullPage = false,
}: {
  url: string;
  includeScreenshot?: boolean;
  includeHtml?: boolean;
  width?: number;
  height?: number;
  quality?: number;
  timeout?: number;
  fullPage?: boolean;
}) => {
  logger.debug('getPageContent', { url, includeScreenshot, includeHtml, width, height, quality, timeout, fullPage });

  const page = await initPage();

  if (width && height) {
    await page.setViewport({ width, height });
  }

  let html: string | null = null;
  let screenshot: Uint8Array | null = null;

  try {
    const response = await page.goto(url, { timeout });

    if (!response) {
      throw new Error(`Failed to load page: response is null for ${url}`);
    }

    const statusCode = response.status();

    logger.debug('getPageContent.response', { response, statusCode });

    if (![200, 304].includes(statusCode)) {
      throw new Error(`Request failed with status ${statusCode}, in ${url}`);
    }

    // await for networkidle0
    // https://pptr.dev/api/puppeteer.page.goforward/#remarks
    await page.waitForNetworkIdle({
      idleTime: 2 * 1000,
    });

    // get screenshot
    if (includeScreenshot) {
      try {
        screenshot = await page.screenshot({ fullPage, quality, type: 'webp' });
      } catch (err) {
        logger.error('Failed to get screenshot:', err);
        throw err;
      }
    }

    // get html
    if (includeHtml) {
      try {
        html = await page.evaluate(() => {
          // add meta tag to record crawler
          const meta = document.createElement('meta');
          meta.name = 'arcblock-crawler';
          meta.content = 'true';
          document.head.appendChild(meta);

          return document.documentElement.outerHTML;
        });
      } catch (err) {
        logger.error('Failed to get html:', err);
        throw err;
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
 * crawl url and return job id
 * @param params
 * @param callback callback when job finished
 */
export async function crawlUrl(params: Omit<JobState, 'jobId'>, callback?: (snapshot: SnapshotModel | null) => void) {
  params = {
    ...params,
    url: formatUrl(params.url),
  };

  // skip duplicate job
  const { job: duplicateJob } =
    (await Job.findJob({
      url: params.url,
      includeScreenshot: params.includeScreenshot,
      includeHtml: params.includeHtml,
      quality: params.quality,
      width: params.width,
      height: params.height,
      fullPage: params.fullPage,
    })) || {};

  if (duplicateJob) {
    logger.warn(`Crawl job already exists for ${params.url}, skip`);
    return duplicateJob.id;
  }

  logger.info('create crawl job', params);

  const jobId = randomUUID();
  const job = crawlQueue.push({ ...params, id: jobId });

  job.on('finished', async ({ result }) => {
    logger.info(`Crawl completed ${params.url}, status: ${result ? 'success' : 'failed'}`, { job: params, result });
    callback?.(result ? await formatSnapshot(result) : null);
  });

  job.on('failed', ({ error }) => {
    logger.error(`Failed to execute job for ${params.url}`, { error, job: params });
    callback?.(null);
  });

  return jobId;
}
