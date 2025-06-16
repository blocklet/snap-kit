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
import { findMaxScrollHeight, formatUrl, isAcceptCrawler, md5, sleep } from './utils';

const { BaseState } = require('@abtnode/models');

let crawlQueue;

export function createCrawlQueue() {
  const db = new BaseState(Job);

  crawlQueue = createQueue({
    store: new SequelizeStore(db, 'crawler'),
    concurrency: config.concurrency,
    onJob: async (job: JobState) => {
      logger.info('Starting to execute crawl job', job);

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

      const formattedJob: JobState = {
        ...job,
        cookies: (config.cookies || []).concat(job.cookies || []),
        localStorage: (config.localStorage || []).concat(job.localStorage || []),
        url: formatUrl(job.url),
      };

      try {
        // get page content later
        const result = await getPageContent(formattedJob);

        if (!result || (!result.html && !result.screenshot)) {
          logger.error(`failed to crawl ${formattedJob.url}, empty content`, formattedJob);

          const snapshot = convertJobToSnapshot({
            job: formattedJob,
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
          job: formattedJob,
          snapshot: {
            status: 'success',
            screenshot: screenshotPath?.replace(config.dataDir, ''),
            html: htmlPath?.replace(config.dataDir, ''),
            meta: result.meta,
          },
        });
        await Snapshot.upsert(snapshot);
        return snapshot;
      } catch (error) {
        logger.error(`Failed to crawl ${formattedJob.url}`, { error, formattedJob });

        const snapshot = convertJobToSnapshot({
          job: formattedJob,
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

export const getPageContent = async ({
  url,
  includeScreenshot = true,
  includeHtml = true,
  width = 1440,
  height = 900,
  quality = 80,
  timeout = 90 * 1000,
  waitTime = 0,
  fullPage = false,
  headers,
  cookies,
  localStorage,
}: JobState) => {
  const page = await initPage();

  if (width && height) {
    await page.setViewport({ width, height, deviceScaleFactor: 2 });
  }

  if (headers) {
    await page.setExtraHTTPHeaders(headers);
  }

  // handle cookies
  if (cookies) {
    const { hostname } = new URL(url);
    const cookieParams = cookies.map((item) => ({
      ...item,
      expires: item.expires ? new Date(item.expires).getTime() : undefined,
      domain: item.domain || hostname,
      path: item.path || '/',
    }));
    await page.setCookie(...cookieParams);
  }

  // handle localStorage
  if (localStorage) {
    await page.evaluateOnNewDocument((items) => {
      items.forEach((item) => {
        const value = item.value === 'now()' ? new Date().toISOString() : item.value;
        window.localStorage.setItem(item.key, value);
      });
    }, localStorage);
  }

  let html: string | null = null;
  let screenshot: Uint8Array | null = null;
  const meta: { title?: string; description?: string } = {};

  try {
    const response = await page.goto(url, { timeout });

    if (!response) {
      throw new Error(`Failed to load page: response is null for ${url}`);
    }

    const statusCode = response.status();

    if (![200, 304].includes(statusCode)) {
      throw new Error(`Request failed with status ${statusCode}, in ${url}`);
    }

    // await for networkidle0
    // https://pptr.dev/api/puppeteer.page.waitfornetworkidle
    try {
      await Promise.all([
        page.waitForNetworkIdle({
          idleTime: 1.5 * 1000,
          timeout,
        }),
        sleep(waitTime),
      ]);
    } catch (err) {
      logger.warn(`Failed to wait for network idle in ${url}:`, err);
    }

    // get screenshot
    if (includeScreenshot) {
      // Try to find the tallest element and set the browser to the same height
      if (fullPage) {
        const maxScrollHeight = await findMaxScrollHeight(page);

        logger.debug('findMaxScrollHeight', { maxScrollHeight });

        if (maxScrollHeight) {
          await page.setViewport({ width, height: maxScrollHeight || height, deviceScaleFactor: 2 });
          await page.evaluate((scrollHeight) => {
            window.scrollTo(0, scrollHeight || 0);
            document.documentElement.scrollTo(0, scrollHeight || 0);
          }, maxScrollHeight);
        }
      }

      try {
        screenshot = await page.screenshot({ fullPage, quality, type: 'webp' });
      } catch (err) {
        logger.error('Failed to get screenshot:', err);
        throw err;
      }
    }

    // get html
    try {
      const data = await page.evaluate(() => {
        // add meta tag to record crawler
        const meta = document.createElement('meta');
        meta.name = 'arcblock-crawler';
        meta.content = 'true';
        document.head.appendChild(meta);

        // get title and meta description
        const title = document.title || '';
        const description = document.querySelector('meta[name="description"]')?.getAttribute('content') || '';

        return {
          html: document.documentElement.outerHTML,
          title,
          description,
        };
      });

      // check if the page is an error page
      const isErrorPage = ['<h2>Unexpected Application Error!</h2>', 'Current route occurred an error'].some(
        (errorHtml) => data.html.includes(errorHtml),
      );
      if (isErrorPage) {
        throw new Error('Page is an error page');
      }

      meta.title = data.title;
      meta.description = data.description;

      if (includeHtml) {
        html = data.html;
      }
    } catch (err) {
      logger.error('Failed to get html:', err);
      throw err;
    }
  } catch (error) {
    logger.error('Failed to get page content:', error);
    throw error;
  } finally {
    await page.close();
  }

  return {
    html,
    screenshot,
    meta,
  };
};

/**
 * crawl url and return job id
 * @param params
 * @param callback callback when job finished
 */
// eslint-disable-next-line require-await
export async function crawlUrl(params: Omit<JobState, 'jobId'>, callback?: (snapshot: SnapshotModel | null) => void) {
  // skip duplicate job
  const existsJob = await Job.isExists(params);
  if (existsJob) {
    logger.info(`Crawl job already exists for ${params.url}, skip`);
    return existsJob.id;
  }

  logger.info('enqueue crawl job', params);

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
