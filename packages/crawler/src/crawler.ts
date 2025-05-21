import createQueue from '@abtnode/queue';
import SequelizeStore from '@abtnode/queue/lib/store/sequelize';
import sequelize from '@sequelize/core';
import { randomUUID } from 'crypto';
import fs from 'fs-extra';
import path from 'path';
import { joinURL } from 'ufo';

import { config, logger } from './config';
import { Job, JobState } from './db/job';
import { Snapshot, SnapshotModel } from './db/snapshot';
import { initPage } from './puppeteer';
import { formatUrl, isAcceptCrawler, md5 } from './utils';

const { BaseState } = require('@abtnode/models');

let crawlQueue;

export function createCrawlQueue() {
  const db = new BaseState(Job);

  crawlQueue = createQueue({
    store: new SequelizeStore(db, 'crawler'),
    concurrency: 1,
    onJob: async (job: JobState) => {
      logger.info('start crawling job:', job);

      const { url, includeScreenshot, includeHtml, width, height, quality, timeout } = job;

      const canCrawl = await isAcceptCrawler(url);
      if (!canCrawl) {
        logger.error(`failed to crawl ${url}, denied by robots.txt`, job);

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
        const result = await getPageContent({
          url,
          includeScreenshot,
          includeHtml,
          width,
          height,
          quality,
          timeout,
        });

        if (!result || (!result.html && !result.screenshot)) {
          logger.error(`failed to crawl ${url}, empty content`, job);

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

        // save to redis
        // if (saveToRedis) {
        //   useCache.set(url, {
        //     html: result.html || '',
        //     lastModified,
        //   });

        //   logger.info(`success to crawl ${url}`, job);
        //   return result;
        // }
      } catch (error) {
        logger.error(`Failed to crawl ${url}`, { error, job });
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
    await fs.writeFile(screenshotPath, screenshot);
  }
  if (html) {
    const hash = md5(html);
    htmlPath = path.join(htmlDir, `${hash}.html`);
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
  quality = 80,
  timeout = 60 * 1000,
}: {
  url: string;
  formatPageContent?: Function;
  includeScreenshot?: boolean;
  includeHtml?: boolean;
  width?: number;
  height?: number;
  quality?: number;
  timeout?: number;
}) => {
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
        screenshot = await page.screenshot({ fullPage: true, quality, type: 'webp' });
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

export async function createCrawlJob(params: JobState, callback?: (snapshot: SnapshotModel | null) => void) {
  params = {
    ...params,
    url: formatUrl(params.url),
  };

  // skip duplicate job
  const existsJob = await getJob({
    url: params.url,
    includeScreenshot: params.includeScreenshot,
    includeHtml: params.includeHtml,
    quality: params.quality,
    width: params.width,
    height: params.height,
  });

  logger.info('start create crawl job', { params, existsJob });

  if (existsJob) {
    logger.warn(`Crawl job already exists for ${params.url}, skip`);
    return existsJob.id;
  }

  const id = randomUUID();
  const job = crawlQueue.push({ ...params, id });

  job.on('finished', ({ result }) => {
    logger.info(`Crawl completed ${params.url}, status: ${result ? 'success' : 'failed'}`, { job: params, result });
    callback?.(result);
  });

  job.on('failed', ({ error }) => {
    logger.error(`Failed to execute job for ${params.url}`, { error, job: params });
    callback?.(null);
  });

  return id;
}

// @ts-ignore
export async function getJob(condition: Partial<JobState>) {
  const where = Object.keys(condition)
    .filter((key) => condition[key] !== undefined)
    .map((key) => {
      return sequelize.where(sequelize.fn('json_extract', sequelize.col('job'), `$.${key}`), condition[key]);
    });

  const job = await crawlQueue.store.db.findOne({
    where: {
      [sequelize.Op.and]: where,
    },
  });

  if (job) {
    return job.job;
  }

  return null;
}

function convertJobToSnapshot({ job, snapshot }: { job: JobState; snapshot?: Partial<SnapshotModel> }) {
  return {
    id: job.id,
    url: job.url,
    options: {
      width: job.width,
      height: job.height,
      includeScreenshot: job.includeScreenshot,
      includeHtml: job.includeHtml,
      quality: job.quality,
    },
    ...snapshot,
  } as SnapshotModel;
}

export async function formatSnapshot(snapshot: SnapshotModel) {
  const data = Object.assign({}, snapshot);

  // format screenshot path to full url
  if (data.screenshot) {
    data.screenshot = joinURL(config.appUrl, data.screenshot);
  }
  // format html path to string
  if (data.html) {
    const html = await fs.readFile(path.join(config.dataDir, data.html));
    data.html = html.toString();
  }

  return data;
}

/**
 * get snapshot from db or crawl queue
 */
export async function getSnapshot(id: string) {
  const snapshotModel = await Snapshot.findByPk(id);
  if (snapshotModel) {
    return snapshotModel.toJSON();
  }

  const job = await getJob({ id });
  if (job) {
    return {
      id: job.id,
      status: 'pending',
    } as SnapshotModel;
  }

  return null;
}
