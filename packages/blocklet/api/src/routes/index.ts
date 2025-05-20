import { crawlQueue, crawlUrl, getUrlInfoFromCache } from '@arcblock/crawler/src/crawler';
import { Joi } from '@arcblock/validator';
import { Router } from 'express';

const router = Router();

const crawlSchema = Joi.object({
  url: Joi.string().uri().required(),
  html: Joi.boolean().default(true),
  screenshot: Joi.boolean().default(true),
  viewport: Joi.object({
    width: Joi.number().integer().min(375).default(1440),
    height: Joi.number().integer().min(500).default(900),
  }).default({ width: 1440, height: 900 }),
});

router.post('/crawl', async (req, res) => {
  const { url, screenshot, viewport, html } = await crawlSchema.validateAsync(req.body);

  await crawlUrl({
    urls: url,
    screenshot,
    html,
    viewport,
  });

  return res.json({
    code: 'ok',
    data: null,
  });
});

const snapshotSchema = Joi.object({
  url: Joi.string().uri().required(),
});

router.get('/snapshot', async (req, res) => {
  const { url } = await snapshotSchema.validateAsync(req.query);

  const snapshot = await getUrlInfoFromCache(url);

  if (!snapshot) {
    const job = await crawlQueue.get(url);
    if (job) {
      return res.json({
        code: 'ok',
        data: {
          url,
          status: 1,
        },
      });
    }

    return res.json({
      code: 'ok',
      data: null,
    });
  }

  return res.json({
    code: 'ok',
    data: {
      url,
      html: snapshot.html,
      screenshot: snapshot.screenshot,
      lastModified: snapshot.lastModified,
      status: 2,
    },
  });
});

export default router;
