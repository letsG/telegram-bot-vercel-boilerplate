import { Telegraf, session, type Context } from 'telegraf';

import { about } from './commands';
import { VercelRequest, VercelResponse } from '@vercel/node';
import { development, production } from './core';
import type { Update } from 'telegraf/types';

const BOT_TOKEN = process.env.BOT_TOKEN || '';
const ENVIRONMENT = process.env.NODE_ENV || '';

export interface SessionContext<U extends Update = Update> extends Context<U> {
  session: {
    shm: {
      token: string;
      user_id: string;
    };
  };
}

const bot = new Telegraf<SessionContext>(BOT_TOKEN);

bot.use(
  session({
    defaultSession: () => ({
      shm: {
        token: '',
        user_id: '',
      },
    }),
  }),
);

bot.command('start', about());

//prod mode (Vercel)
export const startVercel = async (req: VercelRequest, res: VercelResponse) => {
  await production(req, res, bot);
};
//dev mode
ENVIRONMENT !== 'production' && development(bot);
