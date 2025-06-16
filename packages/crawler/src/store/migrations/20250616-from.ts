/* eslint-disable no-console */
import { DataTypes } from '@sequelize/core';

export async function up({ context }) {
  console.log('[20250616-from:up] Migrating...');

  await context.addColumn('snap', 'from', {
    type: DataTypes.STRING,
    allowNull: true,
  });
  await context.addIndex('snap', ['createdAt']);
  await context.addIndex('snap', ['updatedAt']);

  console.log('[20250616-from:up] Migrated successfully!');
}

export async function down({ context }) {
  console.log('[20250616-from:down] Migrating...');
  await context.removeColumn('snap', 'from');
  await context.removeIndex('snap', ['createdAt']);
  await context.removeIndex('snap', ['updatedAt']);
  console.log('[20250616-from:down] Migrated successfully!');
}
