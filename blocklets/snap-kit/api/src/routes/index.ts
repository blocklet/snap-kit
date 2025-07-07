import { crawlCode, crawlUrl, getLatestSnapshot, getSnapshot } from '@arcblock/crawler';
import { Joi } from '@arcblock/validator';
import { Router } from 'express';
import qs from 'querystring';

import { logger } from '../libs/logger';

const middlewares = require('@blocklet/sdk/lib/middlewares');

const router = Router();

router.use(middlewares.session({ accessKey: true }));

/**
 * Crawl page html
 */
const crawlSchema = Joi.object({
  url: Joi.string().uri().required(),
  headers: Joi.object().pattern(Joi.string(), Joi.string()).max(30),
  timeout: Joi.number().integer().min(10).max(120).default(120),
  waitTime: Joi.number().integer().min(0).max(120).default(0),
  cookies: Joi.array().items(Joi.object({ name: Joi.string().required(), value: Joi.string().required() })),
  localStorage: Joi.array().items(Joi.object({ key: Joi.string().required(), value: Joi.string().required() })),
  sync: Joi.boolean().default(false),
});
router.post('/crawl', middlewares.auth({ methods: ['accessKey'] }), async (req, res) => {
  const params = await crawlSchema.validateAsync(req.body);

  res.setTimeout(params.timeout * 1000, () => {
    if (!res.headersSent) {
      res.status(408).json({
        code: 'error',
        message: 'Request timeout',
      });
    }
  });

  const jobId = await crawlUrl(
    {
      ...params,
      timeout: params.timeout * 1000,
      waitTime: params.waitTime * 1000,
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

  logger.info('GET /crawl', { params, result: !!snapshot });

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
  format: Joi.string().valid('png', 'jpeg', 'webp').default('webp'),
  timeout: Joi.number().integer().min(0).max(120).default(120),
  waitTime: Joi.number().integer().min(0).max(120).default(0),
  fullPage: Joi.boolean().default(false),
  headers: Joi.object().pattern(Joi.string(), Joi.string()).max(30),
  cookies: Joi.array().items(Joi.object({ name: Joi.string().required(), value: Joi.string().required() })),
  localStorage: Joi.array().items(Joi.object({ key: Joi.string().required(), value: Joi.string().required() })),
  sync: Joi.boolean().default(false),
});
router.post('/snap', middlewares.auth({ methods: ['accessKey'] }), async (req, res) => {
  const params = await snapSchema.validateAsync(req.body);

  res.setTimeout(params.timeout * 1000, () => {
    if (!res.headersSent) {
      res.status(408).json({
        code: 'error',
        message: 'Request timeout',
      });
    }
  });

  const jobId = await crawlUrl(
    {
      ...params,
      timeout: params.timeout * 1000,
      waitTime: params.waitTime * 1000,
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

  logger.info('GET /snap', { params, result: !!snapshot });

  return res.json({
    code: 'ok',
    data: snapshot,
  });
});

// Joi schema for /carbon endpoint, supporting all params from the Carbon URL
const carbonSchema = Joi.object({
  bg: Joi.string().default('rgba(171, 184, 195, 1)'),
  t: Joi.string().default('one-dark'),
  wt: Joi.string().default('none'),
  l: Joi.string().default('auto'),
  width: Joi.number().default(680),
  ds: Joi.string().default('true'),
  dsyoff: Joi.string().default('20px'),
  dsblur: Joi.string().default('68px'),
  wc: Joi.string().default('true'),
  wa: Joi.string().default('true'),
  pv: Joi.string().default('21px'),
  ph: Joi.string().default('19px'),
  ln: Joi.string().default('false'),
  fl: Joi.string().default('1'),
  fm: Joi.string().default('Hack'),
  fs: Joi.string().default('14px'),
  lh: Joi.string().default('133%'),
  si: Joi.string().default('false'),
  es: Joi.string().default('2x'),
  wm: Joi.string().default('false'),
  code: Joi.string().required(),
  format: Joi.string().valid('png', 'jpeg', 'webp').default('png'),
  sync: Joi.boolean().default(false),
  timeout: Joi.number().integer().min(0).max(120).default(120),
});

router.post('/carbon', middlewares.auth({ methods: ['accessKey'] }), async (req, res) => {
  const params = await carbonSchema.validateAsync(req.body);
  const { sync, timeout, ...carbonParams } = params;

  const url = `https://carbon.now.sh/?${qs.stringify(carbonParams)}`;

  res.setTimeout(params.timeout * 1000, () => {
    if (!res.headersSent) {
      res.status(408).json({
        code: 'error',
        message: 'Request timeout',
      });
    }
  });

  const jobId = await crawlCode(
    {
      url,
      sync,
      timeout: params.timeout * 1000,
      format: params.format,
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

const carbonGetSchema = Joi.object({
  jobId: Joi.string().required(),
});
router.get('/carbon', middlewares.auth({ methods: ['accessKey'] }), async (req, res) => {
  const params = await carbonGetSchema.validateAsync(req.query);
  const snapshot = await getSnapshot(params.jobId);

  delete snapshot?.html;

  logger.info('GET /carbon', { params, result: !!snapshot });

  return res.json({
    code: 'ok',
    data: snapshot,
  });
});

export default router;
