import createQueue from '@abtnode/queue';
import { env } from '@blocklet/sdk/lib/config';
import { format } from 'date-fns';
import fs from 'fs-extra';
import path from 'path';

import { closeBrowser, initPage } from './puppeteer';
import { useCache } from './store';
import { getRelativePath, isAcceptCrawler, logger } from './utils';

// 创建按日期分类的目录
async function createDateDirectory() {
  const today = new Date();
  const dateStr = format(today, 'yyyy-MM-dd');
  const dataDir = path.join(env.dataDir, process.env.DATA_DIR || '');
  const dateDir = path.join(dataDir, dateStr);

  await fs.ensureDir(dateDir);

  return { dateDir, dateStr };
}

// 清理过期文件
export const cleanFiles = async () => {
  try {
    const dataDir = path.join(env.dataDir, process.env.DATA_DIR || '');
    if (!fs.existsSync(dataDir)) {
      return;
    }

    const retentionDays = Number(process.env.RETENTION_DAYS || 180);
    const now = new Date();
    const retentionMs = retentionDays * 24 * 60 * 60 * 1000;
    const cutoffDate = new Date(now.getTime() - retentionMs);

    logger.info(`Cleaning up files older than ${retentionDays} days (before ${format(cutoffDate, 'yyyy-MM-dd')})`);

    // 读取数据目录中的所有子目录（按日期分类）
    const dateDirs = await fs.readdir(dataDir);

    for (const dateDir of dateDirs) {
      try {
        // 检查目录名是否为日期格式（yyyy-MM-dd）
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateDir)) {
          const dirDate = new Date(dateDir);

          // 如果目录日期早于截止日期，则删除该目录
          if (dirDate < cutoffDate) {
            const dirPath = path.join(dataDir, dateDir);
            logger.info(`Removing old directory: ${dirPath}`);
            await fs.remove(dirPath);
          }
        }
      } catch (error) {
        logger.error(`Error processing directory ${dateDir}:`, error);
      }
    }

    logger.info('File cleanup completed');
  } catch (error) {
    logger.error('Error during file cleanup:', error);
  }
};

// 创建持久化队列
export const crawlQueue = createQueue({
  file: path.join(env.dataDir, 'crawler-queue.db'),
  concurrency: Number(process.env.QUEUE_CONCURRENCY || 1),
  onJob: async (job) => {
    logger.info('start crawling job:', job);

    const { url, retryCount = 0, index, autoCloseBrowserCount } = job;

    const canCrawl = await isAcceptCrawler(url);

    if (!canCrawl) {
      return null;
    }

    // if index reach autoCloseBrowserCount, close browser
    try {
      if (index >= autoCloseBrowserCount) {
        await closeBrowser({
          trimCache: false,
        });
      }
    } catch (error) {
      logger.error('failed to close browser when queue index reached autoCloseBrowserCount:', error);
    }

    try {
      // get page content later
      const result = await getPageContent({
        url,
        formatPageContent: job.formatPageContent,
        screenshot: job.screenshot || false,
        viewport: job.viewport,
      });

      if (result && (result.html || result.screenshot)) {
        const lastModifiedValue = job.lastmodMap?.get(url) || new Date().toISOString();
        // save to cache
        await setUrlInfoToCache({
          url,
          content: result,
          lastmod: lastModifiedValue,
        });

        logger.info(`Crawler[${index}] ${url} success${result.screenshot ? ' with screenshot' : ''}`);
        return result;
      }

      if (retryCount < 3) {
        // 返回错误，让队列重试
        throw new Error(`Crawler[${index}] ${url} fail, will retry`);
      } else {
        logger.info(`Crawler[${index}] ${url} fail reach 3 times, skip it`);
        return null;
      }
    } catch (error: any) {
      logger.info(`Crawler[${index}] ${url} abort by error: ${error?.message || error?.reason || error}`);
      throw error; // 重新抛出错误，让队列处理重试逻辑
    }
  },
});

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
  screenshot = false,
  viewport = { width: 1440, height: 900 },
}: {
  url: string;
  headers?: Record<string, string>;
  formatPageContent?: Function;
  screenshot?: boolean;
  viewport?: { width: number; height: number };
}) => {
  const page = await initPage();

  // 设置视窗大小
  if (viewport && (viewport.width !== 1440 || viewport.height !== 900)) {
    await page.setViewport(viewport);
  }

  let pageContent: string | null = null;
  let screenshotPath: string | null = null;

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

    // 如果需要截图
    if (screenshot) {
      try {
        // 创建按日期分类的目录
        const { dateDir } = await createDateDirectory();

        // 生成文件名（使用URL的哈希值作为文件名）
        const urlHash = Buffer.from(url).toString('base64').replace(/[/+=]/g, '_').substring(0, 40);
        const filename = `${urlHash}.png`;

        // 保存截图
        screenshotPath = path.join(dateDir, filename);
        await page.screenshot({ path: screenshotPath, fullPage: true });

        logger.info(`Screenshot saved to ${screenshotPath}`);
      } catch (screenshotError) {
        logger.error('Screenshot error:', screenshotError);
      }
    }

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

  return {
    html: formatHtml(pageContent),
    screenshot: screenshotPath,
  };
};

// 删除 getNextCrawlDate 函数，因为它不再被使用

export const getUrlInfoFromCache = async (url: string) => {
  const cache = await useCache.get(getRelativePath(url));
  return cache;
};

export const setUrlInfoToCache = ({
  url,
  content,
  screenshot,
  lastmod,
}: {
  url: string;
  content: string | { html: string; screenshot: string | null };
  screenshot?: string;
  lastmod?: string;
}) => {
  if (!content || !url) {
    return;
  }

  const lastModifiedValue = lastmod || new Date().toISOString();
  const html = typeof content === 'string' ? content : content.html;
  const screenshotPath = typeof content === 'string' ? screenshot : content.screenshot;

  return useCache.set(getRelativePath(url), {
    html,
    screenshot: screenshotPath,
    lastModified: lastModifiedValue,
    updatedAt: new Date().toISOString(),
  });
};

// crawl urls
export function crawlUrl({
  urls,
  lastmodMap,
  formatPageContent,
  screenshot = true,
  html = true,
  viewport,
  autoCloseBrowserCount = 50,
}: {
  urls: string[] | string;
  lastmodMap?: Map<string, string>;
  formatPageContent?: Function;
  screenshot?: boolean;
  html?: boolean;
  viewport?: { width: number; height: number };
  autoCloseBrowserCount?: number;
}) {
  if (typeof urls === 'string') {
    urls = [urls];
  }

  for (const [index, url] of urls.entries()) {
    const task = crawlQueue.push({
      url,
      index: index + 1,
      html,
      lastmodMap,
      formatPageContent,
      screenshot,
      viewport,
      autoCloseBrowserCount,
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
