import type { Box, PhotoView } from '../../contract.ts';
import type { Rect } from '../sheet/layout.ts';

// The plane a photo lies on: the camera's picture with the finished photo on
// top of it, exactly where it was cut out. Looking at the photo, comparing
// it and opening it from the table are all the same plane seen from
// different distances.

/** Where the plane is on the screen: a point of it times `s`, plus `x` and `y`. */
export type View = {
  readonly x: number;
  readonly y: number;
  readonly s: number;
};

export type Plane = {
  /** The camera's picture, in the units of the plane. */
  readonly camera: Rect;
  /** The finished photo, or null when there is none. */
  readonly edit: Rect | null;
  /** The parts of the finished photo that lie beyond the camera's picture. */
  readonly beyond: ReadonlyArray<Rect>;
};

export const rectOf = (box: Box, within: Rect): Rect => ({
  x: within.x + box.left * within.w,
  y: within.y + box.top * within.h,
  w: (box.right - box.left) * within.w,
  h: (box.bottom - box.top) * within.h,
});

/** A box in fractions of a rectangle, from a rectangle inside or around it. */
export const boxOf = (rect: Rect, within: Rect): Box => ({
  left: (rect.x - within.x) / within.w,
  top: (rect.y - within.y) / within.h,
  right: (rect.x + rect.w - within.x) / within.w,
  bottom: (rect.y + rect.h - within.y) / within.h,
});

/** The strips of a rectangle that lie outside another one. */
const outside = (rect: Rect, within: Rect): ReadonlyArray<Rect> => {
  const right = rect.x + rect.w;
  const bottom = rect.y + rect.h;
  const innerRight = within.x + within.w;
  const innerBottom = within.y + within.h;
  const top = Math.max(rect.y, within.y);
  const height = Math.min(bottom, innerBottom) - top;
  return [
    { x: rect.x, y: rect.y, w: rect.w, h: within.y - rect.y },
    { x: rect.x, y: innerBottom, w: rect.w, h: bottom - innerBottom },
    { x: rect.x, y: top, w: within.x - rect.x, h: height },
    { x: innerRight, y: top, w: right - innerRight, h: height },
  ].filter(({ w, h }) => w > within.w * tiny && h > within.h * tiny);
};

/** Less than this share of the picture is a rounding error, not a strip. */
const tiny = 0.002;

export const planeOf = ({ picture, edit }: PhotoView): Plane => {
  const camera = { x: 0, y: 0, w: picture.width, h: picture.height };
  const cut = edit === null ? null : rectOf(edit.crop, camera);
  return {
    camera,
    edit: cut,
    beyond: cut === null ? [] : outside(cut, camera),
  };
};

/** The smallest rectangle around two. */
export const around = (one: Rect, other: Rect): Rect => {
  const x = Math.min(one.x, other.x);
  const y = Math.min(one.y, other.y);
  return {
    x,
    y,
    w: Math.max(one.x + one.w, other.x + other.w) - x,
    h: Math.max(one.y + one.h, other.y + other.h) - y,
  };
};

/** The view with which a part of the plane fills a part of the screen. */
export const fitted = (part: Rect, screen: Rect): View => {
  const s = Math.min(screen.w / part.w, screen.h / part.h);
  return {
    x: screen.x + (screen.w - part.w * s) / 2 - part.x * s,
    y: screen.y + (screen.h - part.h * s) / 2 - part.y * s,
    s,
  };
};

/** The view with which a part of the plane lies exactly on a frame of the table. */
export const cover = (part: Rect, frame: Rect): View => {
  const s = frame.w / part.w;
  return { x: frame.x - part.x * s, y: frame.y - part.y * s, s };
};

/** Where a part of the plane is on the screen. */
export const onScreen = (part: Rect, { x, y, s }: View): Rect => ({
  x: part.x * s + x,
  y: part.y * s + y,
  w: part.w * s,
  h: part.h * s,
});

/** The same view, larger or smaller about a point of the screen. */
export const zoomAbout = (
  view: View,
  ratio: number,
  point: { readonly x: number; readonly y: number },
): View => ({
  x: point.x - (point.x - view.x) * ratio,
  y: point.y - (point.y - view.y) * ratio,
  s: view.s * ratio,
});

/**
 * The nearest view that doesn't leave room beside the part looked at: a part
 * smaller than the screen sits in its middle, a larger one covers it.
 */
export const keptIn = (view: View, part: Rect, screen: Rect): View => {
  const shown = onScreen(part, view);
  const along = (start: number, length: number, from: number, room: number) => {
    if (length <= room) {
      return from + (room - length) / 2 - start;
    }
    return Math.min(from - start, Math.max(from + room - length - start, 0));
  };
  return {
    x: view.x + along(shown.x, shown.w, screen.x, screen.w),
    y: view.y + along(shown.y, shown.h, screen.y, screen.h),
    s: view.s,
  };
};
