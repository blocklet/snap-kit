import { createCrawlJob, getSnapshot } from '@arcblock/crawler';
import { Joi } from '@arcblock/validator';
import { env } from '@blocklet/sdk/lib/config';
import { Router } from 'express';
import fs from 'fs/promises';
import path from 'path';
import { joinURL } from 'ufo';

const router = Router();

const crawlSchema = Joi.object({
  url: Joi.string().uri().required(),
  html: Joi.boolean().default(true),
  screenshot: Joi.boolean().default(true),
  width: Joi.number().integer().min(375).default(1440),
  height: Joi.number().integer().min(500).default(900),
});

router.post('/crawl', async (req, res) => {
  const params = await crawlSchema.validateAsync(req.body);

  await createCrawlJob(params);

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

  const snapshot = await getSnapshot(url);

  if (snapshot) {
    // format screenshot path to fullpath
    if (snapshot.screenshot) {
      snapshot.screenshot = joinURL(env.appUrl, snapshot?.screenshot);
    }
    // format html path to string
    if (snapshot.html) {
      const html = await fs.readFile(path.join(env.dataDir, snapshot.html));
      snapshot.html = html.toString();
    }
  }

  return res.json({
    code: 'ok',
    data: snapshot,
  });
});

export default router;
