import { Sequelize } from '@sequelize/core';
import { SqliteDialect } from '@sequelize/sqlite3';

import { env, logger } from '../env';
import { Snapshot } from './model-snapshot';

export * from './model-snapshot';

let sequelize: Sequelize;

export async function initDatabase() {
  sequelize = new Sequelize({
    dialect: SqliteDialect,
    storage: env.databasePath,
    logging: (msg) => process.env.SQLITE_LOG && logger.debug(msg),
  });

  Snapshot.initModel(sequelize);

  try {
    await Promise.all([
      sequelize.query('pragma journal_mode = WAL;'),
      sequelize.query('pragma synchronous = normal;'),
      sequelize.query('pragma journal_size_limit = 67108864;'),
    ]);
    await sequelize.authenticate();
    await sequelize.sync();
    logger.info('Successfully connected to database');
  } catch (error) {
    logger.error('Failed to connect to database:', error);
    throw error;
  }
}
