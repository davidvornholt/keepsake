import { Effect, Schema } from 'effect';
import { Outline } from '../../../shared/domain.ts';
import { rendered } from '../../../shared/pictures.ts';
import { Vision } from '../../../shared/vision.ts';
import { withoutRemoved } from '../removals.ts';

const pictureSide = 2000;
const fewestPoints = 3;
/** An area smaller than this part of a photo isn't worth it. */
const least = 0.02;
const half = 0.5;

const role =
  'You mark areas in photos so that a program can keep their own texture in an edit. Precise positions matter.';

const Textures = Schema.Struct({
  outlines: Schema.Array(
    Outline.annotate({
      description: '20 to 80 points in order along the outline',
    }),
  ),
});

const question =
  'An image model will edit this photo, and where it shows a forest it draws the trees anew, so they look painted. Outline the forests, rows of trees and other dense greenery that are so far away that a leaf is only a few pixels in size and that the photo shows sharply. Include all of each area: follow its edges closely, leave out sky, water, buildings, roads, animals and people, and give several outlines where something divides it. Leave out plants nearby, whose single leaves can be told apart, and those that are out of focus, almost black or full of noise. All positions are fractions of the photo’s width and height from its top left corner. Most photos have no such area: the list is empty then.';

/** How much of a photo is inside an outline. */
const areaOf = (outline: Outline): number => {
  let before = outline.at(-1);
  let twice = 0;
  for (const point of outline) {
    if (before !== undefined) {
      twice += before.x * point.y - point.x * before.y;
    }
    before = point;
  }
  return Math.abs(twice) * half;
};

/** Finds the areas of a photo that an image model would draw anew. */
export const findTextures = Effect.fn('findTextures')(function* (
  file: string,
  removed: ReadonlyArray<string>,
) {
  const vision = yield* Vision;
  const { outlines } = yield* vision.ask({
    role,
    name: 'textures',
    schema: Textures,
    pieces: [
      yield* rendered(file, { longSide: pictureSide }),
      ...withoutRemoved(removed),
      question,
    ],
  });
  return outlines.filter(
    (outline) => outline.length >= fewestPoints && areaOf(outline) >= least,
  );
});
