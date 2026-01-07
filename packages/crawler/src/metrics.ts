import { Counter, Gauge, Histogram, Registry } from 'prom-client';

import { Job } from './store';

// Create a new registry
const register = new Registry();

// ========== Counter - 爬取任务计数 ==========
export const jobsTotal = new Counter({
  name: 'crawler_jobs_total',
  help: 'Total number of crawl jobs processed',
  labelNames: ['queue', 'status'] as const,
  registers: [register],
});

// ========== Counter - 入队任务数 ==========
export const jobsEnqueuedTotal = new Counter({
  name: 'crawler_jobs_enqueued_total',
  help: 'Total number of crawl jobs enqueued',
  labelNames: ['queue'] as const,
  registers: [register],
});

// ========== Histogram - 任务执行耗时 ==========
export const jobDurationSeconds = new Histogram({
  name: 'crawler_job_duration_seconds',
  help: 'Duration of crawl job execution in seconds',
  labelNames: ['queue', 'status'] as const,
  buckets: [10, 30, 60, 120, 300, 600, 900, 1800, 3600],
  registers: [register],
});

// ========== Histogram - 入队到完成总耗时 ==========
export const jobTotalLatencySeconds = new Histogram({
  name: 'crawler_job_total_latency_seconds',
  help: 'Total latency from enqueue to completion in seconds',
  labelNames: ['queue', 'status'] as const,
  buckets: [10, 30, 60, 120, 300, 600, 900, 1800, 3600],
  registers: [register],
});

// ========== Gauge - 队列大小 ==========
export const queueSize = new Gauge({
  name: 'crawler_queue_size',
  help: 'Current number of jobs in queue',
  labelNames: ['queue'] as const,
  registers: [register],
});

/**
 * Collect all metrics by querying database
 */
export async function collectMetrics() {
  try {
    // 收集队列大小
    const jobStats = await Job.stats();
    // Reset first to clear queues that no longer have jobs
    queueSize.reset();
    jobStats.queues.forEach((q) => {
      queueSize.set({ queue: q.queue }, q.count);
    });
  } catch (error) {
    console.error('Error collecting metrics:', error);
  }
}

/**
 * Get metrics in Prometheus format
 */
export async function getMetrics() {
  await collectMetrics();
  return register.metrics();
}

/**
 * Get content type for metrics endpoint
 */
export function getContentType() {
  return register.contentType;
}
