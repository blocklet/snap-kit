/* eslint-disable no-console */
import path from 'path';
import { rimrafSync } from 'rimraf';

console.log('clean .blocklet and dist folder');
rimrafSync('.blocklet');
rimrafSync('dist');
rimrafSync(path.join('api', 'dist'));
console.log('clean .blocklet and dist folder done!');
