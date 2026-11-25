import type { Picture } from '../../contract.ts';

// An album on the shelf: a small pile of its prints, the cover on top. Each
// print keeps the shape of its photo, as large as the place allows.

export type Rect = {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
};

type Box = { readonly width: number; readonly height: number };

/** How many prints a pile shows. */
export const printsInPile = 3;

/** How much of its place a pile fills, so that prints that lie askew stay in it. */
const filled = 0.92;

/** Where a print of some shape lies in the place of a pile: in its middle. */
export const printIn = (box: Box, aspect: number): Rect => {
  const width = box.width * filled;
  const height = box.height * filled;
  const isWider = aspect * height > width;
  const w = isWider ? width : height * aspect;
  const h = isWider ? width / aspect : height;
  return { x: (box.width - w) / 2, y: (box.height - h) / 2, w, h };
};

export type Print = {
  readonly picture: Picture;
  readonly rect: Rect;
  /** How deep in the pile it lies: 0 is the cover. */
  readonly depth: number;
};

/** The prints of a pile, the lowest first, so that the cover is laid last. */
export const pileOf = (
  covers: ReadonlyArray<Picture>,
  box: Box,
): ReadonlyArray<Print> =>
  covers
    .slice(0, printsInPile)
    .map((picture, depth) => ({
      picture,
      depth,
      rect: printIn(box, picture.width / Math.max(1, picture.height)),
    }))
    .toReversed();
