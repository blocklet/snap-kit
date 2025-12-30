import { Job } from '@arcblock/crawler';
import { Joi } from '@arcblock/validator';
import { auth, session } from '@blocklet/sdk/lib/middlewares';
import { Router } from 'express';

import { logger } from '../libs/logger';

const router = Router();

/**
 * Admin API: Get job queue stats
 */
router.get('/jobs/stats', session({ accessKey: true }), auth({ roles: ['admin', 'owner'] }), async (_, res) => {
  const result = await Job.stats();

  logger.info('GET /admin/jobs/stats', result);

  return res.json({
    code: 'ok',
    data: result,
  });
});

/**
 * Admin API: Get job list with pagination
 */
const jobsSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  pageSize: Joi.number().integer().min(1).max(100).default(20),
  queue: Joi.string(),
});
router.get('/jobs', session({ accessKey: true }), auth({ roles: ['admin', 'owner'] }), async (req, res) => {
  const params = await jobsSchema.validateAsync(req.query);
  const result = await Job.paginate(params);

  logger.info('GET /admin/jobs', { params, total: result.total });

  return res.json({
    code: 'ok',
    data: result,
  });
});

/**
 * Admin API: Delete jobs by queue name or job ids
 */
const deleteJobsSchema = Joi.object({
  queue: Joi.string(),
  ids: Joi.array().items(Joi.string()),
}).or('queue', 'ids');
router.delete('/jobs', session({ accessKey: true }), auth({ roles: ['admin', 'owner'] }), async (req, res) => {
  const params = await deleteJobsSchema.validateAsync(req.body);

  let result;
  if (params.queue) {
    result = await Job.deleteByQueue(params.queue);
    logger.info('DELETE /admin/jobs by queue', { queue: params.queue, ...result });
  } else {
    result = await Job.deleteByIds(params.ids);
    logger.info('DELETE /admin/jobs by ids', { count: params.ids.length, ...result });
  }

  return res.json({
    code: 'ok',
    data: result,
  });
});

export default router;
