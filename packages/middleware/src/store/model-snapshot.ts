import { DataTypes, Model, Sequelize } from '@sequelize/core';

export interface SnapshotModel {
  url: string;
  html: string;
  lastModified?: string;
  createdAt?: string;
  updatedAt?: string;
}

export class Snapshot extends Model<SnapshotModel> implements SnapshotModel {
  declare url: SnapshotModel['url'];

  declare html: SnapshotModel['html'];

  declare lastModified?: SnapshotModel['lastModified'];

  declare createdAt: SnapshotModel['createdAt'];

  declare updatedAt: SnapshotModel['updatedAt'];

  static initModel(sequelize: Sequelize) {
    Snapshot.init(
      {
        url: {
          type: DataTypes.STRING,
          allowNull: false,
          primaryKey: true,
        },
        html: {
          type: DataTypes.TEXT,
          allowNull: false,
        },
        lastModified: {
          type: DataTypes.STRING,
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
}
