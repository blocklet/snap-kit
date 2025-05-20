import { DataTypes, Model, Sequelize } from '@sequelize/core';

interface SnapshotAttributes {
  id?: number;
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
  };
}

class Snapshot extends Model<SnapshotAttributes> implements SnapshotAttributes {
  public id!: SnapshotAttributes['id'];

  public url!: SnapshotAttributes['url'];

  public status!: SnapshotAttributes['status'];

  public html?: SnapshotAttributes['html'];

  public screenshot?: SnapshotAttributes['screenshot'];

  public error?: SnapshotAttributes['error'];

  public lastModified?: SnapshotAttributes['lastModified'];

  public options!: SnapshotAttributes['options'];
}

export { Snapshot };

export function initSnapshotModel(sequelize: Sequelize) {
  Snapshot.init(
    {
      id: {
        type: DataTypes.STRING,
        primaryKey: true,
      },
      url: {
        type: DataTypes.STRING,
        allowNull: false,
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
      tableName: 'snapshot',
      timestamps: true,
    },
  );

  return Snapshot;
}
