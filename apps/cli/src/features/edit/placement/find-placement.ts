import type { Frame, Raster, Size } from '../../../shared/pictures.ts';
import { type Line, type Placement, placed, placeOf } from './placement.ts';
import { roughShiftOf } from './shift.ts';

/** How far an edit may have moved something, in shares of the longer side. */
const furthest = 0.12;
/** It is looked for in a view in which the longer side is this long. */
const viewSide = 400;
/** The parts that are looked for, in pixels of that view. */
const part = { side: 56, step: 40 };
const slightly = 1.1;
const clearly = 1.2;
/**
 * How much larger the photo is made before looking. Parts are only found when
 * the edit shows them about as large.
 */
const enlargements = [1, slightly, clearly];
/** Less likeness than this tells nothing. */
const leastLikeness = 0.45;
/** Parts have to be this far apart to tell how large the edit shows them. */
const leastApart = 60;
/** How much larger or smaller an edit may show the photo. */
const mostScale = 1.3;
/** How far from its place a part may be found, in pixels of the view. */
const tolerance = 4;
/** Fewer parts than this may agree by chance, */
const fewest = 6;
/** and so may a smaller share of those that were found. */
const leastAgreeing = 0.5;
/** Moving something less far isn't seen, in shares of the longer side. */
const hardlySeen = 0.004;

const half = 2;

/** A part of the photo and where the edit shows it. */
type Match = {
  readonly from: { readonly x: number; readonly y: number };
  readonly to: { readonly x: number; readonly y: number };
};

const positions = (start: number, length: number, block: number) =>
  Array.from(
    {
      length: Math.max(
        0,
        Math.floor((length / block - part.side) / part.step) + 1,
      ),
    },
    (_, index) => start + index * part.step * block,
  );

/** The photo made larger around its centre, as far as it stays in view. */
const enlarged = (
  original: Raster,
  edit: Raster,
  photo: Frame,
  scale: number,
) => {
  const line = (start: number, length: number): Line => ({
    scale,
    offset: (start + length / half) * (1 - scale),
  });
  const placement: Placement = {
    x: line(photo.left, photo.width),
    y: line(photo.top, photo.height),
  };
  const left = Math.max(0, Math.ceil(placeOf(placement.x, photo.left)));
  const top = Math.max(0, Math.ceil(placeOf(placement.y, photo.top)));
  const right = placeOf(placement.x, photo.left + photo.width);
  const bottom = placeOf(placement.y, photo.top + photo.height);
  return {
    placement,
    raster: scale === 1 ? original : placed(original, edit, photo, placement),
    photo: {
      left,
      top,
      width: Math.min(original.width, Math.floor(right)) - left,
      height: Math.min(original.height, Math.floor(bottom)) - top,
    },
  };
};

const matchesOf = (
  original: Raster,
  edit: Raster,
  { placement, raster, photo }: ReturnType<typeof enlarged>,
  block: number,
): ReadonlyArray<Match> => {
  const side = part.side * block;
  const longest = Math.max(original.width, original.height);
  const room = Math.ceil((furthest * longest) / block) * block;
  const cameFrom = ({ scale, offset }: Line, position: number) =>
    (position - offset) / scale;
  return positions(photo.top, photo.height, block).flatMap((top) =>
    positions(photo.left, photo.width, block).flatMap((left) => {
      const frame = { left, top, width: side, height: side };
      const shift = roughShiftOf(raster, edit, frame, { room, block });
      const x = left + side / half;
      const y = top + side / half;
      return shift.likeness < leastLikeness
        ? []
        : [
            {
              from: {
                x: cameFrom(placement.x, x),
                y: cameFrom(placement.y, y),
              },
              to: { x: x + shift.x, y: y + shift.y },
            },
          ];
    }),
  );
};

/** The line closest to all points. */
const fitted = (points: ReadonlyArray<readonly [number, number]>): Line => {
  const mean = (values: ReadonlyArray<number>) =>
    values.reduce((sum, value) => sum + value, 0) / values.length;
  const from = mean(points.map(([value]) => value));
  const to = mean(points.map(([, value]) => value));
  let products = 0;
  let squares = 0;
  for (const point of points) {
    products += (point[0] - from) * (point[1] - to);
    squares += (point[0] - from) ** 2;
  }
  const scale = squares > 0 ? products / squares : 1;
  return { scale, offset: to - scale * from };
};

const placementFrom = (matches: ReadonlyArray<Match>): Placement => ({
  x: fitted(matches.map(({ from, to }) => [from.x, to.x])),
  y: fitted(matches.map(({ from, to }) => [from.y, to.y])),
});

const isPlausible = ({ scale }: Line) =>
  scale <= mostScale && scale >= 1 / mostScale;

/** The largest set of matches that one placement explains. */
const agreeing = (
  matches: ReadonlyArray<Match>,
  block: number,
): ReadonlyArray<Match> => {
  let best: ReadonlyArray<Match> = [];
  for (const [index, left] of matches.entries()) {
    for (const right of matches.slice(index + 1)) {
      const apart = Math.min(
        Math.abs(right.from.x - left.from.x),
        Math.abs(right.from.y - left.from.y),
      );
      const { x, y } = placementFrom([left, right]);
      if (apart >= leastApart * block && isPlausible(x) && isPlausible(y)) {
        const found = matches.filter(
          ({ from, to }) =>
            Math.hypot(placeOf(x, from.x) - to.x, placeOf(y, from.y) - to.y) <=
            tolerance * block,
        );
        best = found.length > best.length ? found : best;
      }
    }
  }
  return best;
};

/** How far it moves the corner that it moves furthest. */
const movedBy = ({ x, y }: Placement, { width, height }: Size): number =>
  Math.max(
    Math.abs(placeOf(x, 0)),
    Math.abs(placeOf(x, width) - width),
    Math.abs(placeOf(y, 0)),
    Math.abs(placeOf(y, height) - height),
  );

/**
 * Where an edit shows what the original shows, or null when it is where it
 * was or can't be found. Image models show a photo a little larger or further
 * to a side, above all when they continue the scene beyond it. `photo` is the
 * part of the original that is the photo.
 */
export const findPlacement = (
  original: Raster,
  edit: Raster,
  photo: Frame,
): Placement | null => {
  const longest = Math.max(original.width, original.height);
  const block = Math.max(1, Math.round(longest / viewSide));
  for (const enlargement of enlargements) {
    const view = enlarged(original, edit, photo, enlargement);
    const matches = matchesOf(original, edit, view, block);
    const found = agreeing(matches, block);
    if (
      found.length >= fewest &&
      found.length >= leastAgreeing * matches.length
    ) {
      const placement = placementFrom(found);
      return movedBy(placement, original) < hardlySeen * longest
        ? null
        : placement;
    }
  }
  return null;
};
