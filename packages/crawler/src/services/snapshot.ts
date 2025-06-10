import cloneDeep from 'lodash/cloneDeep';
import pick from 'lodash/pick';
import fs from 'node:fs/promises';
import path from 'node:path';
import { joinURL } from 'ufo';

import { config } from '../config';
import { Job, JobState } from '../store/job';
import { Snapshot, SnapshotModel } from '../store/snapshot';
import { formatUrl } from '../utils';

export function convertJobToSnapshot({ job, snapshot }: { job: JobState; snapshot?: Partial<SnapshotModel> }) {
  return {
    jobId: job.jobId || job.id,
    url: job.url,
    lastModified: job.lastModified || new Date().toISOString(),
    options: {
      width: job.width,
      height: job.height,
      includeScreenshot: job.includeScreenshot,
      includeHtml: job.includeHtml,
      quality: job.quality,
      fullPage: job.fullPage,
    },
    ...snapshot,
  } as SnapshotModel;
}

export async function formatSnapshot(snapshot: SnapshotModel, columns?: Array<keyof SnapshotModel>) {
  let data = cloneDeep(snapshot);

  // format screenshot path to full url
  if (data.screenshot) {
    data.screenshot = joinURL(config.appUrl, data.screenshot);
  }
  // format html path to string
  if (data.html) {
    const html = await fs.readFile(path.join(config.dataDir, data.html));
    data.html = html.toString();
  }
  // remove sensitive options that should not be returned
  if (data.options) {
    delete data.options.cookies;
    delete data.options.localStorage;
    delete data.options.headers;
  }

  if (columns?.length) {
    data = pick(data, columns);
  }

  return data;
}

/**
 * get snapshot from db or crawl queue
 */
export async function getSnapshot(jobId: string) {
  const snapshot = await Snapshot.findSnapshot({ where: { jobId } });
  if (snapshot) {
    return formatSnapshot(snapshot);
  }

  const job = await Job.findJob({ id: jobId });
  if (job) {
    return {
      jobId,
      status: 'pending',
    } as SnapshotModel;
  }

  return null;
}

export async function getLatestSnapshot(url: string) {
  const snapshot = await Snapshot.findSnapshot({
    where: {
      url: formatUrl(url),
      status: 'success',
    },
  });

  return snapshot ? formatSnapshot(snapshot) : null;
}
