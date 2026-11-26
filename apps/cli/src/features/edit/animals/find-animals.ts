import { Effect, Schema } from 'effect';
import { coverage, tidyBox, wholePicture } from '../../../shared/boxes.ts';
import { Box } from '../../../shared/domain.ts';
import type { Size } from '../../../shared/pictures.ts';
import { Vision } from '../../../shared/vision.ts';
import { inParts, inPhoto } from '../parts.ts';
import { withoutUnwanted } from '../removals.ts';

/**
 * The image model draws an animal well that is at least this large, in pixels
 * of the picture it gets. It turns a smaller one, such as a bird sitting far
 * away in a tree, into a lump or loses it.
 */
const drawnWell = 128;
/** An animal smaller than this can't be told from a speck. */
const leastSide = 8;

/** Whether the image model would draw an animal in this box badly. */
export const isTooSmall = (box: Box, { width, height }: Size): boolean => {
  const longestSide = Math.round(
    Math.max((box.right - box.left) * width, (box.bottom - box.top) * height),
  );
  return longestSide >= leastSide && longestSide < drawnWell;
};

const role =
  'You find animals in photos so that a program can keep them as they are. Precise positions matter, and no animal may be missed.';

const Animals = Schema.Struct({
  animals: Schema.Array(
    Schema.Struct({
      part: Schema.Int,
      box: Box.annotate({
        description:
          'Around everything that is visible of the animal, in fractions of the part',
      }),
    }),
  ),
});

const question =
  'Give a box for every animal in this photo: birds, insects, reptiles, fish, mammals, also small ones far away, partly hidden, or sitting among leaves and branches. Go through every part. Leave out specks and shapes that could be anything, statues, drawings, and animals on posters and screens. Give one box for animals that are so close together that they can’t be told apart. For each, give the number of the part that shows all of it best, or 0 for the whole photo when no part does, and a box in fractions of the width and height of that part or photo from its top left corner. Answer with an empty list when there is none.';

/**
 * Finds the animals in a photo that are too small for the image model to draw,
 * so they come back from the photo like people far away.
 */
export const findSmallAnimals = Effect.fn('findSmallAnimals')(function* (
  file: string,
  removed: ReadonlyArray<string>,
  wish: string | null,
) {
  const vision = yield* Vision;
  const { size, parts, pieces } = yield* inParts(file);
  const { animals } = yield* vision.ask({
    role,
    name: 'animals',
    schema: Animals,
    pieces: [...pieces, ...withoutUnwanted(removed, wish), question],
  });
  return animals
    .flatMap(({ part, box }): Array<Box> => {
      const place = part === 0 ? wholePicture : parts[part - 1];
      return place === undefined ? [] : [inPhoto(place, tidyBox(box))];
    })
    .filter((box) => coverage(box) > 0 && isTooSmall(box, size));
});
