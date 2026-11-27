import { Effect, Option, Schema } from 'effect';
import { sentence } from './sentence.ts';
import { readJson, writeJson } from './store.ts';

/** Each request apart, so that a later one can take back an earlier one. */
const Wishes = Schema.Struct({ wishes: Schema.Array(Schema.String) });
/** How the requests were kept before, as one text. */
const Joined = Schema.Struct({ wish: Schema.String });

/** What the user asked of a photo, the latest last. */
export const wishesIn = (file: string) =>
  Effect.map(
    readJson(Schema.Union([Wishes, Joined]), file),
    Option.match({
      onNone: (): ReadonlyArray<string> => [],
      onSome: (stored) =>
        ('wishes' in stored ? stored.wishes : [stored.wish]).filter(
          (wish) => wish !== '',
        ),
    }),
  );

/** Requests as the one wish they make, if there are any. */
export const wishOf = (wishes: ReadonlyArray<string>): string | null =>
  wishes.reduce<string | null>(
    (before, now) => (before === null ? now : `${sentence(before)} ${now}`),
    null,
  );

/** What the user wants to be done with a photo, if anything. */
export const wishIn = (file: string) => Effect.map(wishesIn(file), wishOf);

export const writeWishes = (file: string, wishes: ReadonlyArray<string>) =>
  writeJson(Wishes, file, { wishes: wishes.filter((wish) => wish !== '') });
