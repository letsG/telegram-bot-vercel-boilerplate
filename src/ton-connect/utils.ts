import { encodeTelegramUrlParameters } from '@tonconnect/sdk';

export const pTimeoutException = Symbol();

export function pTimeout<T>(
  promise: Promise<T>,
  time: number,
  exception: unknown = pTimeoutException,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    promise,
    new Promise((_r, rej) => (timer = setTimeout(rej, time, exception))),
  ]).finally(() => clearTimeout(timer)) as Promise<T>;
}

export function addTGReturnStrategy(link: string, strategy: string): string {
  const parsed = new URL(link);
  parsed.searchParams.append('ret', strategy);
  link = parsed.toString();

  const lastParam = link.slice(link.lastIndexOf('&') + 1);
  return (
    link.slice(0, link.lastIndexOf('&')) +
    '-' +
    encodeTelegramUrlParameters(lastParam)
  );
}
