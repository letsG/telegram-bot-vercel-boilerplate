import { IStorage } from '@tonconnect/sdk';
import { createClient } from '@vercel/kv';
import createDebug from 'debug';

if (!process.env.KV_URL || !process.env.KV_REST_API_TOKEN) {
  throw new Error('KV_URL is not set');
}

const client = createClient({
  url: process.env.KV_URL,
  token: process.env.KV_REST_API_TOKEN,
});
const debug = createDebug('ton-connect:storage:redis:kv');

export class TonConnectStorage implements IStorage {
  constructor(private readonly chatId: number) {}

  handleError(error: unknown): void {
    debug('Error: %O', error);
  }

  async removeItem(key: string): Promise<void> {
    try {
      await client.del(this.getKey(key));
    } catch (error) {
      debug('Error: %O', error);
    }
  }

  async setItem(key: string, value: string): Promise<void> {
    try {
      await client.set(this.getKey(key), value);
    } catch (error) {
      this.handleError(error);
    }
  }

  async getItem(key: string): Promise<string | null> {
    try {
      return (await client.get(this.getKey(key))) || null;
    } catch (error) {
      this.handleError(error);
      return null;
    }
  }

  private getKey(key: string): string {
    return this.chatId.toString() + key;
  }
}
