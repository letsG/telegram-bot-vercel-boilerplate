import {
  Telegraf,
  session,
  type Context,
  Scenes,
  Composer,
  Markup,
} from 'telegraf';
import { login } from './commands';
import { VercelRequest, VercelResponse } from '@vercel/node';
import { development, production } from './core';
import type { Update } from 'telegraf/types';
import { User } from './db/models';
import {
  SceneContextScene,
  WizardContextWizard,
  WizardScene,
  WizardSessionData,
} from 'telegraf/scenes';
import { name, description, author } from '../package.json';
import { getWalletInfo, getWallets } from './ton-connect/wallets';
import TonConnect, { Wallet } from '@tonconnect/sdk';
import { TonConnectStorage } from './ton-connect/storage';
import createDebug from 'debug';
import { updateUserMetaData } from './db';

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

const debug = createDebug('bot:root wizzard');
const stepHandler = new Composer<SessionContext>();

stepHandler.action('next', async (ctx) => {
  debug('next action');
  const chatId = ctx.chat?.id || ctx.session.user?.id;

  if (
    ctx.session.wallet ||
    JSON.parse(ctx.session.user?.metadata || '{}')?.wallet
  ) {
    ctx.reply('Кошелек уже подключен!');
    return ctx.scene.leave();
  }

  if (!chatId || !ctx.session.user?.id) return ctx.reply('Chat id not found!');

  const connector = new TonConnect({
    storage: new TonConnectStorage(chatId),
    manifestUrl: process.env.MANIFEST_URL,
  });

  const walletHandler = async (wallet: Wallet, ctx: SessionContext) => {
    const walletName =
      (await getWalletInfo(wallet.device.appName))?.tondns ||
      wallet.account.publicKey;

    ctx.session.wallet = wallet;

    if (ctx.session.user?.id) {
      await updateUserMetaData(ctx.session.user.id, {
        wallet: wallet.account.address,
      });
    }
    await ctx.reply(
      `Кошелек ${walletName} успешно подключен!`,
      Markup.inlineKeyboard([Markup.button.callback('Успех', 'next')]),
    );
    return ctx.scene.leave();
  };

  connector.onStatusChange(async (wallet) => {
    if (wallet) {
      debug('Wallet connected', wallet);
      return walletHandler(wallet, ctx);
    }
  });

  const wallets = await getWallets();

  const tonkeeper = wallets.find((wallet) => wallet.appName === 'tonkeeper')!;

  const link = connector.connect({
    bridgeUrl: tonkeeper.bridgeUrl,
    universalLink: tonkeeper.universalLink,
  });

  if (ctx.session.wallet) {
    return walletHandler(ctx.session.wallet, ctx);
  }

  await ctx.reply(
    `Вот диплинк на подключение Tonkeeper`,
    Markup.inlineKeyboard([Markup.button.url('Подключить кошелек', link)]),
  );
  return ctx.wizard.next();
});

const superWizard = new WizardScene(
  'super-wizard',
  async (ctx) => {
    await login()(ctx);
    if (
      ctx.session.user?.id &&
      JSON.parse(ctx.session.user?.metadata || '{}')?.wallet
    ) {
      await ctx.reply('Спасибо за участие в розыгрыше!');
      return ctx.scene.leave();
    }

    await ctx.reply(
      `Здарова [${ctx.session.user?.first_name}]!\n\n Добро пожаловать в розыгрыш NFT от @${name}! 🎉\n\n${description}*\n\nНапиши ${author} если что-то не понятно`,
      Markup.inlineKeyboard([
        Markup.button.callback('➡️ Хочу участвовать в розыгрыше! ', 'next'),
      ]),
    );
    return ctx.wizard.next();
  },
  stepHandler,
);

const stage = new Scenes.Stage<SessionContext>([superWizard], {
  default: 'super-wizard',
});

bot.use(stage.middleware());

//prod mode (Vercel)
export const startVercel = async (req: VercelRequest, res: VercelResponse) => {
  await production(req, res, bot);
};
//dev mode
ENVIRONMENT !== 'production' && development(bot);
