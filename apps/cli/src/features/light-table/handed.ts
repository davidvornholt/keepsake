import { DateTime, Effect, FileSystem, Option, Schema } from 'effect';
import { StoreFailed } from '../../shared/errors/errors.ts';
import { readJson, type ShootFiles, writeJson } from '../../shared/store.ts';
import { HandOverRecord } from './schemas.ts';

// What the owner handed over: a file for each time, written in one go, and
// beside it the claim of the one agent that acts on it.

const extension = '.json';
const claimed = '.claim';

const storeFailed = (error: { readonly message: string }) =>
  new StoreFailed({
    message: `Could not use what was handed over: ${error.message}`,
  });

const fileOf = (files: ShootFiles, id: string) =>
  `${files.handOvers}/${id}${extension}`;

const claimOf = (files: ShootFiles, id: string) =>
  `${files.handOvers}/${id}${claimed}`;

/** Everything handed over, oldest first. */
export const readHandOvers = Effect.fn('readHandOvers')(function* (
  files: ShootFiles,
) {
  const fs = yield* FileSystem.FileSystem;
  const names = yield* fs.readDirectory(files.handOvers).pipe(
    Effect.catchReason('PlatformError', 'NotFound', () =>
      Effect.succeed([] as Array<string>),
    ),
    Effect.mapError(storeFailed),
  );
  const found = yield* Effect.forEach(
    names.filter((name) => name.endsWith(extension) && !name.startsWith('.')),
    (name) => readJson(HandOverRecord, `${files.handOvers}/${name}`),
    { concurrency: 'unbounded' },
  );
  return found
    .flatMap(Option.toArray)
    .toSorted((left, right) => left.at.localeCompare(right.at));
});

export const saveHandOver = (files: ShootFiles, record: HandOverRecord) =>
  writeJson(HandOverRecord, fileOf(files, record.id), record);

/**
 * Who took a hand-over: an agent that waited for it, which has it then, or
 * the page, which has it once the program it started an agent with said so.
 */
const Claim = Schema.Struct({
  by: Schema.Literals(['waiter', 'page']),
  at: Schema.String,
  isAcknowledged: Schema.Boolean,
});
export type Claim = typeof Claim.Type;

/**
 * Takes a hand-over for one agent. False when another one took it already,
 * since only one may act on it.
 */
export const claim = Effect.fn('claim')(function* (
  files: ShootFiles,
  id: string,
  by: Claim['by'],
) {
  const fs = yield* FileSystem.FileSystem;
  const taken: Claim = {
    by,
    at: DateTime.formatIso(yield* DateTime.now),
    isAcknowledged: by === 'waiter',
  };
  const text = yield* Schema.encodeEffect(Schema.fromJsonString(Claim))(
    taken,
  ).pipe(Effect.mapError(storeFailed));
  return yield* fs
    .writeFileString(claimOf(files, id), `${text}\n`, { flag: 'wx' })
    .pipe(
      Effect.as(true),
      Effect.catchReason('PlatformError', 'AlreadyExists', () =>
        Effect.succeed(false),
      ),
      Effect.mapError(storeFailed),
    );
});

export const claimOn = (files: ShootFiles, id: string) =>
  Effect.map(readJson(Claim, claimOf(files, id)), Option.getOrNull);

/** Notes that the program the page started an agent with said it did. */
export const acknowledge = Effect.fn('acknowledge')(function* (
  files: ShootFiles,
  id: string,
) {
  const taken = yield* claimOn(files, id);
  if (taken !== null) {
    yield* writeJson(Claim, claimOf(files, id), {
      ...taken,
      isAcknowledged: true,
    });
  }
});
