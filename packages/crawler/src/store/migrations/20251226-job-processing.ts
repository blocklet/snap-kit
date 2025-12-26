/* eslint-disable no-console */
import { DataTypes } from '@sequelize/core';

export async function up({ context }) {
  console.log('[20251226-job-processing:up] Migrating...');

  await context.addColumn('jobs', 'processingBy', {
    type: DataTypes.STRING(32),
    allowNull: true,
  });

  await context.addColumn('jobs', 'processingAt', {
    type: DataTypes.INTEGER,
    allowNull: true,
  });

  console.log('[20251226-job-processing:up] Migrated successfully!');
}

export async function down({ context }) {
  console.log('[20251226-job-processing:down] Migrating...');

  await context.removeColumn('jobs', 'processingBy');
  await context.removeColumn('jobs', 'processingAt');

  console.log('[20251226-job-processing:down] Migrated successfully!');
}
