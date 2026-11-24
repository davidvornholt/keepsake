import { Effect, Schema } from 'effect';
import type { Sign } from '../../../shared/domain.ts';
import { rendered, sizeOf } from '../../../shared/pictures.ts';
import { type Piece, Vision } from '../../../shared/vision.ts';
import { frameAround, type Room, roomOf, withRoom } from '../pixels/frames.ts';

const room: Room = { pixels: 32, height: 1 };
const longSide = 768;
/** As many signs as a model compares at once. */
const most = 20;

const role =
  'You compare the signs in an edited photo with those in the original, letter by letter.';

const Changed = Schema.Struct({
  changed: Schema.Array(
    Schema.Int.annotate({ description: 'The number of a sign' }),
  ),
});

const question =
  'Which of these signs did the edit get wrong? A sign is wrong when the edit shows other, garbled, missing or additional letters or digits, or another logo, where the original can be read or recognised. It isn’t wrong when only its light, colours, sharpness or place are different, nor when the original is just as hard to read.';

const grouped = <A>(all: ReadonlyArray<A>): ReadonlyArray<ReadonlyArray<A>> =>
  Array.from({ length: Math.ceil(all.length / most) }, (_, group) =>
    all.slice(group * most, (group + 1) * most),
  );

/** Finds the signs that an edit of a photo got wrong. */
export const changedSigns = Effect.fn('changedSigns')(function* (
  files: { readonly original: string; readonly version: string },
  signs: ReadonlyArray<Sign>,
) {
  const vision = yield* Vision;
  const size = yield* sizeOf(files.original);
  const found = yield* Effect.forEach(grouped(signs), (group) =>
    Effect.gen(function* () {
      const pieces = yield* Effect.forEach(group, ({ text, box }, index) =>
        Effect.gen(function* () {
          const exact = frameAround(box, size);
          const frame = withRoom(exact, roomOf(room, exact), size);
          const name = `Sign ${index + 1}, “${text}”`;
          return [
            `${name}, in the original:`,
            yield* rendered(files.original, { frame, longSide }),
            `${name}, in the edit:`,
            yield* rendered(files.version, { frame, longSide }),
          ] satisfies Array<Piece>;
        }),
      );
      const { changed } = yield* vision.ask({
        role,
        name: 'changed-signs',
        schema: Changed,
        pieces: [...pieces.flat(), question],
      });
      return group.filter((_, index) => changed.includes(index + 1));
    }),
  );
  return found.flat();
});
