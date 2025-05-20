import puppeteer, { Browser, Page } from '@blocklet/puppeteer';
import fs from 'fs-extra';
import path from 'path';
import { clearInterval, setInterval } from 'timers';

import { useCache } from './store';
import { CRAWLER_FLAG, logger, sleep } from './utils';

let puppeteerConfig: {
  cacheDirectory: string;
  temporaryDirectory: string;
};

const BROWSER_WS_ENDPOINT_KEY = `browserWSEndpoint-${process.env.BLOCKLET_DID || 'unknown'}`;

const BrowserStatus = {
  Launching: 'Launching',
  Ready: 'Ready',
};

let browser: Browser | null;
let browserActivatedTimer: NodeJS.Timeout | null;

export { puppeteer };

export async function ensurePuppeteerrc({ cacheDir, appDir }: { cacheDir: string; appDir: string }) {
  const cacheDirectory = path.join(cacheDir, 'puppeteer', 'cache');
  const temporaryDirectory = path.join(cacheDir, 'puppeteer', 'tmp');
  const puppeteerrcPath = path.join(appDir, '.puppeteerrc.js');

  // ensure directory exists
  await Promise.all([fs.ensureDir(cacheDirectory), fs.ensureDir(temporaryDirectory), fs.ensureFile(puppeteerrcPath)]);

  puppeteerConfig = {
    cacheDirectory,
    temporaryDirectory,
  };

  const fileContent = `module.exports = ${JSON.stringify(puppeteerConfig, null, 2)}`;
  await fs.writeFile(puppeteerrcPath, fileContent);

  return puppeteerConfig;
}

export async function ensureBrowserDownloaded({
  executablePath,
  cacheDir,
  appDir,
}: {
  executablePath: string;
  cacheDir: string;
  appDir: string;
}) {
  // check system chromium
  if (fs.existsSync(executablePath)) {
    logger.info(`System Chromium found and tested successfully: ${executablePath}`);
  }

  logger.warn('System Chromium exists but test failed, will try to download');

  // system chromium is not available, execute original download logic
  await ensurePuppeteerrc({ cacheDir, appDir });
  // @ts-ignore
  const { downloadBrowser } = await (() => {
    // @ts-ignore
    // eslint-disable-next-line import/extensions
    return import('@blocklet/puppeteer/internal/node/install.js');
  })();

  await downloadBrowser();

  logger.info('Browser download completed successfully');
}

export async function connectBrowser() {
  const browserWSEndpoint = await useCache.get(BROWSER_WS_ENDPOINT_KEY);

  if (!browserWSEndpoint) {
    return null;
  }

  // retry if browser is launching
  if (browserWSEndpoint.status === BrowserStatus.Launching) {
    await sleep(Math.floor(Math.random() * 1000 * 1));
    return connectBrowser();
  }

  browser = await puppeteer.connect({
    browserWSEndpoint: browserWSEndpoint.endpoint,
  });
  logger.info('Connect browser success');

  return browser;
}

export async function launchBrowser() {
  await useCache.set(BROWSER_WS_ENDPOINT_KEY, {
    endpoint: null,
    status: BrowserStatus.Launching,
  });

  try {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        // docs: https://peter.sh/experiments/chromium-command-line-switches/
        '--no-first-run',
        '--hide-scrollbars',
        '--no-sandbox',
        '--no-zygote',
        '--disable-setuid-sandbox',
        '--disable-gpu',
        '--disable-dev-shm-usage',
        '--disable-site-isolation-trials',
        '--disable-accelerated-2d-canvas',
        '--disable-extensions',
        '--js-flags=--max_old_space_size=512', // 限制V8内存
        '--disable-background-networking',
        '--disable-default-apps',
        // '--disable-web-security', // 允许跨域请求
        '--disable-software-rasterizer',
        '--disable-crash-reporter',
        '--disable-service-workers',
        '--disable-notifications',
        '--disable-infobars',
        '--font-render-hinting=none',
      ],
    });
    logger.info('Launch browser success');
  } catch (error) {
    logger.error('launch browser failed: ', error);
    // cleanup browser endpoint
    await useCache.remove(BROWSER_WS_ENDPOINT_KEY);
    throw error;
  }

  // save browserWSEndpoint to cache
  const endpoint = await browser.wsEndpoint();
  await useCache.set(BROWSER_WS_ENDPOINT_KEY, {
    endpoint,
    status: BrowserStatus.Ready,
  });

  return browser;
}

function checkBrowserActivated() {
  clearBrowserActivatedTimer();

  let count = 0;

  browserActivatedTimer = setInterval(async () => {
    if (browser) {
      const pages = await browser.pages().catch(() => [] as Page[]);
      if (pages.length === 1 && pages[0]?.url() === 'about:blank') {
        count++;
        logger.debug(`Browser inactive count: ${count}/3`);
      } else {
        count = 0; // 重置计数器！
      }
      if (count >= 3) {
        logger.info('Browser inactive for 3 minutes, closing...');
        await closeBrowser({
          trimCache: true,
        });
      }
    }
  }, 1000 * 60);
}

function clearBrowserActivatedTimer() {
  if (browserActivatedTimer) {
    clearInterval(browserActivatedTimer);
    browserActivatedTimer = null;
  }
}

export const getBrowser = async () => {
  if (browser) return browser;

  // sleep random time (0 ~ 5s),to avoid concurrent blocklet
  await sleep(Math.floor(Math.random() * 1000 * 5));

  // try to connect browser
  const connectedBrowser = await connectBrowser();
  if (connectedBrowser) {
    browser = connectedBrowser;
    return browser;
  }

  // try to launch browser
  const launchedBrowser = await launchBrowser();
  if (launchedBrowser) {
    browser = launchedBrowser;
    checkBrowserActivated();
    return browser;
  }

  throw new Error('No browser to use, should install redis or browser');
};

export const closeBrowser = async ({ trimCache = true }: { trimCache?: boolean } = {}) => {
  if (!browser) return;

  // close all pages
  try {
    const pages = await browser.pages();
    await Promise.all(pages.map((page) => page.close()));
  } catch (err) {
    logger.error('Failed to close all pages:', err);
  }

  // close browser
  try {
    await browser.close();
  } catch (err) {
    logger.error('Failed to close browser:', err);
  }

  // clear cache
  try {
    if (trimCache) {
      // 非常重要！不能删除这行
      await puppeteer.trimCache();
      logger.info('Trim cache success');
    }

    // try to clear cache directory and temporary directory
    if (puppeteerConfig) {
      await fs.emptyDir(puppeteerConfig.temporaryDirectory);
    }

    if (global.gc) {
      global.gc();
    }
  } catch (err) {
    logger.error('Failed to clear browser cache:', err);
  }

  browser = null;

  clearBrowserActivatedTimer();
  await useCache.remove(BROWSER_WS_ENDPOINT_KEY);

  logger.info('Close browser success');
};

export async function initPage({
  abortResourceTypes = [
    'image', // 图片
    'media', // 媒体文件
    'font', // 字体
    'websocket', // websocket 连接
    'manifest', // manifest 文件
    'other', // 其他资源
  ],
} = {}) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  // page setting
  // add custom headers
  await page.setExtraHTTPHeaders({
    [CRAWLER_FLAG]: 'true',
  });

  // abort resource types
  if (abortResourceTypes.length > 0) {
    await page.setRequestInterception(true);

    page.on('request', (req: any) => {
      // @ts-ignore
      if (abortResourceTypes.includes(req.resourceType())) {
        return req.abort();
      }
      return req.continue();
    });
  }

  return page;
}
