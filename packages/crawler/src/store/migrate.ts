/* eslint-disable global-require */
import { SequelizeStorage, Umzug } from 'umzug';

import { sequelize } from './index';
import * as migration20250615 from './migrations/20250615-genesis';
import * as migration20250616 from './migrations/20250616-from';

const umzug = new Umzug({
  migrations: [
    {
      name: '20250615-genesis',
      up: ({ context }) => migration20250615.up({ context }),
      down: ({ context }) => migration20250615.down({ context }),
    },
    {
      name: '20250616-from',
      up: ({ context }) => migration20250616.up({ context }),
      down: ({ context }) => migration20250616.down({ context }),
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
