import { Effect, FileSystem, Option } from 'effect';
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
 * Takes a hand-over for one agent. False when another one took it already,
 * since only one may act on it.
 */
export const claim = Effect.fn('claim')(function* (
  files: ShootFiles,
  id: string,
  by: string,
) {
  const fs = yield* FileSystem.FileSystem;
  return yield* fs
    .writeFileString(claimOf(files, id), `${by}\n`, { flag: 'wx' })
    .pipe(
      Effect.as(true),
      Effect.catchReason('PlatformError', 'AlreadyExists', () =>
        Effect.succeed(false),
      ),
      Effect.mapError(storeFailed),
    );
});

/** Gives a hand-over back, for when the agent that took it couldn't start. */
export const release = Effect.fn('release')(function* (
  files: ShootFiles,
  id: string,
) {
  const fs = yield* FileSystem.FileSystem;
  yield* fs
    .remove(claimOf(files, id), { force: true })
    .pipe(Effect.mapError(storeFailed));
});
