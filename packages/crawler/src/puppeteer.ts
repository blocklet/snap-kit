import puppeteer, { Browser, ResourceType } from '@blocklet/puppeteer';
import fs from 'fs-extra';
import path from 'path';

import { config, logger } from './config';
import { CRAWLER_FLAG, sleep } from './utils';

let browser: Browser | null;
let browserInitInFlight: Promise<Browser> | null;
let closingBrowser: Promise<void> | null;

const BROWSER_CONNECTION_ERROR_PATTERNS = [
  /protocol error/i,
  /target closed/i,
  /browser disconnected/i,
  /session closed/i,
  /target crashed/i,
];

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
    const browser = await getBrowser();
    if (!browser) {
      throw new Error('Failed to launch browser');
    }
    await closeBrowser();
  }

  logger.info('Puppeteer is ready');
}

export async function launchBrowser() {
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
        '--disable-dev-shm-usage',
        '--disable-site-isolation-trials',
        '--disable-extensions',
        '--js-flags=--max_old_space_size=768', // 限制V8内存
        '--disable-background-networking',
        '--disable-default-apps',
        // '--disable-web-security', // 允许跨域请求
        '--disable-crash-reporter',
        '--disable-service-workers',
        '--disable-notifications',
        '--disable-infobars',
        '--font-render-hinting=none',
        // WebGL: use software GL fallback for servers without GPU
        '--enable-webgl',
        '--ignore-gpu-blocklist',
        '--use-gl=swiftshader',
        '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader',
        '--disable-gpu-sandbox',
      ],
    });
    attachBrowserListeners(browser);
    logger.info('Launch browser');
  } catch (error) {
    logger.error('launch browser failed: ', error);
    throw error;
  }

  return browser;
}

function resetBrowserState(reason?: string) {
  if (reason) {
    logger.warn('Reset browser state', { reason });
  }
  browser = null;
  browserInitInFlight = null;
}

export function isBrowserConnectionError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || '');
  return BROWSER_CONNECTION_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}

function attachBrowserListeners(target: Browser) {
  target.on('disconnected', () => {
    if (browser !== target) {
      return;
    }

    logger.warn('Browser disconnected');
    resetBrowserState('disconnected');
  });
}

async function initBrowser() {
  // sleep random time (0 ~ 5s),to avoid concurrent blocklet
  await sleep(Math.floor(Math.random() * 1000 * 5));

  const launchedBrowser = await launchBrowser();
  if (launchedBrowser) {
    logger.debug('getBrowser.launchedBrowser');
    browser = launchedBrowser;
    return browser;
  }

  throw new Error('No browser to use, should install redis or browser');
}

export const getBrowser = async () => {
  // Wait for any ongoing browser close operation to complete
  if (closingBrowser) {
    await closingBrowser;
  }

  if (browser) {
    if (browser.isConnected()) {
      return browser;
    }
    logger.warn('Browser instance is disconnected, resetting');
    resetBrowserState('disconnected');
  }

  if (browserInitInFlight) {
    return browserInitInFlight;
  }

  const initPromise = initBrowser();

  browserInitInFlight = initPromise;

  return initPromise.finally(() => {
    if (browserInitInFlight === initPromise) {
      browserInitInFlight = null;
    }
  });
};

export const closeBrowser = ({ trimCache = true }: { trimCache?: boolean } = {}) => {
  // Return existing close operation if already in progress
  if (closingBrowser) {
    return closingBrowser;
  }

  if (!browser) return;

  const target = browser;
  browser = null;
  browserInitInFlight = null;

  const doClose = async () => {
    // close all pages
    try {
      const pages = await target.pages();
      await Promise.all(pages.map((page) => page.close().catch(() => {})));
    } catch (err) {
      logger.warn('Failed to close all pages:', err);
    }

    // close browser
    try {
      await target.close();
    } catch (err) {
      logger.warn('Failed to close browser:', err);
    }

    // clear cache
    try {
      if (trimCache) {
        await puppeteer.trimCache();
        logger.debug('Trim cache success');
      }

      if (global.gc) {
        global.gc();
      }
    } catch (err) {
      logger.warn('Failed to clear browser cache:', err);
    }

    logger.info('Close browser success');
  };

  closingBrowser = doClose().finally(() => {
    closingBrowser = null;
  });

  return closingBrowser;
};

export async function initPage({ abortResourceTypes = [] }: { abortResourceTypes?: ResourceType[] } = {}) {
  const currentBrowser = await getBrowser();

  let page;
  try {
    page = await currentBrowser.newPage();
  } catch (error) {
    // If newPage fails due to connection error, close browser and retry once
    if (isBrowserConnectionError(error)) {
      logger.warn('Failed to create new page due to connection error, restarting browser');
      await closeBrowser({ trimCache: false });
      const newBrowser = await getBrowser();
      page = await newBrowser.newPage();
    } else {
      throw error;
    }
  }

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
