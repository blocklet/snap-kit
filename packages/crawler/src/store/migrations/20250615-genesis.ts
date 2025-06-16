/* eslint-disable no-console */
import { DataTypes } from '@sequelize/core';

export async function up({ context }) {
  console.log('[20250615-genesis:up] Migrating...');

  await context.createTable('snap', {
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
    meta: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    options: {
      type: DataTypes.JSON,
      allowNull: true,
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
  });

  await context.createTable('jobs', {
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
  });

  console.log('[20250615-genesis:up] Migrated successfully!');
}

export async function down({ context }) {
  console.log('[20250615-genesis:down] Migrating...');

  await context.dropTable('snap');
  await context.dropTable('jobs');

  console.log('[20250615-genesis:down] Migrated successfully!');
}
