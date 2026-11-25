import process from 'node:process';
import { Effect, Option, Path, Schema } from 'effect';
import { isRunning } from './processes.ts';
import { readJson, writeJson } from './store.ts';
import { xdgDirectory } from './xdg.ts';

const Serving = Schema.Struct({
  process: Schema.Int,
  /** Where the page is reached. */
  address: Schema.String,
});

const servingFile = Effect.gen(function* () {
  const path = yield* Path.Path;
  const data = yield* xdgDirectory('XDG_DATA_HOME', '.local/share');
  return path.join(data, 'keepsake', 'light-table.json');
});

/** Where the page is reached, if it is being served. */
const address = Effect.gen(function* () {
  const serving = Option.getOrNull(
    yield* readJson(Serving, yield* servingFile).pipe(
      Effect.orElseSucceed(() => Option.none<typeof Serving.Type>()),
    ),
  );
  return serving !== null && (yield* isRunning(serving.process))
    ? serving.address
    : null;
});

/**
 * Notes where the page is reached, for the commands that link to it. One that
 * is served for this machine only, such as to try something, doesn't replace
 * another.
 */
export const saveAddress = Effect.fn('saveAddress')(function* (
  reachedAt: string,
  isElsewhere: boolean,
) {
  if (isElsewhere || (yield* address) === null) {
    yield* writeJson(Serving, yield* servingFile, {
      process: process.pid,
      address: reachedAt,
    });
  }
});

/** The address of a shoot on the page, if it is being served. */
export const shootLink = (shoot: string) =>
  Effect.map(address, (base) =>
    base === null ? null : new URL(`/${shoot}`, base).href,
  );

/** The address where the owner rates moments of a shoot. */
export const ratingLink = (shoot: string) =>
  Effect.map(address, (base) =>
    base === null ? null : new URL(`/${shoot}/rate`, base).href,
  );

/** Makes the addresses of photos on the page, if it is being served. */
export const photoLinks = (shoot: string) =>
  Effect.map(
    address,
    (base) => (photo: string) =>
      base === null
        ? null
        : new URL(`/${shoot}/photos/${encodeURIComponent(photo)}`, base).href,
  );
