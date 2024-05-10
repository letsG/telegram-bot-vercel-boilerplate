import { getWalletInfo } from './wallets';
import { getConnector } from './connector';
import { isTelegramUrl } from '@tonconnect/sdk';
import { addTGReturnStrategy } from './utils';
import { SessionContext } from '../index';
import { Markup } from 'telegraf';

export const walletMenuCallbacks = {
  select_wallet: onWalletClick,
};

async function onWalletClick(
  query: SessionContext,
  data: string,
): Promise<void> {
  const chatId = query.message!.chat.id;
  const connector = getConnector(chatId);

  const selectedWallet = await getWalletInfo(data);
  if (!selectedWallet) {
    return;
  }

  let buttonLink = connector.connect({
    bridgeUrl: selectedWallet.bridgeUrl,
    universalLink: selectedWallet.universalLink,
  });

  if (isTelegramUrl(selectedWallet.universalLink)) {
    buttonLink = addTGReturnStrategy(
      buttonLink,
      process.env.TELEGRAM_BOT_LINK!,
    );
  }

  await query.reply(
    'Диплинк',
    Markup.inlineKeyboard([
      Markup.button.callback(
        '« Back',
        JSON.stringify({
          method: 'chose_wallet',
        }),
      ),
      Markup.button.url(`Open ${selectedWallet.name}`, buttonLink),
    ]),
  );
}
