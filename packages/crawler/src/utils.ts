import puppeteer from '@blocklet/puppeteer';
import config from '@blocklet/sdk/lib/config';
import axios from 'axios';
import fs from 'fs-extra';
import flattenDeep from 'lodash/flattenDeep';
import uniq from 'lodash/uniq';
import { join } from 'path';
import robotsParser from 'robots-parser';
import { parseSitemap } from 'sitemap';
import { Readable } from 'stream';
import { joinURL } from 'ufo';

import { useCache, withCache } from './store';

export * from '@blocklet/sdk/lib/config';

const { logger } = config;

let browser: any;
let checkBrowserTimer: any;
const BROWSER_WS_ENDPOINT_KEY = `browserWSEndpoint-${process.env.BLOCKLET_DID || 'unknown'}`;

export const api = axios.create({
  timeout: 1000 * 10, // 10s
  headers: {
    'Content-Type': 'application/json',
  },
});

export const sleep = (ms: number) => {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
};

export const clearCheckBrowserTimer = () => {
  if (checkBrowserTimer) {
    clearInterval(checkBrowserTimer);
    checkBrowserTimer = null;
  }
};

export const closeBrowser = async ({ trimCache = true }: { trimCache?: boolean } = {}) => {
  try {
    if (browser) {
      const pages = await browser.pages().catch(() => []);
      // close all pages
      await Promise.all(pages.map((page: any) => page.close().catch(() => {})));

      await browser.close().catch((err: any) => {
        logger.warn('Browser close failed with error:', err);
      });
      browser = null;
      await useCache.remove(BROWSER_WS_ENDPOINT_KEY);
    }

    clearCheckBrowserTimer();

    if (trimCache) {
      // 非常重要！不能删除这行
      await puppeteer.trimCache();
      // 获取 getPuppeteerrc 中的缓存目录和临时目录
      const { cacheDirectory, temporaryDirectory } = getPuppeteerrc();
      if (cacheDirectory) {
        // 只清空缓存目录内容，保留目录本身
        fs.emptyDirSync(cacheDirectory);
      }
      if (temporaryDirectory) {
        // 只清空临时目录内容，保留目录本身
        fs.emptyDirSync(temporaryDirectory);
      }

      logger.info('Trim cache success');
    }

    logger.info('Close browser success');

    // 强制垃圾回收
    if (global.gc) {
      global.gc();
    }
  } catch (error) {
    logger.error('Failed to close browser:', error);
  }
};

export const getBrowser = async () => {
  if (!browser) {
    // sleep random time (0 ~ 5s),to avoid concurrent blocklet
    await sleep(Math.floor(Math.random() * 1000 * 5));

    await checkBrowserDownloaded();
    // try to connect browser
    try {
      await withCache(async (client: any) => {
        let browserWSEndpoint = await client.get(BROWSER_WS_ENDPOINT_KEY);

        if (!browserWSEndpoint) {
          // sleep random time (0 ~ 5s),to check browserWSEndpoint again
          await sleep(Math.floor(Math.random() * 1000 * 5));
          browserWSEndpoint = await client.get(BROWSER_WS_ENDPOINT_KEY);
        }

        if (browserWSEndpoint) {
          browser = await puppeteer.connect({
            browserWSEndpoint,
          });
          logger.info('Connect browser success');
        } else {
          throw new Error('no browserWSEndpoint to connect');
        }
      });
    } catch (error) {
      try {
        //  should launch browser
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
        const browserWSEndpoint = await browser.wsEndpoint();
        // save browserWSEndpoint to cache
        await withCache(async (client: any) => {
          await client.set(BROWSER_WS_ENDPOINT_KEY, browserWSEndpoint);
        });
      } catch (error) {
        logger.error('launch browser failed: ', error);
      }
    } finally {
      if (browser) {
        // 通过计时器检测 browser 是否活跃，如果超过 3 次 + 每次 60s 不活跃, 则关闭浏浏览器且释放资源
        let count = 0;

        checkBrowserTimer = setInterval(async () => {
          if (browser) {
            const pages = await browser.pages().catch(() => []);
            if (pages.length === 1 && pages[0].url() === 'about:blank') {
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
    }
  }

  if (!browser) {
    throw new Error('No browser to use, should install redis or browser');
  }

  return browser;
};

export const CRAWLER_FLAG = 'x-crawler';

export const isSelfCrawler = (req: any) => {
  const ua = req.get('user-agent') || '';
  return req.get(CRAWLER_FLAG) === 'true' || `${ua}`.toLowerCase().indexOf('headless') !== -1;
};

export const initPage = async ({
  abortResourceTypes = [
    'image', // 图片
    'media', // 媒体文件
    'font', // 字体
    'websocket', // websocket 连接
    'manifest', // manifest 文件
    'other', // 其他资源
  ],
} = {}) => {
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
};

/**
 * A default set of user agent patterns for bots/crawlers that do not perform
 * well with pages that require JavaScript.
 */
const botUserAgents = [
  /bot/i,
  /spider/i,
  /facebookexternalhit/i,
  /simplepie/i,
  /yahooseeker/i,
  /embedly/i,
  /quora link preview/i,
  /outbrain/i,
  /vkshare/i,
  /monit/i,
  /Pingability/i,
  /Monitoring/i,
  /WinHttpRequest/i,
  /Apache-HttpClient/i,
  /getprismatic.com/i,
  /python-requests/i,
  /Twurly/i,
  /yandex/i,
  /browserproxy/i,
  /crawler/i,
  /Qwantify/i,
  /Yahoo/i,
  /pinterest/i,
  /Tumblr/i,
  /Tumblr Agent/i,
  /WhatsApp/i,
  /Google-Structured-Data-Testing-Tool/i,
  /Google-InspectionTool/i,
  /Googlebot/i,
  /GPTBot/i,
  /Applebot/i,

  // AI bots
  /Anthropic-ai/i,
  /Claude-Web/i,
  /anthropic-ai-scraper/i,
  /Google-Extended/i,
  /GoogleOther/i,
  /CCBot\/\d/i,
  /Bytespider/i,
  /BingBot/i,
  /Baiduspider/i,
  /Sogou/i,
  /Perplexity/i,
  /Cohere-ai/i,
  /xlts-bot/i,
  /THAAS/i,
  /YisouSpider/i,
  /AlibabaGroup/i,
  /adaptive-edge-crawler/i,
];

const isSpider = (ua: string) =>
  botUserAgents.some((spider) => {
    return spider.test(ua);
  });

/**
 * A default set of file extensions for static assets that do not need to be
 * proxied.
 */
const staticFileExtensions = [
  'ai',
  'avi',
  'css',
  'dat',
  'dmg',
  'doc',
  'doc',
  'exe',
  'flv',
  'gif',
  'ico',
  'iso',
  'jpeg',
  'jpg',
  'js',
  'less',
  'm4a',
  'm4v',
  'mov',
  'mp3',
  'mp4',
  'mpeg',
  'mpg',
  'pdf',
  'png',
  'ppt',
  'psd',
  'rar',
  'rss',
  'svg',
  'swf',
  'tif',
  'torrent',
  'ttf',
  'txt',
  'wav',
  'wmv',
  'woff',
  'xls',
  'xml',
  'zip',
];

export const getDefaultRobotsUrl = (req: any) => {
  const { origin } = new URL(getFullUrl(req));
  return joinURL(origin, 'robots.txt?nocache=1');
};

export const getDefaultSitemapUrl = (req: any) => {
  const { origin } = new URL(getFullUrl(req));
  return joinURL(origin, 'sitemap.xml?nocache=1');
};

// receive req or url
export const isAcceptCrawler = async (req: any) => {
  // default accept crawler
  let acceptCrawler = true;

  const robotsUrl = getDefaultRobotsUrl(req); // full url

  const { data: robotsTxt } = await api.get(robotsUrl).catch(() => ({
    data: '',
  }));

  if (robotsTxt) {
    const robots = robotsParser(robotsUrl, robotsTxt);
    acceptCrawler = !!(await robots.isAllowed(getFullUrl(req)));
  }

  // not match last-modified

  return acceptCrawler;
};

// receive req or url
export const getSitemapList = async (req: any) => {
  const robotsUrl = getDefaultRobotsUrl(req); // full url
  let sitemapUrlList = [getDefaultSitemapUrl(req)];

  const { data: robotsTxt } = await api.get(robotsUrl).catch(() => ({
    data: '',
  }));

  if (robotsTxt) {
    const robots = robotsParser(robotsUrl, robotsTxt);

    const robotsTxtSitemapUrlList = (await robots.getSitemaps()) || [];
    if (robotsTxtSitemapUrlList.length > 0) {
      sitemapUrlList = robotsTxtSitemapUrlList;
    }
  }

  // loop site map url list
  const sitemapList = await Promise.all(
    sitemapUrlList.map(async (sitemapUrl) => {
      const newUrl = new URL(sitemapUrl);
      newUrl.searchParams.set('nocache', '1');
      sitemapUrl = newUrl.toString();

      const { data: sitemapTxt } = await api.get(sitemapUrl).catch(() => ({
        data: '',
      }));

      if (sitemapTxt) {
        const stream = Readable.from([sitemapTxt]);
        const sitemapJson = await parseSitemap(stream);
        return sitemapJson;
      }

      return [];
    }),
  );

  return uniq(flattenDeep(sitemapList.filter(Boolean)));
};

export const isBotUserAgent = (req: any) => {
  const ua = req.get('user-agent');

  const excludeUrlPattern = new RegExp(`\\.(${staticFileExtensions.join('|')})$`, 'i');

  if (ua === undefined || !isSpider(ua) || excludeUrlPattern.test(req.path)) {
    return false;
  }

  return true;
};

export const getBlockletPathname = (req: any) => {
  return req.headers['x-path-prefix'] ? joinURL(req.headers['x-path-prefix'], req.originalUrl) : req.originalUrl;
};

export const getComponentInfo = () => {
  const { env, components } = config;
  return components.find((item) => item.did === env.componentDid) || {};
};

// receive req or url
export const getFullUrl = (req: any) => {
  if (typeof req === 'string') {
    return req;
  }

  return joinURL(config.env.appUrl, getBlockletPathname(req));
};

export const getRelativePath = (url: string) => {
  try {
    return new URL(url).pathname;
  } catch (error) {
    // ignore error
  }
  return url;
};

// @ts-ignore
// const memoryCache = new LRU({
//   maxSize: 100,
//   sizeCalculation: () => {
//     return 1;
//   },
//   // 1 week
//   ttl,
// });

// check puppeteer and chrome ready
export const checkBrowserDownloaded = async () => {
  try {
    // check system chromium
    const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium';

    if (fs.existsSync(executablePath)) {
      try {
        logger.info(`System Chromium found and tested successfully: ${executablePath}`);
        return; // test passed, no need to download
      } catch (err) {
        // system chromium exists but test failed, record warning
        logger.warn('System Chromium exists but test failed, will try to download');
      }
    }

    // system chromium is not available, execute original download logic
    const { downloadBrowser } = await (async () => {
      try {
        // @ts-ignore
        return await import('@blocklet/puppeteer/internal/node/install');
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
  } catch (error) {
    logger.warn('Browser download failed', error);
  }
};

export const getPuppeteerrc = () => {
  const cacheDir = process.env.BLOCKLET_CACHE_DIR as string;
  if (fs.existsSync(cacheDir) === false) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }

  const cacheDirectory = join(cacheDir, 'puppeteer', 'cache');
  const temporaryDirectory = join(cacheDir, 'puppeteer', 'tmp');

  fs.mkdirSync(cacheDirectory, { recursive: true });
  fs.mkdirSync(temporaryDirectory, { recursive: true });

  let config = {
    // Changes the cache location for Puppeteer.
    cacheDirectory,
    temporaryDirectory,
  } as {
    cacheDirectory?: string;
    temporaryDirectory?: string;
  };

  try {
    // ensure cache directory exists
    fs.ensureDirSync(cacheDirectory);
    // ensure tmp directory exists
    fs.ensureDirSync(temporaryDirectory);
  } catch (error) {
    // ignore error
    // fallback to default config
    config = {};
  }

  const fileContent = `module.exports = ${JSON.stringify(config, null, 2)}`;

  // @ts-ignore
  const puppeteerrcPath = join(process.env.BLOCKLET_APP_DIR, '.puppeteerrc.js');
  try {
    // check file exist
    const puppeteerrcContent = fs.readFileSync(puppeteerrcPath, 'utf-8');

    if (puppeteerrcContent !== fileContent) {
      throw new Error('.puppeteerrc.js not right');
    }
  } catch (error) {
    logger.info('Resolve the .puppeteerrc.js error bug');
    fs.writeFileSync(puppeteerrcPath, fileContent);
  }

  return config;
};

// export puppeteer
export { puppeteer };
