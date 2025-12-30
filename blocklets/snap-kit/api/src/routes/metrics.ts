import { getContentType, getMetrics } from '@arcblock/crawler';
import { Router } from 'express';

const router = Router();

router.get('/', async (_req, res) => {
  const metrics = await getMetrics();
  res.set('Content-Type', getContentType());
  res.end(metrics);
});

export default router;
