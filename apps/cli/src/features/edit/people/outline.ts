import type { Person, Point } from '../../../shared/domain.ts';
import type { Frame, Size } from '../../../shared/pictures.ts';
import type { Plane } from '../pixels/raster.ts';
import { averaging, gathered } from '../pixels/smooth.ts';

const half = 0.5;

/** Whether a point is inside an outline. */
export const isInside = (
  outline: ReadonlyArray<Point>,
  { x, y }: Point,
): boolean => {
  let inside = false;
  let before = outline.at(-1);
  for (const point of outline) {
    if (
      before !== undefined &&
      point.y > y !== before.y > y &&
      x <
        ((before.x - point.x) * (y - point.y)) / (before.y - point.y) + point.x
    ) {
      inside = !inside;
    }
    before = point;
  }
  return inside;
};

/** Whether a point is in the ellipse that fills a face's box. */
const isInFace = ({ face }: Person, { x, y }: Point): boolean => {
  const across =
    (x - (face.left + face.right) * half) / (face.right - face.left);
  const down = (y - (face.top + face.bottom) * half) / (face.bottom - face.top);
  return across * across + down * down <= half * half;
};

/** 1 where a person is and 0 elsewhere, in a small view of a frame. */
export const personMask = (
  person: Person,
  picture: Size,
  frame: Frame,
  size: Size,
): Plane =>
  Float32Array.from({ length: size.width * size.height }, (_, index) => {
    const column = index % size.width;
    const row = Math.floor(index / size.width);
    const point = {
      x:
        (frame.left + ((column + half) * frame.width) / size.width) /
        picture.width,
      y:
        (frame.top + ((row + half) * frame.height) / size.height) /
        picture.height,
    };
    return isInside(person.outline, point) || isInFace(person, point) ? 1 : 0;
  });

/** A mask with a soft edge, whose pixels at the border of the view count on. */
const softEdge = (mask: Plane, size: Size, radius: number): Plane => {
  const ones = new Float32Array(mask.length).fill(1);
  return averaging(ones, size, radius)(mask);
};

/** A mask that reaches further by twice `grow` pixels, with a soft edge. */
export const grown = (
  mask: Plane,
  size: Size,
  { grow, edge }: { readonly grow: number; readonly edge: number },
): Plane =>
  softEdge(
    gathered(mask, size, grow).map((sum) => (sum > half ? 1 : 0)),
    size,
    edge,
  );

/** What is well inside a mask, with a soft edge. */
export const inner = (
  mask: Plane,
  size: Size,
  shape: { readonly grow: number; readonly edge: number },
): Plane =>
  grown(
    mask.map((part) => 1 - part),
    size,
    shape,
  ).map((part) => 1 - part);
