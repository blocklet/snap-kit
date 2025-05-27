import { utils } from '@arcblock/crawler';
import { LRUCache } from 'lru-cache';
import { joinURL } from 'ufo';

import { logger } from './env';
import { Snapshot, SnapshotModel, initDatabase } from './store/index';

export type CacheManagerOptions = {
  /** SnapKit endpoint */
  endpoint: string;
  /** SnapKit access key */
  accessKey: string;
  /** Max cache size for LRU cache */
  cacheMax?: number;
  /**
   * Cache update interval
   * When cache exceeds this time, it will try to fetch and update cache from SnapKit
   */
  cacheUpdateInterval?: number;
};

export class CacheManager {
  private options: Required<CacheManagerOptions>;

  private cache: LRUCache<string, SnapshotModel>;

  private initializedPromise: Promise<void[]>;

  constructor(options: CacheManagerOptions) {
    this.options = {
      cacheMax: 500,
      cacheUpdateInterval: 1000 * 60 * 60 * 24,
      ...options,
    };
    this.cache = new LRUCache({ max: options.cacheMax || 500 });
    this.initializedPromise = Promise.all([initDatabase()]);
  }

  public async waitReady() {
    await this.initializedPromise;
  }

  public async getSnapshot(url: string) {
    const cachedSnapshot = this.cache.get(url);
    if (cachedSnapshot) {
      return cachedSnapshot;
    }

    const snapshot = await Snapshot.findOne({ where: { url } });
    if (snapshot) {
      this.cache.set(url, snapshot);
      return snapshot;
    }

    return null;
  }

  public async setSnapshot(url: string, snapshot: SnapshotModel) {
    this.cache.set(url, snapshot);
    await Snapshot.create(snapshot);
  }

  public async fetchSnapKit(url: string) {
    const { endpoint, accessKey } = this.options;
    const api = joinURL(endpoint, 'api/crawl');

    logger.debug('Fetching snapshot from SnapKit', { url, api });

    try {
      const { data } = await utils.axios.get(api, {
        params: {
          url,
        },
        headers: {
          Authorization: `Bearer ${accessKey}`,
        },
      });

      const { data: snapshotData } = data || {};

      if (snapshotData?.status !== 'success') {
        logger.info(`No valid HTML found for ${url} from SnapKit`, { snapshotData, data });
        return null;
      }

      logger.info('Success to fetch content by SnapKit and cache it', {
        url,
        jobId: snapshotData.jobId,
        lastModified: snapshotData.lastModified,
      });

      return snapshotData;
    } catch (error) {
      logger.error('Failed to fetch content by SnapKit', { url, error });
      return null;
    }
  }

  public async isCacheExpired(url: string) {
    const snapshot = await this.getSnapshot(url);
    if (!snapshot) {
      return true;
    }
    return Date.now() - new Date(snapshot.createdAt!).getTime() > this.options.cacheUpdateInterval;
  }

  public async updateSnapshot(url: string) {
    try {
      const snapshot = await this.fetchSnapKit(url);
      if (snapshot) {
        // update db
        const [updatedSnapshot] = await Snapshot.upsert({
          url,
          html: snapshot.html,
          lastModified: snapshot.lastModified,
        });
        // update cache
        this.cache.set(url, updatedSnapshot);
      }
    } catch (error) {
      logger.error('Failed to update snapshot', { url, error });
    }
  }
}
