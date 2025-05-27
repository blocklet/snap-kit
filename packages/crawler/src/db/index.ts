import { Sequelize } from '@sequelize/core';
import { SqliteDialect } from '@sequelize/sqlite3';
import path from 'path';

import { config, logger } from '../config';
import { initJobModel } from './job';
import { initSnapshotModel } from './snapshot';

export async function ensureDatabase() {
  const sequelize = new Sequelize({
    dialect: SqliteDialect,
    storage: path.join(config.dataDir, 'snap-kit.db'),
    logging: (msg) => process.env.SQLITE_LOG && logger.debug(msg),
  });

  await initSnapshotModel(sequelize);
  await initJobModel(sequelize);

  try {
    await sequelize.authenticate();
    await sequelize.sync();
    logger.info('Successfully connected to database');
  } catch (error) {
    logger.error('Failed to connect to database:', error);
    throw error;
  }
}
