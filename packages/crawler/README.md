# @arcblock/crawler

A crawler module designed for Blocklets. It supports batch crawling of HTML, webpage screenshots, title, description, and more, based on URL or Sitemap.

## Usage

```typescript
import { crawlUrl, getSnapshot, initCrawler } from '@arcblock/crawler';

await initCrawler();

// Asynchronously crawl a page
const jobId = await crawlUrl({ url: 'https://www.arcblock.io', includeScreenshot: true, includeHtml: true });

// Get the crawling result (need to wait for the crawler to finish)
const snapshot = await getSnapshot(jobId);
```

### initCrawler

Initializes the crawler.

### crawlUrl

Crawls the specified page.

### getSnapshot

Gets the crawling result by jobId.

### getLatestSnapshot

Gets the latest crawling result by URL.

## Schedule

Passing siteCron to initCrawler will enable scheduled tasks to periodically crawl all pages of specified websites based on their sitemaps.

```typescript
await initCrawler({
  siteCron: {
    enabled: !!env.preferences.cronEnabled,
    immediate: !!env.preferences.cronImmediate,
    sites: env.preferences.cronSites,
    time: env.preferences.cronTime,
    concurrency: env.preferences.concurrency,
  },
});
```

## Environment Variables

- `PUPPETEER_EXECUTABLE_PATH`: The execution path for Puppeteer. This variable is not required if used within the `arcblock/snap-kit` Docker image. When developing locally, you can set it to the Chrome path: `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`

If not referenced by a Blocklet, some dependent Blocklet environment variables need to be provided:

- `BLOCKLET_CACHE_DIR`: (Optional) The directory for automatic Puppeteer installation if `PUPPETEER_EXECUTABLE_PATH` is not provided. Defaults to `process.cwd()`.

- `BLOCKLET_APP_URL`: (Optional) The domain prefix for screenshot. Defaults to `/`.

- `BLOCKLET_DATA_DIR`: (Required) The directory to save webpage screenshots and HTML source files obtained by the crawler.

- `BLOCKLET_LOG_DIR`: (Required) Directory path for storing @blocklet/logger logs

## SQLite

When `initCrawler` is called, it attempts to create an SQLite database at `BLOCKLET_DATA_DIR`. This database is used to cache HTML content and screenshot. Please ensure that the deployment environment supports SQLite.
