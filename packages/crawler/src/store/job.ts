import sequelize, { DataTypes, Model, Sequelize } from '@sequelize/core';

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
}
