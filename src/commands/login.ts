import createDebug from 'debug';
import { author, name, version, description } from '../../package.json';
import { createUser, getUser } from '../db';
import { SessionContext } from '../index';

const debug = createDebug('bot:about_command');

const login = async (ctx: SessionContext) => {
  const message = `*${name} ${version}**\n\n${description}*\n\nText author ${author} for more info `;

  debug(`Triggered "login" command with message \n${message}`);

  let user = ctx.session.user;
  debug(`session User ${user}`);

  if (!user) {
    if (!ctx?.from?.id) {
      debug('User not found');
      return;
    }
    const dbUser = await getUser(ctx.from.id);
    if (!dbUser) {
      const newUser = await createUser(
        ctx.from.id,
        ctx.from.first_name,
        ctx.from.last_name,
      );
      if (!newUser) {
        debug('User not created');
        return;
      }
      user = newUser;
    } else {
      user = dbUser;
    }
    ctx.session.user = user;
  }
};

export { login };
