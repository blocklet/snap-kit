import { Sequelize } from '@sequelize/core';
import { SqliteDialect } from '@sequelize/sqlite3';
import path from 'path';

import { config, logger } from '../config';
import { Job } from './job';
import { Snapshot } from './snapshot';

const sequelize = new Sequelize({
  dialect: SqliteDialect,
  storage: path.join(config.dataDir, 'snap-kit.db'),
  logging: (msg) => process.env.SQLITE_LOG && logger.debug(msg),
  pool: {
    min: 0,
    max: 10,
    idle: 10000,
  },
  retry: {
    match: [/SQLITE_BUSY/],
    name: 'query',
    max: 10,
  },
});

sequelize.query('pragma journal_mode = WAL;');
sequelize.query('pragma synchronous = normal;');
sequelize.query('pragma journal_size_limit = 67108864;');

Job.initModel(sequelize);
Snapshot.initModel(sequelize);

export { sequelize, Job, Snapshot };
