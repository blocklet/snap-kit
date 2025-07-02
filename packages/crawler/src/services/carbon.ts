/* global domtoimage */
import { Page } from '@blocklet/puppeteer';

import { logger } from '../config';
import { JobState } from '../store';

// TODO expose local version of dom-to-image
const DOM_TO_IMAGE_URL = 'https://unpkg.com/dom-to-image@2.6.0/dist/dom-to-image.min.js';

export async function createCarbonImage(page: Page, params?: JobState) {
  try {
    await page.addScriptTag({ url: DOM_TO_IMAGE_URL });
    await page.waitForSelector('.export-container', { visible: true, timeout: params?.timeout || 120 });

    const targetElement = await page.$('.export-container');
    const format = params?.format || 'png';

    const dataUrl = await page.evaluate(
      (target: any = document, imageFormat: string = 'png') => {
        const query = new URLSearchParams(document.location.search);

        const EXPORT_SIZES_HASH = {
          '1x': '1',
          '2x': '2',
          '4x': '4',
        };

        const exportSize = EXPORT_SIZES_HASH[query.get('es') as string] || '2';

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

        const width = (target as HTMLElement).offsetWidth * exportSize;
        const height =
          query.get('si') === 'true'
            ? (target as HTMLElement).offsetWidth * exportSize
            : (target as HTMLElement).offsetHeight * exportSize;

        const config = {
          style: {
            transform: `scale(${exportSize})`,
            'transform-origin': 'center',
            background: query.get('si') ? query.get('bg') : 'none',
          },
          filter: (n) => {
            if (n.className) {
              return String(n.className).indexOf('eliminateOnRender') < 0;
            }
            return true;
          },
          width,
          height,
        };

        // @ts-ignore: domtoimage is injected by addScriptTag
        switch (imageFormat) {
          case 'jpeg':
            return domtoimage.toJpeg(target, config);
          case 'webp':
            // dom-to-image doesn't support webp directly, fall back to png
            return domtoimage.toPng(target, config);
          case 'png':
          default:
            return domtoimage.toPng(target, config);
        }
      },
      targetElement,
      format,
    );

    const base64Data = dataUrl.split(',')[1];
    if (!base64Data) {
      throw new Error('Failed to extract base64 data from image');
    }
    return Buffer.from(base64Data, 'base64');
  } catch (e) {
    logger.error('failed to crawl from carbon', { error: e });
    throw e;
  }
}
