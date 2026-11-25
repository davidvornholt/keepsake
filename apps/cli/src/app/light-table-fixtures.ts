import { BunServices } from '@effect/platform-bun';
import { ConfigProvider, Effect } from 'effect';
import { serveLightTable } from '../features/light-table/server.ts';
import { fake } from './command-fixtures.ts';
import { fakeToolsLayer } from './fake-tools.ts';

type Options = Partial<Omit<Parameters<typeof serveLightTable>[0], 'port'>>;

/** Serves the page while `visit` runs. */
export const whileServing = <A>(
  visit: (address: string) => Promise<A>,
  options: Options = {},
): Promise<A> =>
  Effect.runPromise(
    Effect.gen(function* () {
      const server = yield* serveLightTable({
        address: undefined,
        photos: [],
        agent: undefined,
        keepsake: ['keepsake'],
        ...options,
        port: 0,
      });
      return yield* Effect.promise(() =>
        visit(`http://127.0.0.1:${server.port}`),
      );
    }).pipe(
      Effect.scoped,
      Effect.provide(fakeToolsLayer),
      Effect.provide(BunServices.layer),
      Effect.provide(
        ConfigProvider.layer(
          ConfigProvider.fromDotEnvContents(
            [
              `HOME=${fake.home}`,
              `XDG_CACHE_HOME=${fake.home}/cache`,
              `XDG_DATA_HOME=${fake.home}/data`,
            ].join('\n'),
          ),
        ),
      ),
    ),
  );

export const send = (
  method: string,
  address: string,
  body: unknown = null,
  headers: Record<string, string> = {},
) =>
  fetch(address, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: body === null ? null : JSON.stringify(body),
  });

export const change = {
  photo: 'B',
  kind: 'change',
  note: ' Remove the chair ',
  boxes: [{ left: 0.1, top: 0.1, right: 0.2, bottom: 0.2 }],
  other: null,
};

export const shootOf = async (address: string) =>
  (await fetch(`${address}/api/shoots/lisbon`)).json();

export const marksOf = async (address: string) =>
  (await shootOf(address)).marks;

export const statusOf = (response: Promise<Response>) =>
  response.then(({ status }) => status);

export const handOver = (address: string, body: object = {}) =>
  send('POST', `${address}/api/shoots/lisbon/hand-over`, {
    dollars: 0,
    album: false,
    ...body,
  });

const patience = 200;
const pause = 10;

/** What `look` finds once that is `wanted`, since some of it takes a moment. */
export const eventually = async <A>(
  look: () => Promise<A>,
  isWanted: (found: A) => boolean,
  tries = patience,
): Promise<A> => {
  const found = await look();
  if (isWanted(found) || tries === 0) {
    return found;
  }
  await Bun.sleep(pause);
  return eventually(look, isWanted, tries - 1);
};
