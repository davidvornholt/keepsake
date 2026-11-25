import { Effect } from 'effect';
import { clamp } from '../../shared/boxes.ts';
import type { Box } from '../../shared/domain.ts';
import { frameOf, rendered, type Size, sizeOf } from '../../shared/pictures.ts';
import type { Piece } from '../../shared/vision.ts';

const pictureSide = 1536;
/** Parts are about this large, so small things are seen and found exactly. */
const partSide = 1400;
/** How far parts reach into each other, so nothing small is cut in all. */
const overlap = 0.03;

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
export const inPhoto = (part: Box, box: Box): Box => {
  const width = part.right - part.left;
  const height = part.bottom - part.top;
  return {
    left: part.left + box.left * width,
    top: part.top + box.top * height,
    right: part.left + box.right * width,
    bottom: part.top + box.bottom * height,
  };
};

/** A photo as a model sees it when nothing small may be missed. */
export const inParts = Effect.fn('inParts')(function* (
  file: string,
  /** Further parts that the user marked. */
  marked: ReadonlyArray<Box> = [],
) {
  const size = yield* sizeOf(file);
  const parts = [...partsOf(size), ...marked];
  const pictures = yield* Effect.forEach(parts, (part) =>
    rendered(file, { frame: frameOf(part, size) }),
  );
  const pieces: ReadonlyArray<Piece> = [
    'The photo:',
    yield* rendered(file, { longSide: pictureSide }),
    ...pictures.flatMap(
      (picture, index): Array<Piece> => [`Part ${index + 1}:`, picture],
    ),
  ];
  return { size, parts, pieces };
});
