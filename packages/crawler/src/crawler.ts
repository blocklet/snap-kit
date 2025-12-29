/* eslint-disable import/no-mutable-exports */
import createQueue from '@abtnode/queue';
import SequelizeStore from '@abtnode/queue/lib/store/sequelize';
import { Page } from '@blocklet/puppeteer';
import { randomUUID } from 'crypto';
import fs from 'fs-extra';
import path from 'path';

import { config, logger } from './config';
import { jobDurationSeconds, jobTotalLatencySeconds, jobsEnqueuedTotal, jobsTotal } from './metrics';
import { initPage } from './puppeteer';
import { createCarbonImage } from './services/carbon';
import { convertJobToSnapshot, deleteSnapshots, formatSnapshot } from './services/snapshot';
import { Job, JobState, Snapshot, SnapshotModel, sequelize } from './store';
import { findMaxScrollHeight, formatUrl, isAcceptCrawler, md5, sleep } from './utils';

const { BaseState } = require('@abtnode/models');

export const queueMap = {
  urlCrawler: null as any,
  syncCrawler: null as any,
  codeCrawler: null as any,
  cronJobs: null as any,
};

export function initQueue() {
  queueMap.urlCrawler = createCrawlQueue('urlCrawler');
  queueMap.syncCrawler = createCrawlQueue('syncCrawler');
  queueMap.codeCrawler = createCrawlQueue('codeCrawler', {
    handleScreenshot: createCarbonImage,
  });
  queueMap.cronJobs = createCrawlQueue('cronJobs');
}

type PageHandler = {
  handleScreenshot?: (page: Page, params?: JobState) => Promise<Buffer | null>;
  handleHtml?: (page: Page, params?: JobState) => Promise<string | null>;
};

export function createCrawlQueue(queue: string, handler?: PageHandler) {
  const db = new BaseState(Job);

  return createQueue({
    store: new SequelizeStore(db, queue),
    options: {
      concurrency: config.concurrency,
      enableScheduledJob: true,
    },
    onJob: async (job: JobState) => {
      const startTime = Date.now();
      let status: 'success' | 'failed' = 'failed';

      const formattedJob = {
        ...job,
        cookies: (config.cookies || []).concat(job.cookies || []),
        localStorage: (config.localStorage || []).concat(job.localStorage || []),
        url: formatUrl(job.url),
      };

      try {
        logger.info(`Starting to execute ${queue} job`, { ...job, queueSize: await Job.count() });

        // check robots.txt
        if (!job.ignoreRobots) {
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
        }

        // get page content later
        const result = await getPageContent(formattedJob, handler);

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

        const snapshot = await sequelize.transaction(async (txn) => {
          // delete old snapshot
          if (formattedJob.replace) {
            const deletedJobIds = await deleteSnapshots(
              {
                url: formattedJob.url,
                replace: true,
              },
              { txn },
            ).catch((error) => {
              logger.error('Failed to delete old snapshot', { error, formattedJob });
            });

            logger.info('Deleted old snapshot', { deletedJobIds });
          }

          // save html and screenshot to data dir
          const { screenshotPath, htmlPath } = await saveSnapshotToLocal({
            screenshot: result.screenshot,
            html: result.html,
            format: formattedJob.format,
          });

          const snapshot = convertJobToSnapshot({
            job: formattedJob,
            snapshot: {
              status: 'success',
              screenshot: screenshotPath?.replace(config.dataDir, ''),
              html: htmlPath?.replace(config.dataDir, ''),
              meta: result.meta,
            },
          });
          await Snapshot.upsert(snapshot, { transaction: txn });

          return snapshot;
        });

        status = 'success';
        return snapshot;
      } catch (error) {
        logger.error(`Failed to crawl ${formattedJob.url}`, { error, formattedJob });

        status = 'failed';

        const snapshot = convertJobToSnapshot({
          job: formattedJob,
          snapshot: {
            status: 'failed',
            error: 'Internal error',
          },
        });
        await Snapshot.upsert(snapshot);
        return snapshot;
      } finally {
        const now = Date.now();
        jobsTotal.inc({ queue, status });
        jobDurationSeconds.observe({ queue, status }, (now - startTime) / 1000);
        if (job.enqueuedAt) {
          jobTotalLatencySeconds.observe({ queue, status }, (now - job.enqueuedAt) / 1000);
        }
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

async function saveSnapshotToLocal({
  screenshot,
  html,
  format = 'webp',
}: {
  screenshot?: Uint8Array | null;
  html?: string | null;
  format?: 'png' | 'jpeg' | 'webp';
}) {
  const { htmlDir, screenshotDir } = await getDataDir();

  let screenshotPath: string | null = null;
  let htmlPath: string | null = null;

  if (screenshot) {
    const hash = md5(screenshot);
    screenshotPath = path.join(screenshotDir, `${hash}.${format}`);

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

export const getPageContent = async (
  {
    url,
    includeScreenshot = true,
    includeHtml = true,
    width = 1440,
    height = 900,
    quality = 80,
    format = 'webp',
    timeout = 60 * 1000,
    waitTime = 0,
    fullPage = false,
    headers,
    cookies,
    localStorage,
  }: JobState,
  handler?: PageHandler,
) => {
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
        screenshot = handler?.handleScreenshot
          ? await handler.handleScreenshot(page)
          : await page.screenshot({ fullPage, quality, type: format });
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

        // remove document all <noscript> tags
        document.querySelectorAll('noscript')?.forEach((el: HTMLElement) => {
          if (el?.remove) {
            el.remove();
          }
        });

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
        throw new Error(`${url} is an error page`);
      }

      meta.title = data.title;
      meta.description = data.description;

      if (includeHtml) {
        html = handler?.handleHtml ? await handler.handleHtml(page) : data.html;
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
export async function enqueue(
  queueName: keyof typeof queueMap,
  params: Omit<JobState, 'jobId'>,
  callback?: (snapshot: SnapshotModel | null) => void,
) {
  const queue = queueMap[queueName];
  if (!queue) {
    throw new Error(`Queue ${queueName} not found`);
  }

  // skip duplicate job
  const existsJob = await Job.isExists(params);
  if (existsJob && !params.sync) {
    logger.info(`Crawl job already exists for ${params.url}, skip`);
    return existsJob.id;
  }

  const jobId = randomUUID();
  const enqueuedAt = Date.now();
  const job = queue.push({ job: { ...params, id: jobId, enqueuedAt }, jobId });
  jobsEnqueuedTotal.inc({ queue: queueName });

  // Get current queue size for logging
  const queueSize = await Job.count();
  logger.info('enqueue crawl job', { ...params, jobId, queueSize });

  job.on('finished', async ({ result }) => {
    try {
      const isSuccess = result?.status === 'success';
      const queueSize = await Job.count();

      logger.info(`Crawl completed ${params.url}, status: ${isSuccess ? 'success' : 'failed'}`, {
        job: params,
        result,
        queueSize,
      });

      callback?.(result ? await formatSnapshot(result) : null);
    } catch (error) {
      logger.error(`Error in finished event handler for ${params.url}`, { error });
      callback?.(null);
    }
  });

  job.on('failed', async ({ error }) => {
    try {
      const queueSize = await Job.count();
      logger.error(`Failed to execute job for ${params.url}`, { error, job: params, queueSize });
    } catch (err) {
      logger.error(`Error in failed event handler for ${params.url}`, { error: err });
    } finally {
      callback?.(null);
    }
  });

  return jobId;
}

export function crawlUrl(params: Omit<JobState, 'jobId'>, callback?: (snapshot: SnapshotModel | null) => void) {
  return enqueue(params.sync ? 'syncCrawler' : 'urlCrawler', params, callback);
}

export function crawlCode(params: Omit<JobState, 'jobId'>, callback?: (snapshot: SnapshotModel | null) => void) {
  return enqueue(
    'codeCrawler',
    { ignoreRobots: true, includeHtml: false, includeScreenshot: true, ...params },
    callback,
  );
}
