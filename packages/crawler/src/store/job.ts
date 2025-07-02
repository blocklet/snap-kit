import { CookieParam } from '@blocklet/puppeteer';
import sequelize, { DataTypes, Model, Sequelize } from '@sequelize/core';
import isEqual from 'lodash/isEqual';

export interface JobState {
  id?: string;
  jobId: string;
  url: string;
  includeScreenshot?: boolean;
  includeHtml?: boolean;
  width?: number;
  height?: number;
  quality?: number;
  timeout?: number;
  fullPage?: boolean;
  lastModified?: string;
  waitTime?: number;
  replace?: boolean;
  sync?: boolean;
  ignoreRobots?: boolean;
  headers?: Record<string, string>;
  cookies?: CookieParam[];
  localStorage?: { key: string; value: string }[];
}

export interface JobModel {
  id: string;
  queue: string;
  job: JobState;
  retryCount: number;
  willRunAt: number;
  delay: number;
  cancelled: boolean;
}

export class Job extends Model<JobModel> implements JobModel {
  public id!: JobModel['id'];

  public queue!: JobModel['queue'];

  public job!: JobModel['job'];

  public retryCount!: JobModel['retryCount'];

  public willRunAt!: JobModel['willRunAt'];

  public delay!: JobModel['delay'];

  public cancelled!: JobModel['cancelled'];

  static initModel(sequelize: Sequelize) {
    return Job.init(
      {
        id: {
          type: DataTypes.STRING(40),
          primaryKey: true,
        },
        queue: {
          type: DataTypes.STRING(32),
          allowNull: false,
        },
        job: {
          type: DataTypes.JSON,
          allowNull: false,
        },
        retryCount: {
          type: DataTypes.INTEGER,
        },
        delay: {
          type: DataTypes.INTEGER,
        },
        willRunAt: {
          type: DataTypes.INTEGER,
        },
        cancelled: {
          type: DataTypes.BOOLEAN,
          defaultValue: false,
        },
        createdAt: {
          type: DataTypes.DATE,
          defaultValue: DataTypes.NOW,
          index: true,
        },
        updatedAt: {
          type: DataTypes.DATE,
          defaultValue: DataTypes.NOW,
          index: true,
        },
      },
      {
        sequelize,
        indexes: [{ fields: ['queue'] }],
        modelName: 'job',
        tableName: 'jobs',
        timestamps: true,
      },
    );
  }

  static async findJob(condition: Partial<JobState>) {
    const where = Object.keys(condition)
      .filter((key) => condition[key] !== undefined)
      .map((key) => {
        return sequelize.where(sequelize.fn('json_extract', sequelize.col('job'), `$.${key}`), condition[key]);
      });

    const job = await Job.findOne({
      where: {
        [sequelize.Op.and]: where,
      },
      order: [['createdAt', 'DESC']],
    });

    return job?.toJSON() || null;
  }

  static async isExists(condition: Partial<JobState> & { url: string }) {
    const jobs = await Job.findAll({
      where: sequelize.where(sequelize.fn('json_extract', sequelize.col('job'), '$.url'), condition.url),
    });

    if (!jobs?.length) {
      return null;
    }

    const existsJob = jobs.find((job) => {
      const jobModel = job.get('job');
      return Object.keys(condition).every((key) => {
        return isEqual(condition[key], jobModel[key]);
      });
    });

    return existsJob?.get();
  }
}
