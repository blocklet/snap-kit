import { CookieParam } from '@blocklet/puppeteer';
import { DataTypes, FindOptions, Model, Sequelize } from '@sequelize/core';

export interface SnapshotModel {
  jobId: string;
  url: string;
  status: 'success' | 'failed' | 'pending';
  html?: string | null;
  screenshot?: string | null;
  error?: string;
  lastModified?: string;
  replace?: boolean;
  meta?: {
    title?: string;
    description?: string;
  };
  options?: {
    width?: number;
    height?: number;
    includeScreenshot?: boolean;
    includeHtml?: boolean;
    quality?: number;
    fullPage?: boolean;
    headers?: Record<string, string>;
    cookies?: CookieParam[];
    localStorage?: { key: string; value: string }[];
  };
}

export class Snapshot extends Model<SnapshotModel> implements SnapshotModel {
  public jobId!: SnapshotModel['jobId'];

  public url!: SnapshotModel['url'];

  public status!: SnapshotModel['status'];

  public html?: SnapshotModel['html'];

  public screenshot?: SnapshotModel['screenshot'];

  public error?: SnapshotModel['error'];

  public lastModified?: SnapshotModel['lastModified'];

  public replace?: SnapshotModel['replace'];

  public meta?: SnapshotModel['meta'];

  public options!: SnapshotModel['options'];

  static initModel(sequelize: Sequelize) {
    return Snapshot.init(
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
          type: DataTypes.ENUM('success', 'failed', 'pending'),
          allowNull: false,
          index: true,
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
        replace: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: false,
          index: true,
        },
        meta: {
          type: DataTypes.JSON,
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
  }

  static async findSnapshot(condition: FindOptions<SnapshotModel>) {
    const snapshot = await Snapshot.findOne({
      order: [
        ['lastModified', 'DESC'],
        ['updatedAt', 'DESC'],
      ],
      ...condition,
    });
    return snapshot?.toJSON() || null;
  }
}
