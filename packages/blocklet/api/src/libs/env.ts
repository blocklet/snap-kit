import env from '@blocklet/sdk/lib/env';

export default {
  ...env,
  chainHost: process.env.CHAIN_HOST || '',
  // 控制队列并发处理任务的数量
  queueConcurrency: Number(process.env.QUEUE_CONCURRENCY || 2),
  // 截图存储位置
  dataDir: process.env.DATA_DIR || './snapshots',
  // 保存截图文件的天数，超过此天数的文件将被自动清理
  retentionDays: Number(process.env.RETENTION_DAYS || 180),
  // redis 路径
  redisUrl: process.env.REDIS_URL || '',
};
