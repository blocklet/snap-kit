import AuthStorage from '@arcblock/did-auth-storage-nedb';
import { getWallet } from '@blocklet/sdk/lib/wallet';
import { WalletAuthenticator } from '@blocklet/sdk/lib/wallet-authenticator';
import { WalletHandlers } from '@blocklet/sdk/lib/wallet-handler';
import path from 'path';

import env from './env';

export const wallet: any = getWallet();
export const authenticator = new WalletAuthenticator();
export const handlers = new WalletHandlers({
  authenticator,
  tokenStorage: new AuthStorage({
    dbPath: path.join(env.dataDir, 'auth.db'),
  }),
});
