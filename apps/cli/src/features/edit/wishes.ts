import { Effect, FileSystem, Option, Schema } from 'effect';
import { StoreFailed } from '../../shared/errors/errors.ts';
import { readJson, writeJson } from '../../shared/store.ts';
import { sentence } from './prompt.ts';

const Wish = Schema.Struct({ wish: Schema.String });

/** What the user wants to be done with a photo, if anything. */
export const wishIn = (file: string) =>
  Effect.map(
    readJson(Wish, file),
    Option.match({
      onNone: () => null,
      onSome: ({ wish }) => (wish === '' ? null : wish),
    }),
  );

export const writeWish = (file: string, wish: string) =>
  writeJson(Wish, file, { wish });

/** What the user wanted before and what they want now. */
export const bothWishes = (before: string | null, now: string): string =>
  before === null ? now : `${sentence(before)} ${now}`;

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
