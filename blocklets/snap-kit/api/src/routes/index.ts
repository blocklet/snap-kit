import { crawlUrl, getLatestSnapshot, getSnapshot } from '@arcblock/crawler';
import { Joi } from '@arcblock/validator';
import { Router } from 'express';

const middlewares = require('@blocklet/sdk/lib/middlewares');

const router = Router();

router.use(middlewares.session({ accessKey: true }));

/**
 * Crawl page html
 */
const crawlSchema = Joi.object({
  url: Joi.string().uri().required(),
  timeout: Joi.number().integer().min(10).max(120).default(120),
  sync: Joi.boolean().default(false),
});
router.post('/crawl', middlewares.auth({ methods: ['accessKey'] }), async (req, res) => {
  const params = await crawlSchema.validateAsync(req.body);

  const jobId = await crawlUrl(
    {
      ...params,
      timeout: params.timeout * 1000,
      includeHtml: true,
      includeScreenshot: false,
    },
    (snapshot) => {
      if (params.sync && !res.headersSent) {
        delete snapshot?.screenshot;

        res.json({
          code: 'ok',
          data: snapshot,
        });
      }
    },
  );

  if (!params.sync) {
    res.json({
      code: 'ok',
      data: { jobId },
    });
  }
});

/**
 * Get html crawl result
 */
const crawlGetSchema = Joi.object({
  jobId: Joi.string(),
  url: Joi.string().uri(),
}).or('jobId', 'url');

router.get('/crawl', middlewares.auth({ methods: ['accessKey'] }), async (req, res) => {
  const params = await crawlGetSchema.validateAsync(req.query);
  const snapshot = params.jobId ? await getSnapshot(params.jobId) : await getLatestSnapshot(params.url);

  delete snapshot?.screenshot;

  return res.json({
    code: 'ok',
    data: snapshot,
  });
});

/**
 * Crawl page screenshot
 */
const snapSchema = Joi.object({
  url: Joi.string().uri().required(),
  width: Joi.number().integer().min(375).default(1440),
  height: Joi.number().integer().min(500).default(900),
  quality: Joi.number().integer().min(1).max(100).default(80),
  timeout: Joi.number().integer().min(10).max(120).default(120),
  fullPage: Joi.boolean().default(false),
  sync: Joi.boolean().default(false),
});
router.post('/snap', middlewares.auth({ methods: ['accessKey'] }), async (req, res) => {
  const params = await snapSchema.validateAsync(req.body);

  const jobId = await crawlUrl(
    {
      ...params,
      timeout: params.timeout * 1000,
      includeHtml: false,
      includeScreenshot: true,
    },
    (snapshot) => {
      if (params.sync && !res.headersSent) {
        delete snapshot?.html;

        res.json({
          code: 'ok',
          data: snapshot,
        });
      }
    },
  );

  if (!params.sync) {
    res.json({
      code: 'ok',
      data: { jobId },
    });
  }
});

/**
 * Get screenshot crawl result
 */
const snapGetSchema = Joi.object({
  jobId: Joi.string().required(),
});
router.get('/snap', middlewares.auth({ methods: ['accessKey'] }), async (req, res) => {
  const params = await snapGetSchema.validateAsync(req.query);
  const snapshot = await getSnapshot(params.jobId);

  delete snapshot?.html;

  return res.json({
    code: 'ok',
    data: snapshot,
  });
});

export default router;
