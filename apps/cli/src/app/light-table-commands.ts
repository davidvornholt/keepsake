import process from 'node:process';
import { Effect, Option, Path } from 'effect';
import { Command, Flag } from 'effect/cli';
import { serveLightTable } from '../features/light-table/server.ts';
import { saveAddress } from '../shared/address.ts';
import {
  bounded,
  fail,
  optionalInt,
  optionalString,
} from './command-inputs.ts';
import { emit } from './output.ts';
import { publishingLayer } from './publishing.ts';

const highestPort = 65_535;
const mostFolders = 20;
const webProtocols = new Set(['http:', 'https:']);

const webAddress = (text: string) =>
  Effect.try({
    try: () => new URL(text),
    catch: () => undefined,
  }).pipe(
    Effect.filterOrFail(({ protocol }) => webProtocols.has(protocol)),
    Effect.catch(() =>
      fail(
        `${JSON.stringify(text)} is not an address of a web page. Write it with https://.`,
      ),
    ),
  );

/** How this very program is started, as a binary or from its source. */
const keepsake = Bun.main.startsWith('/$bunfs/')
  ? [process.execPath]
  : [process.execPath, Bun.main];

export const serve = Command.make(
  'serve',
  {
    port: optionalInt('port', 'The port of the page (default: any free one)'),
    address: optionalString(
      'address',
      'Where the page is reached from another machine, when something on this one passes it on to the port, such as https://server.example.ts.net:8443',
    ),
    photos: Flag.String('photos').pipe(
      Flag.withDescription(
        'A folder with the owner’s photos, whose folders the page offers to make albums of. Can be given several times.',
      ),
      Flag.atMost(mostFolders),
    ),
  },
  ({ port, address, photos }) =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const chosenPort = yield* bounded('port', port, {
        fallback: 0,
        min: 0,
        max: highestPort,
      });
      const elsewhere = Option.getOrUndefined(address);
      const reachedAt =
        elsewhere === undefined ? undefined : yield* webAddress(elsewhere);
      const server = yield* serveLightTable({
        port: chosenPort,
        address: reachedAt,
        photos: photos.map((folder) => path.resolve(folder)),
        keepsake,
      });
      const url = reachedAt?.href ?? `http://127.0.0.1:${server.port}/`;
      yield* saveAddress(url, reachedAt !== undefined);
      yield* emit({ url });
      return yield* Effect.never;
    }).pipe(Effect.scoped, Effect.provide(publishingLayer)),
).pipe(
  Command.withDescription(
    'Serve the light table, a page on this machine where the owner of the photos sees what was chosen and why, compares each edit with the camera’s picture, marks what should change, and rates photos. It carries out what they hand over itself, with the commands of keepsake, and goes on with what it didn’t get through when it is started again. Runs until it is stopped.',
  ),
);
