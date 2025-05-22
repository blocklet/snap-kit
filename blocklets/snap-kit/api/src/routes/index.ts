import { createCrawlJob, formatSnapshot, getSnapshot } from '@arcblock/crawler';
import { Joi } from '@arcblock/validator';
import { Router } from 'express';

const middlewares = require('@blocklet/sdk/lib/middlewares');

const router = Router();

router.use(middlewares.session({ accessKey: true }));

const crawlSchema = Joi.object({
  url: Joi.string().uri().required(),
  html: Joi.boolean().default(true),
  screenshot: Joi.boolean().default(false),
  width: Joi.number().integer().min(375).default(1440),
  height: Joi.number().integer().min(500).default(900),
  quality: Joi.number().integer().min(1).max(100).default(80),
  timeout: Joi.number().integer().min(10).max(120).default(120),
  sync: Joi.boolean().default(false),
});

router.post('/crawl', middlewares.auth({ methods: ['accessKey'] }), async (req, res) => {
  const params = await crawlSchema.validateAsync(req.body);
  params.timeout = params.timeout * 1000;

  let id: string;

  setTimeout(() => {
    if (!res.headersSent) {
      res.status(408).json({
        code: 'timeout',
        data: { id },
      });
    }
  }, params.timeout);

  id = await createCrawlJob(params, async (snapshot) => {
    if (params.sync && !res.headersSent) {
      res.json({
        code: 'ok',
        data: snapshot ? await formatSnapshot(snapshot) : null,
      });
    }
  });

  if (!params.sync) {
    res.json({
      code: 'ok',
      data: { id },
    });
  }
});

const snapshotSchema = Joi.object({
  id: Joi.string().required(),
  html: Joi.boolean().default(true),
  screenshot: Joi.boolean().default(true),
});

router.get('/snapshot', middlewares.auth({ methods: ['accessKey'] }), async (req, res) => {
  const params = await snapshotSchema.validateAsync(req.query);
  const snapshot = await getSnapshot(params.id);

  if (snapshot) {
    if (!params.html) {
      delete snapshot.html;
    }
    if (!params.screenshot) {
      delete snapshot.screenshot;
    }
  }

  return res.json({
    code: 'ok',
    data: snapshot ? await formatSnapshot(snapshot) : null,
  });
});

export default router;
