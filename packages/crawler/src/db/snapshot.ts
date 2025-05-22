import { DataTypes, Model, Sequelize } from '@sequelize/core';

interface SnapshotModel {
  jobId: string;
  url: string;
  status: 'success' | 'failed' | 'pending';
  html?: string | null;
  screenshot?: string | null;
  error?: string;
  lastModified?: string;
  options?: {
    width?: number;
    height?: number;
    includeScreenshot?: boolean;
    includeHtml?: boolean;
    quality?: number;
    fullPage?: boolean;
  };
}

class Snapshot extends Model<SnapshotModel> implements SnapshotModel {
  public jobId!: SnapshotModel['jobId'];

  public url!: SnapshotModel['url'];

  public status!: SnapshotModel['status'];

  public html?: SnapshotModel['html'];

  public screenshot?: SnapshotModel['screenshot'];

  public error?: SnapshotModel['error'];

  public lastModified?: SnapshotModel['lastModified'];

  public options!: SnapshotModel['options'];
}

export { Snapshot };
export type { SnapshotModel };

export function initSnapshotModel(sequelize: Sequelize) {
  Snapshot.init(
    {
      jobId: {
        type: DataTypes.STRING,
        primaryKey: true,
        allowNull: false,
      },
      url: {
        type: DataTypes.STRING,
        allowNull: false,
        index: true,
      },
      status: {
        type: DataTypes.ENUM('success', 'failed'),
        allowNull: false,
      },
      html: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      screenshot: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      error: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      lastModified: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      options: {
        type: DataTypes.JSON,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: 'snapshot',
      tableName: 'snap',
      timestamps: true,
    },
  );

  return Snapshot;
}
