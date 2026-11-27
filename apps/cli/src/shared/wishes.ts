import { Effect, Option, Schema } from 'effect';
import { readJson, writeJson } from './store.ts';

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
