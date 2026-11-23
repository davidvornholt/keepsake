import { Effect, Schema } from 'effect';
import { clamp, coverage, tidyBox } from '../../../shared/boxes.ts';
import { Box, type Sign } from '../../../shared/domain.ts';
import {
  frameOf,
  rendered,
  type Size,
  sizeOf,
} from '../../../shared/pictures.ts';
import { type Piece, Vision } from '../../../shared/vision.ts';

const pictureSide = 1536;
/** Parts are about this large, so small text can be read and found exactly. */
const partSide = 1400;
/** How far parts reach into each other, so no sign is cut in all of them. */
const overlap = 0.03;

const role =
  'You mark the signs in photos so that a program can keep them exactly as they are. Precise positions matter.';

const Signs = Schema.Struct({
  signs: Schema.Array(
    Schema.Struct({
      part: Schema.Int,
      text: Schema.String,
      box: Box.annotate({
        description:
          'Around all of the text and its logo, in fractions of the part',
      }),
    }),
  ),
});

const question =
  'Mark every text, number and logo that can be read or recognised in this photo when looking closely, large and small: on buildings, roofs, shops, boats, vehicles, roads, traffic signs, number plates, banners and screens. Leave out what is so small or blurred that nobody could tell what it says. For each, give the number of the part that shows it best, what it says, and a box around it, in fractions of the width and height of that part from its top left corner. Answer with an empty list when there is none.';

/** Boxes that cover a photo like tiles. */
export const partsOf = ({ width, height }: Size): ReadonlyArray<Box> => {
  const columns = Math.ceil(width / partSide);
  const rows = Math.ceil(height / partSide);
  return Array.from({ length: columns * rows }, (_, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    return {
      left: clamp(column / columns - overlap, 0, 1),
      top: clamp(row / rows - overlap, 0, 1),
      right: clamp((column + 1) / columns + overlap, 0, 1),
      bottom: clamp((row + 1) / rows + overlap, 0, 1),
    };
  });
};

/** A box in fractions of a part, in fractions of the photo. */
const inPhoto = (part: Box, box: Box): Box => {
  const width = part.right - part.left;
  const height = part.bottom - part.top;
  return {
    left: part.left + box.left * width,
    top: part.top + box.top * height,
    right: part.left + box.right * width,
    bottom: part.top + box.bottom * height,
  };
};

/** Finds the signs in a photo that can be read. */
export const findSigns = Effect.fn('findSigns')(function* (file: string) {
  const vision = yield* Vision;
  const size = yield* sizeOf(file);
  const parts = partsOf(size);
  const pictures = yield* Effect.forEach(parts, (part) =>
    rendered(file, { frame: frameOf(part, size) }),
  );
  const { signs } = yield* vision.ask({
    role,
    name: 'signs',
    schema: Signs,
    pieces: [
      'The photo:',
      yield* rendered(file, { longSide: pictureSide }),
      ...pictures.flatMap(
        (picture, index): Array<Piece> => [`Part ${index + 1}:`, picture],
      ),
      question,
    ],
  });
  return signs.flatMap(({ part, text, box }): Array<Sign> => {
    const place = parts[part - 1];
    const tidy = tidyBox(box);
    return place === undefined || coverage(tidy) <= 0
      ? []
      : [{ text, box: inPhoto(place, tidy) }];
  });
});
