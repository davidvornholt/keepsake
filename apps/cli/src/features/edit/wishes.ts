import { Effect, FileSystem } from 'effect';
import { StoreFailed } from '../../shared/errors/errors.ts';

/** Removes what is in a directory, except some files. */
export const emptied = (directory: string, kept: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    if (!(yield* fs.exists(directory))) {
      return;
    }
    for (const name of yield* fs.readDirectory(directory)) {
      const file = `${directory}/${name}`;
      if (!kept.includes(file)) {
        yield* fs.remove(file, { recursive: true, force: true });
      }
    }
  }).pipe(
    Effect.mapError(
      (error) =>
        new StoreFailed({
          message: `Could not empty ${directory}: ${error.message}`,
        }),
    ),
  );
