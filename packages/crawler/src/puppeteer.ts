import puppeteer, { Browser, Page, ResourceType } from '@blocklet/puppeteer';
import fs from 'fs-extra';
import path from 'path';
import { clearInterval, setInterval } from 'timers';

import { config, logger } from './config';
import { CRAWLER_FLAG, sleep } from './utils';

const BrowserStatus = {
  None: 'None',
  Launching: 'Launching',
  Ready: 'Ready',
};
let browserStatus = BrowserStatus.None;

/** Chromium WebSocket endpoint that allows puppeteer browser instance to connect to the browser */
let browserEndpoint = '';

let browser: Browser | null;
let browserActivatedTimer: NodeJS.Timeout | null;

export { puppeteer };

export async function ensurePuppeteerrc() {
  const cacheDirectory = path.join(config.cacheDir, 'puppeteer', 'cache');
  const temporaryDirectory = path.join(config.cacheDir, 'puppeteer', 'tmp');
  const puppeteerrcPath = path.join(config.appDir, '.puppeteerrc.js');

  // ensure directory exists
  await Promise.all([fs.ensureDir(cacheDirectory), fs.ensureDir(temporaryDirectory), fs.ensureFile(puppeteerrcPath)]);

  const puppeteerConfig = {
    cacheDirectory,
    temporaryDirectory,
  };

  const fileContent = `module.exports = ${JSON.stringify(puppeteerConfig, null, 2)}`;
  await fs.writeFile(puppeteerrcPath, fileContent);

  logger.debug(`Puppeteerrc file created at ${puppeteerrcPath}`, puppeteerConfig);

  return puppeteerConfig;
}

export async function ensureBrowser() {
  const puppeteerConfig = await ensurePuppeteerrc();
  const executablePath = config.puppeteerPath;

  logger.debug('executablePath', executablePath);

  if (!executablePath || !fs.existsSync(executablePath)) {
    logger.info('start download browser', puppeteerConfig);
    // @ts-ignore
    const { downloadBrowser } = await (async () => {
      try {
        // @ts-ignore
        // eslint-disable-next-line import/extensions
        return await import('@blocklet/puppeteer/internal/node/install.js');
      } catch (err) {
        logger.warn(
          'Skipping browser installation because the Puppeteer build is not available. Run `npm install` again after you have re-built Puppeteer.',
        );
      }
    })();

    if (downloadBrowser) {
      await downloadBrowser();
      logger.info('Browser download completed successfully');
    }
  }

  // try to launch browser
  if (config.isProd) {
    const browser = await launchBrowser();
    if (!browser) {
      throw new Error('Failed to launch browser');
    }
    await closeBrowser();
  }

  logger.info('Puppeteer is ready');
}

export async function connectBrowser() {
  if (!browserEndpoint) {
    return null;
  }

  // retry if browser is launching
  if (browserStatus === BrowserStatus.Launching) {
    await sleep(Math.floor(Math.random() * 1000));
    return connectBrowser();
  }

  try {
    browser = await puppeteer.connect({
      browserWSEndpoint: browserEndpoint,
    });
    logger.info('Connect browser success');
  } catch (err) {
    logger.warn('Connect browser failed, clear endpoint', err);
    browserEndpoint = '';
    return null;
  }

  return browser;
}

export async function launchBrowser() {
  browserEndpoint = '';
  browserStatus = BrowserStatus.Launching;

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
    logger.info('Launch browser');
  } catch (error) {
    logger.error('launch browser failed: ', error);
    browserStatus = BrowserStatus.None;
    browserEndpoint = '';
    throw error;
  }

  // save browserWSEndpoint to cache
  browserEndpoint = await browser!.wsEndpoint();
  browserStatus = BrowserStatus.Ready;

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
    logger.debug('getBrowser.connectedBrowser');
    browser = connectedBrowser;
    checkBrowserActivated();
    return browser;
  }

  // try to launch browser
  const launchedBrowser = await launchBrowser();
  if (launchedBrowser) {
    logger.debug('getBrowser.launchedBrowser');
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
    logger.warn('Failed to close all pages:', err);
  }

  // close browser
  try {
    await browser.close();
  } catch (err) {
    logger.warn('Failed to close browser:', err);
  }

  // clear cache
  try {
    if (trimCache) {
      await puppeteer.trimCache();
      logger.debug('Trim cache success');
    }

    // try to clear temporary directory
    // if (puppeteerConfig) {
    //   await fs.emptyDir(puppeteerConfig.temporaryDirectory);
    // }

    if (global.gc) {
      global.gc();
    }
  } catch (err) {
    logger.warn('Failed to clear browser cache:', err);
  }

  browser = null;

  clearBrowserActivatedTimer();
  browserEndpoint = '';
  browserStatus = BrowserStatus.None;

  logger.info('Close browser success');
};

export async function initPage({ abortResourceTypes = [] }: { abortResourceTypes?: ResourceType[] } = {}) {
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

    page.on('request', (req) => {
      if (abortResourceTypes.includes(req.resourceType())) {
        return req.abort();
      }
      return req.continue();
    });
  }

  return page;
}
