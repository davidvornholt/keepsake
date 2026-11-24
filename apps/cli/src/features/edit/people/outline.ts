import type { Box, Person, Point } from '../../../shared/domain.ts';
import type { Frame, Size } from '../../../shared/pictures.ts';
import type { Plane } from '../pixels/raster.ts';
import { averaging, gathered } from '../pixels/smooth.ts';

const half = 0.5;
/** How much of a face shows its features and not its edge. */
const features = 0.9;
/** How closely a box is looked at. */
const perSide = 5;
const samples = perSide ** 2;

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

/** How far from the middle of a face a point is, 1 being the face's edge. */
const fromFace = ({ face }: Person, { x, y }: Point): number => {
  const across =
    (x - (face.left + face.right) * half) / (face.right - face.left);
  const down = (y - (face.top + face.bottom) * half) / (face.bottom - face.top);
  return Math.hypot(across, down) / half;
};

/** Whether a point is on a person. An outline may leave out the face. */
const isOn = (person: Person, point: Point): boolean =>
  isInside(person.outline, point) || fromFace(person, point) <= 1;

/** Whether most of a box is on a person, such as one around a cap's logo. */
export const isMostlyOn = (person: Person, box: Box): boolean => {
  const places = Array.from({ length: samples }, (_, place) => ({
    x:
      box.left +
      (((place % perSide) + half) / perSide) * (box.right - box.left),
    y:
      box.top +
      ((Math.floor(place / perSide) + half) / perSide) * (box.bottom - box.top),
  }));
  const on = places.filter((place) => isOn(person, place));
  return on.length > half * samples;
};

/** A small view of a frame of a picture. */
export type SmallView = {
  readonly picture: Size;
  readonly frame: Frame;
  readonly size: Size;
};

/** 1 where a small view shows a place of some kind and 0 elsewhere. */
const maskOf = (
  { picture, frame, size }: SmallView,
  isOfKind: (point: Point) => boolean,
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
    return isOfKind(point) ? 1 : 0;
  });

/** 1 where a person is and 0 elsewhere. */
export const personMask = (person: Person, view: SmallView): Plane =>
  maskOf(view, (point) => isOn(person, point));

/** 1 where the features of a face are and 0 elsewhere. */
export const featuresMask = (person: Person, view: SmallView): Plane =>
  maskOf(view, (point) => fromFace(person, point) <= features);

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
