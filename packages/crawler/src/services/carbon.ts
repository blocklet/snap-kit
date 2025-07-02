/* global domtoimage */
import { getBrowser } from '../puppeteer';

// TODO expose local version of dom-to-image
const DOM_TO_IMAGE_URL = 'https://unpkg.com/dom-to-image@2.6.0/dist/dom-to-image.min.js';
// const NOTO_COLOR_EMOJI_URL = 'https://raw.githack.com/googlei18n/noto-emoji/master/fonts/NotoColorEmoji.ttf';

export async function createCarbonImage(params: any) {
  // try {
  //   await chrome.font(NOTO_COLOR_EMOJI_URL);
  // } catch (e) {
  //   console.error(e);
  // }

  const browser = await getBrowser();

  try {
    const page = await browser.newPage();

    await page.goto(params.url);
    await page.addScriptTag({ url: DOM_TO_IMAGE_URL });
    await page.waitForSelector('.export-container', { visible: true, timeout: params.timeout });

    const targetElement = await page.$('.export-container');

    const dataUrl = await page.evaluate((target: any = document) => {
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
      return domtoimage.toPng(target, config);
    }, targetElement);

    return Buffer.from(dataUrl.split(',')[1], 'base64');
  } catch (e) {
    // eslint-disable-next-line
    console.error(e);
    return null;
  } finally {
    await browser.close();
  }
}
