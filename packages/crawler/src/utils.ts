import { Page } from '@blocklet/puppeteer';
import Axios from 'axios';
import { Request } from 'express';
import flattenDeep from 'lodash/flattenDeep';
import uniq from 'lodash/uniq';
import { createHash } from 'node:crypto';
import robotsParser from 'robots-parser';
import { parseSitemap } from 'sitemap';
import { Readable } from 'stream';
import { joinURL, withQuery } from 'ufo';

import { logger } from './config';

export const axios = Axios.create({
  timeout: 1000 * 30,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const CRAWLER_FLAG = 'x-arcblock-crawler';

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

/**
 * A default set of file extensions for static assets that do not need to be proxied.
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

export const sleep = (ms: number) => {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
};

/**
 * Check if the request is a arcblock crawler
 */
export const isSelfCrawler = (req: Request) => {
  const ua = req.get('user-agent') || '';
  return req.get(CRAWLER_FLAG) === 'true' || ua.toLowerCase().indexOf('headless') !== -1;
};

/**
 * Check if the request is a static file
 */
export function isStaticFile(req: Request) {
  const excludeUrlPattern = new RegExp(`\\.(${staticFileExtensions.join('|')})$`, 'i');
  return excludeUrlPattern.test(req.path);
}

/**
 * Check if the request is a spider
 */
export function isSpider(req: Request) {
  const ua = req.get('user-agent') || '';
  return botUserAgents.some((spider) => spider.test(ua));
}

/**
 * Get and parse the robots.txt by `robots-parser`
 */
export async function getRobots(url: string) {
  const { origin } = new URL(url);
  const robotsUrl = joinURL(origin, 'robots.txt?nocache=1');
  const { data } = await axios.get(robotsUrl).catch((error) => {
    logger.warn(`Failed to fetch robots.txt from ${robotsUrl}:`, { error });
    return { data: null };
  });

  return data ? robotsParser(robotsUrl, data) : null;
}

/**
 * Check if the url is allowed to crawl from robots.txt
 */
export const isAcceptCrawler = async (url: string) => {
  const robots = await getRobots(url);
  const isAllowed = robots ? await robots.isAllowed(url) : true;
  return isAllowed;
};

/**
 * Get and parse the sitemap.xml by `sitemap` package
 */
export const getSitemapList = async (url: string) => {
  let sitemapUrlList: string[] = [];

  const robots = await getRobots(url);
  if (robots) {
    sitemapUrlList = (await robots.getSitemaps()) || [];
  }

  if (!sitemapUrlList.length) {
    const { origin } = new URL(url);
    sitemapUrlList.push(joinURL(origin, 'sitemap.xml?nocache=1'));
  }

  // loop site map url list
  const sitemapList = await Promise.all(
    sitemapUrlList.map(async (sitemapUrl) => {
      sitemapUrl = withQuery(sitemapUrl, { nocache: '1' });

      try {
        const { data: sitemapTxt } = await axios.get(sitemapUrl).catch(() => ({
          data: '',
        }));

        if (sitemapTxt) {
          const stream = Readable.from([sitemapTxt]);
          const sitemapJson = await parseSitemap(stream);
          return sitemapJson;
        }
      } catch (error) {
        logger.error(`Could not get sitemap from ${sitemapUrl}`, { error });
      }

      return [];
    }),
  );

  return uniq(flattenDeep(sitemapList.filter(Boolean)));
};

export const formatUrl = (url: string) => {
  return url.replace(/\/$/, '').trim();
};

export function md5(content: string | Uint8Array) {
  return createHash('md5').update(content).digest('hex');
}

export async function findMaxScrollHeight(page: Page) {
  const maxHeightHandler = await page.evaluateHandle(() => {
    const elements = Array.from(document.querySelectorAll('*'));
    let maxHeight = document.body.scrollHeight;

    for (const el of elements) {
      const style = window.getComputedStyle(el);
      if (style.overflowY === 'auto' || style.overflowY === 'scroll') {
        if (el.scrollHeight > el.clientHeight && el.scrollHeight > maxHeight) {
          maxHeight = el.scrollHeight;
        }
      }
    }

    return maxHeight;
  });

  const maxHeight = await maxHeightHandler.jsonValue();

  maxHeightHandler.dispose();

  return maxHeight;
}
