import { clamp, mix } from '../motion/spring.ts';

// Where the owner's mark lies on a photo: on a frame of the table, on a photo
// that is looked at, and on one that travels between the two, so that the
// mark goes along with the photo instead of jumping when it arrives.

type Rect = {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
};

export type Square = {
  readonly x: number;
  readonly y: number;
  readonly size: number;
};

const frameShare = 0.74;
/** From this size on a mark grows more slowly than its frame. */
const frameSteady = 64;
const frameGrowth = 0.22;
const leastOnFrame = 9;
/** Over this many pixels a mark moves from the middle to a corner. */
const cornerRange = 140;
const frameInset = 0.06;

/** On a frame of the table: all over a small frame, in the lower left corner of a large one. */
export const markOnFrame = ({ x, y, w, h }: Rect): Square => {
  const side = Math.min(w, h);
  const size = Math.max(
    leastOnFrame,
    side < frameSteady
      ? side * frameShare
      : frameSteady * frameShare + (side - frameSteady) * frameGrowth,
  );
  const toCorner = clamp((side - frameSteady) / cornerRange, 0, 1);
  const inset = side * frameInset;
  return {
    x: mix(x + (w - size) / 2, x + inset, toCorner),
    y: mix(y + (h - size) / 2, y + h - size - inset, toCorner),
    size,
  };
};

const photoShare = 0.2;
const leastOnPhoto = 44;
const mostOnPhoto = 104;
const photoInset = 0.045;

/** On a photo that is looked at: smaller than on a frame, since the photo is what is looked at. */
export const markOnPhoto = (part: Rect): Square => {
  const side = Math.min(part.w, part.h);
  const size = clamp(side * photoShare, leastOnPhoto, mostOnPhoto);
  const inset = side * photoInset;
  return { x: part.x + inset, y: part.y + part.h - size - inset, size };
};

/**
 * On a photo on its way between its frame and where it is looked at. `frame`
 * is where on the screen the part shown on the table is, `photo` the part
 * shown when looked at, and `share` how far the way to the latter has gone.
 */
export const markBetween = (
  frame: Rect,
  photo: Rect,
  share: number,
): Square => {
  const from = markOnFrame(frame);
  const to = markOnPhoto(photo);
  return {
    x: mix(from.x, to.x, share),
    y: mix(from.y, to.y, share),
    size: mix(from.size, to.size, share),
  };
};
