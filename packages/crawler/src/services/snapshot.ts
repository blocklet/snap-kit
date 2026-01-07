import { Transaction, WhereOptions } from '@sequelize/core';
import cloneDeep from 'lodash/cloneDeep';
import pick from 'lodash/pick';
import fs from 'node:fs/promises';
import path from 'node:path';
import { joinURL } from 'ufo';

import { config, logger } from '../config';
import { Job, JobState, Snapshot, SnapshotModel } from '../store';
import { formatUrl } from '../utils';

export function convertJobToSnapshot({ job, snapshot }: { job: JobState; snapshot?: Partial<SnapshotModel> }) {
  return {
    jobId: job.jobId || job.id,
    url: job.url,
    lastModified: job.lastModified || new Date().toISOString(),
    replace: job.replace,
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
    try {
      const html = await fs.readFile(path.join(config.dataDir, data.html));
      data.html = html.toString();
    } catch (err: any) {
      logger.error('Failed to read html', {
        err,
        dataDir: config.dataDir,
        snapshot,
      });

      // If the file is missing, delete the invalid snapshot record
      if (err?.code === 'ENOENT') {
        logger.warn('HTML file missing, deleting invalid snapshot record', { jobId: snapshot.jobId });
        await Snapshot.destroy({ where: { jobId: snapshot.jobId } });
        return null;
      }

      data.html = '';
    }
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
    order: [
      ['lastModified', 'DESC'],
      ['updatedAt', 'DESC'],
    ],
  });

  return snapshot ? formatSnapshot(snapshot) : null;
}

export async function deleteSnapshots(where: WhereOptions<SnapshotModel>, { txn }: { txn?: Transaction } = {}) {
  const snapshots = await Snapshot.findAll({
    where,
    order: [
      ['lastModified', 'DESC'],
      ['updatedAt', 'DESC'],
    ],
  });

  const jobIds = await Promise.all(
    snapshots.map(async (snapshot) => {
      try {
        // Check reference count before deleting files
        // Only delete file if no other snapshots reference it
        const deleteFilePromises: Promise<void>[] = [];

        if (snapshot.html) {
          const htmlRefCount = await Snapshot.count({ where: { html: snapshot.html } });
          if (htmlRefCount <= 1) {
            deleteFilePromises.push(fs.unlink(path.join(config.dataDir, snapshot.html)).catch(() => {}));
          }
        }

        if (snapshot.screenshot) {
          const screenshotRefCount = await Snapshot.count({ where: { screenshot: snapshot.screenshot } });
          if (screenshotRefCount <= 1) {
            deleteFilePromises.push(fs.unlink(path.join(config.dataDir, snapshot.screenshot)).catch(() => {}));
          }
        }

        try {
          await Promise.all(deleteFilePromises);
        } catch (err) {
          logger.error('Failed to delete snapshot files', { err, snapshot, dataDir: config.dataDir });
        }

        await snapshot.destroy({ transaction: txn });
        return snapshot.jobId;
      } catch (error) {
        logger.error('Failed to delete snapshot', { error, snapshot });
        throw error;
      }
    }),
  );

  return jobIds.filter(Boolean);
}
