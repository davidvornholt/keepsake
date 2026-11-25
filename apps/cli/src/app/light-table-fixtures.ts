import { BunServices } from '@effect/platform-bun';
import { ConfigProvider, Effect } from 'effect';
import { serveLightTable } from '../features/light-table/server.ts';
import { fake } from './command-fixtures.ts';
import { fakeToolsLayer } from './fake-tools.ts';

/** Serves the page while `visit` runs. */
export const whileServing = <A>(
  visit: (address: string) => Promise<A>,
  address?: URL,
): Promise<A> =>
  Effect.runPromise(
    Effect.gen(function* () {
      const server = yield* serveLightTable({ port: 0, address });
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
