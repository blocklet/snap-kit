import config from '@blocklet/sdk/lib/config';
import axios from 'axios';
import flattenDeep from 'lodash/flattenDeep';
import uniq from 'lodash/uniq';
import robotsParser from 'robots-parser';
import { parseSitemap } from 'sitemap';
import { Readable } from 'stream';
import { joinURL } from 'ufo';

const { logger } = config;

export { logger };

export const api = axios.create({
  timeout: 1000 * 10,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const sleep = (ms: number) => {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
};

export const CRAWLER_FLAG = 'x-crawler';

export const isSelfCrawler = (req: any) => {
  const ua = req.get('user-agent') || '';
  return req.get(CRAWLER_FLAG) === 'true' || `${ua}`.toLowerCase().indexOf('headless') !== -1;
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
