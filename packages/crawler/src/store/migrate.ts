/* eslint-disable global-require */
import { SequelizeStorage, Umzug } from 'umzug';

import { sequelize } from './index';
import * as migration20250615 from './migrations/20250615-genesis';
import * as migration20250616Replace from './migrations/20250616-replace';
import * as migration20251226JobProcessing from './migrations/20251226-job-processing';

const umzug = new Umzug({
  migrations: [
    {
      name: '20250615-genesis',
      up: ({ context }) => migration20250615.up({ context }),
      down: ({ context }) => migration20250615.down({ context }),
    },
    {
      name: '20250616-replace',
      up: ({ context }) => migration20250616Replace.up({ context }),
      down: ({ context }) => migration20250616Replace.down({ context }),
    },
    {
      name: '20251226-job-processing',
      up: ({ context }) => migration20251226JobProcessing.up({ context }),
      down: ({ context }) => migration20251226JobProcessing.down({ context }),
    },
  ],
  context: sequelize.getQueryInterface(),
  storage: new SequelizeStorage({ sequelize }),
  logger: console,
});

export function migrate() {
  return umzug.up();
}

export { umzug };
