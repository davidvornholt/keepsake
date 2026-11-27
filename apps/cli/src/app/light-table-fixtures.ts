import { BunServices } from '@effect/platform-bun';
import { ConfigProvider, Effect } from 'effect';
import { serveLightTable } from '../features/light-table/server.ts';
import { fake } from './command-fixtures.ts';
import { fakeToolsLayer } from './fake-tools.ts';
import { publishingLayer } from './publishing.ts';

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
        keepsake: ['keepsake'],
        ...options,
        port: 0,
      });
      return yield* Effect.promise(() =>
        visit(`http://127.0.0.1:${server.port}`),
      );
    }).pipe(
      Effect.scoped,
      Effect.provide(publishingLayer),
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
  note: ' Remove the chair ',
  boxes: [{ left: 0.1, top: 0.1, right: 0.2, bottom: 0.2 }],
};

export const shootOf = async (address: string) =>
  (await fetch(`${address}/api/shoots/lisbon`)).json();

export const marksOf = async (address: string) =>
  (await shootOf(address)).marks;

export const statusOf = (response: Promise<Response>) =>
  response.then(({ status }) => status);

type Shown = {
  readonly marks: ReadonlyArray<{
    readonly id: string;
    readonly handedOverAt: string | null;
  }>;
  readonly photos: ReadonlyArray<{
    readonly id: string;
    readonly standing: { readonly kind: string };
  }>;
};

/** The open marks, as the page shows them to be looked over. */
export const openMarksOf = async (address: string) =>
  ((await shootOf(address)) as Shown).marks
    .filter(({ handedOverAt }) => handedOverAt === null)
    .map(({ id }) => id);

/** The chosen photos, as the page orders them. */
export const pickedOf = async (address: string) =>
  ((await shootOf(address)) as Shown).photos
    .filter(({ standing }) => standing.kind === 'picked')
    .map(({ id }) => id);

/** Hands over the open marks the page shows, unless `body` says otherwise. */
export const handOver = async (address: string, body: object = {}) =>
  send('POST', `${address}/api/shoots/lisbon/hand-over`, {
    dollars: 0,
    marks: await openMarksOf(address),
    album: null,
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
