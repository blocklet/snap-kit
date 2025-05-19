import { crawlQueue, crawlUrl, getUrlInfoFromCache } from '@arcblock/crawler/src/crawler';
import { Joi } from '@arcblock/validator';
import { Router } from 'express';

const router = Router();

const crawlSchema = Joi.object({
  url: Joi.string().uri().required(),
  html: Joi.boolean().default(true),
  screenshot: Joi.boolean().default(false),
  viewport: Joi.object({
    width: Joi.number().integer().min(375).default(1440),
    height: Joi.number().integer().min(500).default(900),
  }).default({ width: 1440, height: 900 }),
});

router.post('/crawl', async (req, res) => {
  try {
    const { url, screenshot, viewport } = await crawlSchema.validateAsync(req.body);

    await crawlUrl({
      urls: url,
      takeScreenshot: screenshot,
      viewport,
    });

    return res.json({
      code: 'ok',
      data: {},
    });
  } catch (error: any) {
    return res.json({
      code: 'error',
      message: error.message || 'Failed to add URL to crawl queue',
      data: null,
    });
  }
});

const snapshotSchema = Joi.object({
  url: Joi.string().uri().required(),
});

router.get('/snapshot', async (req, res) => {
  try {
    // 验证请求参数
    const { error, value } = snapshotSchema.validate(req.query);
    if (error) {
      return res.json({
        code: 'error',
        message: error.message,
        data: null,
      });
    }
    const { url } = value;

    // 从缓存中获取URL信息
    const snapshot = await getUrlInfoFromCache(url);

    if (!snapshot) {
      // 检查队列中是否有该URL的任务
      try {
        // 获取队列中的所有任务
        const jobs = await crawlQueue.getJobs();

        // 检查是否有匹配的URL任务
        const hasMatchingJob = jobs.some((job) => job.data && job.data.url === url);
        if (hasMatchingJob) {
          // 如果队列中有该URL的任务，返回PROCESSING状态
          return res.json({
            code: 'ok',
            data: {
              url,
              lastModified: new Date().toISOString(),
              status: 1, // PROCESSING
            },
          });
        }
      } catch (error) {
        console.error('Error checking queue status:', error);
      }

      // 如果缓存和队列中都没有找到，返回null
      return res.json({
        code: 'ok',
        data: null,
      });
    }

    // 返回快照信息
    return res.json({
      code: 'ok',
      data: {
        url,
        html: snapshot.html,
        screenshot: snapshot.screenshot,
        lastModified: snapshot.lastModified || new Date().toISOString(),
        status: 2, // COMPLETED
      },
    });
  } catch (error: any) {
    return res.json({
      code: 'error',
      message: error.message || 'Failed to get snapshot',
      data: null,
    });
  }
});

export default router;
