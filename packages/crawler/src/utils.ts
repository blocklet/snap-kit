import { components, env } from '@blocklet/sdk/lib/config';
import Axios from 'axios';
import { Request } from 'express';
import flattenDeep from 'lodash/flattenDeep';
import uniq from 'lodash/uniq';
import { createHash } from 'node:crypto';
import robotsParser from 'robots-parser';
import { parseSitemap } from 'sitemap';
import { Readable } from 'stream';
import { joinURL } from 'ufo';

export const axios = Axios.create({
  timeout: 1000 * 30,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const sleep = (ms: number) => {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
};

export const CRAWLER_FLAG = 'x-snap-kit';

export const isSelfCrawler = (req: Request) => {
  const ua = req.get('user-agent') || '';
  return req.get(CRAWLER_FLAG) === 'true' || ua.toLowerCase().indexOf('headless') !== -1;
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

export const getDefaultRobotsUrl = (url: string) => {
  const { origin } = new URL(url);
  return joinURL(origin, 'robots.txt?nocache=1');
};

export async function getRobots(url: string) {
  const { origin } = new URL(url);
  const robotsUrl = joinURL(origin, 'robots.txt?nocache=1');
  const { data } = await axios.get(robotsUrl).catch(() => ({
    data: '',
  }));

  return data ? robotsParser(robotsUrl, data) : null;
}

export const getDefaultSitemapUrl = (url: string) => {
  const { origin } = new URL(url);
  return joinURL(origin, 'sitemap.xml?nocache=1');
};

export const isAcceptCrawler = async (url: string) => {
  const robots = await getRobots(url);
  const isAllowed = robots ? await robots.isAllowed(url) : true;
  return isAllowed;
};

export const getSitemapList = async (url: string) => {
  let sitemapUrlList = [getDefaultSitemapUrl(url)];
  const robots = await getRobots(url);

  if (robots) {
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

      const { data: sitemapTxt } = await axios.get(sitemapUrl).catch(() => ({
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

export const isBotUserAgent = (req: Request) => {
  const ua = req.get('user-agent');
  const excludeUrlPattern = new RegExp(`\\.(${staticFileExtensions.join('|')})$`, 'i');

  if (ua === undefined || !isSpider(ua) || excludeUrlPattern.test(req.path)) {
    return false;
  }

  return true;
};

export const getComponentInfo = () => {
  return components.find((item) => item.did === env.componentDid) || {};
};

export const getFullUrl = (req: Request) => {
  const blockletPathname = req.headers['x-path-prefix']
    ? joinURL(req.headers['x-path-prefix'] as string, req.originalUrl)
    : req.originalUrl;

  return joinURL(env.appUrl, blockletPathname);
};

export const getRelativePath = (url: string) => {
  try {
    return new URL(url).pathname;
  } catch (error) {
    // ignore error
  }
  return url;
};

export const formatUrl = (url: string) => {
  return url.replace(/\/$/, '').trim();
};

export function md5(content: string | Uint8Array) {
  return createHash('md5').update(content).digest('hex');
}
