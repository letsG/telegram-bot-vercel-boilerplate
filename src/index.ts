import {
  Telegraf,
  session,
  type Context,
  Scenes,
  Composer,
  Markup,
} from 'telegraf';
import { VercelRequest, VercelResponse } from '@vercel/node';
import { development, production } from './core';
import type { Update } from 'telegraf/types';
import { User } from './db/models';
import {
  SceneContextScene,
  WizardContextWizard,
  WizardSessionData,
} from 'telegraf/scenes';
import { getWalletInfo, getWallets } from './ton-connect/wallets';
import { CHAIN, toUserFriendlyAddress, Wallet } from '@tonconnect/sdk';
import createDebug from 'debug';
import { updateUserMetaData } from './db';
import { getConnector } from './ton-connect/connector';
import { handleConnectCommand } from './ton-connect/commands-handlers';

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

  if (JSON.parse(ctx.session.user?.metadata || '{}')?.wallet) {
    ctx.reply('Кошелек уже подключен!');
    return ctx.scene.leave();
  }

  if (!chatId || !ctx.session.user?.id) return ctx.reply('Chat id not found!');
  let newConnectRequestListenersMap = new Map<number, () => void>();

  newConnectRequestListenersMap.get(chatId)?.();

  const unsubscribe = () => {
    newConnectRequestListenersMap.delete(chatId);
  };

  const connector = getConnector(chatId, () => {
    newConnectRequestListenersMap.delete(chatId);
    unsubscribe();
  });

  await connector.restoreConnection();
  if (connector.connected) {
    const connectedName =
      (await getWalletInfo(connector.wallet!.device.appName))?.name ||
      connector.wallet!.device.appName;
    await ctx.sendMessage(
      `You have already connect ${connectedName} wallet\nYour address: ${toUserFriendlyAddress(
        connector.wallet!.account.address,
        connector.wallet!.account.chain === CHAIN.TESTNET,
      )}\n\n Disconnect wallet firstly to connect a new one`,
    );

    return;
  }

  const walletHandler = async (wallet: Wallet) => {
    const walletName =
      (await getWalletInfo(wallet.device.appName))?.tondns ||
      wallet.account.publicKey;

    ctx.session.wallet = wallet;
    try {
      await updateUserMetaData(ctx.session.user?.id, {
        wallet: wallet.account.address,
      });
      await ctx.reply(
        `Кошелек ${walletName} успешно подключен!`,
        Markup.inlineKeyboard([Markup.button.callback('Успех', 'next')]),
      );
      return ctx.scene.leave();
    } catch (error) {
      console.error(error);
      await ctx.reply('Произошла ошибка при сохранении кошелька');
      ctx.session.wallet = null;
      ctx.session.user = null;
      return ctx.scene.leave();
    }
  };

  connector.onStatusChange(async (wallet) => {
    if (wallet) {
      debug('Wallet connected', wallet);
      return walletHandler(wallet);
    }
  });

  const wallets = await getWallets();

  const tonkeeper = wallets.find((wallet) => wallet.appName === 'tonkeeper')!;

  const link = connector.connect({
    bridgeUrl: tonkeeper.bridgeUrl,
    universalLink: tonkeeper.universalLink,
  });

  if (ctx.session.wallet) {
    return walletHandler(ctx.session.wallet);
  }

  await ctx.reply(
    `Вот диплинк на подключение Tonkeeper`,
    Markup.inlineKeyboard([Markup.button.url('Подключить кошелек', link)]),
  );
  return ctx.wizard.next();
});

bot.command('start', handleConnectCommand);

//prod mode (Vercel)
export const startVercel = async (req: VercelRequest, res: VercelResponse) => {
  await production(req, res, bot);
};
//dev mode
ENVIRONMENT !== 'production' && development(bot);
