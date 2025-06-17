/* eslint-disable no-console */
import { DataTypes } from '@sequelize/core';

export async function up({ context }) {
  console.log('[20250616-replace:up] Migrating...');

  await context.addColumn('snap', 'replace', {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    index: true,
  });
  await context.addIndex('snap', ['createdAt']);
  await context.addIndex('snap', ['updatedAt']);
  await context.addIndex('snap', ['status']);

  console.log('[20250616-replace:up] Migrated successfully!');
}

export async function down({ context }) {
  console.log('[20250616-replace:down] Migrating...');
  await context.removeColumn('snap', 'replace');
  await context.removeIndex('snap', ['createdAt']);
  await context.removeIndex('snap', ['updatedAt']);
  await context.removeIndex('snap', ['status']);
  console.log('[20250616-replace:down] Migrated successfully!');
}
