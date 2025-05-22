import dotenv from 'dotenv-flow';

import { app, server } from './src';

dotenv.config();

import('vite-plugin-blocklet').then(({ setupClient }) => {
  setupClient(app, {
    server,
  });
});
