import { DataTypes, Model, Sequelize } from '@sequelize/core';

export interface JobState {
  id: string;
  url: string;
  includeScreenshot?: boolean;
  includeHtml?: boolean;
  width?: number;
  height?: number;
  quality?: number;
  timeout?: number;
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

class Job extends Model<JobModel> implements JobModel {
  public id!: JobModel['id'];

  public queue!: JobModel['queue'];

  public job!: JobModel['job'];

  public retryCount!: JobModel['retryCount'];

  public willRunAt!: JobModel['willRunAt'];

  public delay!: JobModel['delay'];

  public cancelled!: JobModel['cancelled'];
}

export { Job };

export function initJobModel(sequelize: Sequelize) {
  Job.init(
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

  return Job;
}
