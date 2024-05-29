import {
  CHAIN,
  isTelegramUrl,
  toUserFriendlyAddress,
  UserRejectsError,
} from '@tonconnect/sdk';
import { getWallets, getWalletInfo } from './wallets';
import { getConnector } from './connector';
import { addTGReturnStrategy, pTimeout, pTimeoutException } from './utils';
import { SessionContext } from '../index';
import createDebug from 'debug';
import { walletMenuCallbacks } from './connect-wallet-menu';
import { updateUserMetaData } from '../db';
import { login } from '../commands';

const debug = createDebug('ton-connect:command_handlers');

let newConnectRequestListenersMap = new Map<number, () => void>();

export async function handleConnectCommand(ctx: SessionContext): Promise<void> {
  const chatId = ctx?.chat?.id;
  let messageWasDeleted = false;

  if (!chatId) {
    ctx.reply(`error. no chat id. try again`);
    return;
  }

  await login(ctx);
  const deleteMessage = async (): Promise<void> => {
    try {
      if (!messageWasDeleted) {
        messageWasDeleted = true;
        await ctx.deleteMessage(chatId);
      }
    } catch (e) {
      debug('Error while deleting message', e);
    }
  };

  newConnectRequestListenersMap.get(chatId)?.();

  const connector = getConnector(chatId, () => {
    unsubscribe();
    newConnectRequestListenersMap.delete(chatId);
    deleteMessage();
  });
  ctx.sendMessage('connector');

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

  const unsubscribe = connector.onStatusChange(async (wallet) => {
    if (wallet) {
      await deleteMessage();

      const walletName =
        (await getWalletInfo(wallet.device.appName))?.name ||
        wallet.device.appName;

      await updateUserMetaData(ctx.session.user?.id, {
        wallet: wallet.account.address,
      });
      await ctx.sendMessage(`${walletName} wallet connected successfully`);
      unsubscribe();
      newConnectRequestListenersMap.delete(chatId);
    }
  });

  const wallets = await getWallets();

  const tonkeeper = wallets.find((wallet) => wallet.appName === 'tonkeeper');

  ctx.reply(`tonkeeper ${JSON.stringify(tonkeeper)}`);

  if (tonkeeper) {
    await walletMenuCallbacks['select_wallet'](ctx, tonkeeper.appName);
  }

  newConnectRequestListenersMap.set(chatId, async () => {
    unsubscribe();

    newConnectRequestListenersMap.delete(chatId);
  });
}

export async function handleSendTXCommand(msg: SessionContext): Promise<void> {
  const chatId = msg.message?.chat.id;
  if (!chatId) return;

  const connector = getConnector(chatId);

  await connector.restoreConnection();
  if (!connector.connected) {
    await msg.sendMessage('Connect wallet to send transaction');
    return;
  }

  pTimeout(
    connector.sendTransaction({
      validUntil: Math.round(
        (Date.now() + Number(process.env.DELETE_SEND_TX_MESSAGE_TIMEOUT_MS)) /
          1000,
      ),
      messages: [
        {
          amount: '1000000',
          address:
            '0:0000000000000000000000000000000000000000000000000000000000000000',
        },
      ],
    }),
    Number(process.env.DELETE_SEND_TX_MESSAGE_TIMEOUT_MS),
  )
    .then(() => {
      msg.sendMessage(`Transaction sent successfully`);
    })
    .catch((e) => {
      if (e === pTimeoutException) {
        msg.sendMessage(`Transaction was not confirmed`);
        return;
      }

      if (e instanceof UserRejectsError) {
        msg.sendMessage(`You rejected the transaction`);
        return;
      }

      msg.sendMessage(`Unknown error happened`);
    })
    .finally(() => connector.pauseConnection());

  let deeplink = '';
  const walletInfo = await getWalletInfo(connector.wallet!.device.appName);
  if (walletInfo) {
    deeplink = walletInfo.universalLink;
  }

  if (isTelegramUrl(deeplink)) {
    const url = new URL(deeplink);
    url.searchParams.append('startattach', 'tonconnect');
    deeplink = addTGReturnStrategy(
      url.toString(),
      process.env.TELEGRAM_BOT_LINK!,
    );
  }

  await msg.sendMessage(
    `Open ${walletInfo?.name || connector.wallet!.device.appName} and confirm transaction`,
    {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: `Open ${walletInfo?.name || connector.wallet!.device.appName}`,
              url: deeplink,
            },
          ],
        ],
      },
    },
  );
}

export async function handleDisconnectCommand(
  msg: SessionContext,
): Promise<void> {
  const chatId = msg.message?.chat?.id;

  if (!chatId) return;

  const connector = getConnector(chatId);

  await connector.restoreConnection();
  if (!connector.connected) {
    await msg.sendMessage("You didn't connect a wallet");
    return;
  }

  await connector.disconnect();

  await msg.sendMessage('Wallet has been disconnected');
}

export async function handleShowMyWalletCommand(
  msg: SessionContext,
): Promise<void> {
  const chatId = msg.message?.chat?.id;

  if (!chatId) return;

  const connector = getConnector(chatId);

  await connector.restoreConnection();
  if (!connector.connected) {
    await msg.sendMessage("You didn't connect a wallet");
    return;
  }

  const walletName =
    (await getWalletInfo(connector.wallet!.device.appName))?.name ||
    connector.wallet!.device.appName;

  await msg.sendMessage(
    `Connected wallet: ${walletName}\nYour address: ${toUserFriendlyAddress(
      connector.wallet!.account.address,
      connector.wallet!.account.chain === CHAIN.TESTNET,
    )}`,
  );
}
