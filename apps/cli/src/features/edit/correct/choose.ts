import { Effect, Schema } from 'effect';
import { widened } from '../../../shared/boxes.ts';
import { frameOf, rendered, sizeOf } from '../../../shared/pictures.ts';
import { type Piece, Vision } from '../../../shared/vision.ts';
import type { Place } from './places.ts';

const wholeSide = 1024;
const closeUpSide = 1024;
/** How much is shown around a place, as a part of its longer side and more. */
const around = { part: 0.4, more: 0.03 };
/** As many places as a model looks at once. */
const most = 4;

const role = `You check what a retoucher did to single places of a finished photo, for the person who took it and wants to hang it on a wall. You look at each place close up, as it was and in several candidates.

A candidate is good enough when what was asked for is done there, all of it, and nobody who looks at the photo would guess that anything was done. It isn't when something of what was to go is left, or its shadow or reflection; when a trace, a smear, a blur, a seam, a doubled or cut-off edge, a patch of another light, colour or sharpness, or a repeated pattern shows; when something new was put there that nobody asked for; or when anything else there, such as a person, an animal, a building or a text, is damaged or no longer the same.`;

const Answer = Schema.Struct({
  places: Schema.Array(
    Schema.Struct({
      place: Schema.Int,
      best: Schema.Int.annotate({
        description:
          'The number of the best candidate, or 0 when none is good enough',
      }),
      notes: Schema.String.annotate({
        description:
          'What is good about the best one, or what is wrong with them, in a sentence',
      }),
    }),
  ),
});

export const Choice = Schema.Struct({
  /** The candidate, counted from 0, or null when none is good enough. */
  best: Schema.NullOr(Schema.Int),
  notes: Schema.String,
});
export type Choice = typeof Choice.Type;

type Files = {
  /** The photo as it was. */
  readonly base: string;
  readonly candidates: ReadonlyArray<string>;
};

const question = (count: number) =>
  `Say for ${count === 1 ? 'the place' : `each of the ${count} places`} which candidate is the best, the one that does what was asked for and looks most natural, or 0 when none of them is good enough. Where several look equally good, take the first of them: the earlier ones leave more of the photo as it was.`;

const grouped = <A>(all: ReadonlyArray<A>): ReadonlyArray<ReadonlyArray<A>> =>
  Array.from({ length: Math.ceil(all.length / most) }, (_, group) =>
    all.slice(group * most, (group + 1) * most),
  );

/** A place close up, as it was and in the candidates. */
const closeUps = Effect.fn('closeUps')(function* (
  name: string,
  { what, box }: Place,
  { base, candidates }: Files,
) {
  const size = yield* sizeOf(base);
  const longer = Math.max(box.right - box.left, box.bottom - box.top);
  const frame = frameOf(widened(box, around.part * longer + around.more), size);
  const closeUp = (file: string) =>
    rendered(file, { frame, longSide: closeUpSide });
  const pictures = yield* Effect.forEach(candidates, closeUp);
  return [
    `${name}, where this was asked for: ${what.join(' ')}`,
    `${name}, as it was:`,
    yield* closeUp(base),
    ...pictures.flatMap(
      (picture, index): Array<Piece> => [
        `${name}, candidate ${index + 1}:`,
        picture,
      ],
    ),
  ] satisfies Array<Piece>;
});

/** Finds the best candidate for each place, if one is good enough. */
export const choose = Effect.fn('choose')(function* (
  files: Files,
  places: ReadonlyArray<Place>,
) {
  const vision = yield* Vision;
  const whole = yield* rendered(files.base, { longSide: wholeSide });
  const chosen = yield* Effect.forEach(grouped(places), (group) =>
    Effect.gen(function* () {
      const pieces = yield* Effect.forEach(group, (place, index) =>
        closeUps(`Place ${index + 1}`, place, files),
      );
      const answer = yield* vision.ask({
        role,
        name: 'choices',
        schema: Answer,
        pieces: [
          'The whole photo, as it was:',
          whole,
          ...pieces.flat(),
          question(group.length),
        ],
      });
      return group.map((_, index): Choice => {
        const found = answer.places.find(({ place }) => place === index + 1);
        const best = (found?.best ?? 0) - 1;
        return {
          best: files.candidates[best] === undefined ? null : best,
          notes: found?.notes ?? '',
        };
      });
    }),
  );
  return chosen.flat();
});
