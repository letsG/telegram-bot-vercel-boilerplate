import { Telegraf, session, type Context, Scenes } from 'telegraf';
import { VercelRequest, VercelResponse } from '@vercel/node';
import { development, production } from './core';
import type { Update } from 'telegraf/types';
import { type User } from './db/models';
import {
  SceneContextScene,
  WizardContextWizard,
  WizardSessionData,
} from 'telegraf/scenes';
import { Wallet } from '@tonconnect/sdk';
// import { handleConnectCommand } from './ton-connect/commands-handlers';
import { login } from './commands';

const BOT_TOKEN = process.env.BOT_TOKEN || '';
const ENVIRONMENT = process.env.NODE_ENV || '';

interface UserSession extends Scenes.WizardSession {
  // will be available under `ctx.session.mySessionProp`
  user: User | null;
  wallet: Wallet | null;
}

export interface SessionContext<U extends Update = Update> extends Context<U> {
  session: UserSession;
  scene: SceneContextScene<SessionContext, WizardSessionData>;
  wizard: WizardContextWizard<SessionContext>;
}

const bot = new Telegraf<SessionContext>(BOT_TOKEN);

// dropUserTable().then(() => {
//   debug('User table created');
// });
// initUserTable().then(() => {
//   debug('User table created');
// });

bot.use(
  session({
    defaultSession: () => ({
      user: null,
      wallet: null,
    }),
  }),
);

bot.command('start', login);

//prod mode (Vercel)
export const startVercel = async (req: VercelRequest, res: VercelResponse) => {
  await production(req, res, bot);
};
//dev mode
ENVIRONMENT !== 'production' && development(bot);
