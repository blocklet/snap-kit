import { Page } from '@blocklet/puppeteer';

import { logger } from '../config';
import { JobState } from '../store';

export async function createCarbonImage(page: Page, params?: JobState) {
  try {
    await page.waitForSelector('.export-container', { visible: true, timeout: params?.timeout || 120 });

    const targetElement = (await page.$('.export-container'))!;

    await page.evaluate((target: any = document) => {
      if (!target) {
        throw new Error('Target element not found');
      }

      target.querySelectorAll('span[role="presentation"]').forEach((node) => {
        const el = node as HTMLElement;
        if (el && el.innerText && el.innerText.match(/%[A-Fa-f0-9]{2}/)) {
          el.innerText.match(/%[A-Fa-f0-9]{2}/g)?.forEach((t) => {
            el.innerHTML = el.innerHTML.replace(t, encodeURIComponent(t));
          });
        }
      });
    }, targetElement);

    const buffer = await targetElement.screenshot({ type: params?.format || 'webp', quality: params?.quality || 100 });
    return buffer;
  } catch (e) {
    logger.error('failed to crawl from carbon', { error: e });
    throw e;
  }
}
