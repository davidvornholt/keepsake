import type { Size } from '../../../shared/pictures.ts';
import { channels, type Plane, type Planes } from '../pixels/raster.ts';
import { averaging } from '../pixels/smooth.ts';
import { grown } from './outline.ts';

// In pixels of the small view.
/** Light that changes over a shorter distance than this is texture. */
const textureRadius = 1;
/** Below this, light is mostly noise. */
const darkest = 0.02;
/** So wide an edge is always the edit's, which has no seam there. */
const edge = 1;
/** How far the edit's person reaches into the original's at most. */
const rim = 4;
/** What differs more than this is seen at the edge, */
const seen = 0.06;
/** and what is further from it may differ more. */
const seenPerPixel = 0.025;
/** How much better the surroundings explain a place that is none of them. */
const explained = 0.6;
const softness = { grow: 0, edge: 1 };

const half = 0.5;

const neighboursOf = (index: number, { width, height }: Size) => {
  const column = index % width;
  const row = Math.floor(index / width);
  return [
    ...(column > 0 ? [index - 1] : []),
    ...(column < width - 1 ? [index + 1] : []),
    ...(row > 0 ? [index - width] : []),
    ...(row < height - 1 ? [index + width] : []),
  ];
};

/** Goes from pixel to pixel, as far as it may. */
const spread = (
  start: ReadonlyArray<number>,
  size: Size,
  enters: (pixel: number, step: number) => boolean,
): void => {
  let front = start;
  for (let step = 1; front.length > 0; step += 1) {
    const next: Array<number> = [];
    for (const pixel of front) {
      for (const neighbour of neighboursOf(pixel, size)) {
        if (enters(neighbour, step)) {
          next.push(neighbour);
        }
      }
    }
    front = next;
  }
};

const pixelsWhere = (plane: Plane, isWanted: (value: number) => boolean) =>
  Array.from(plane.keys()).filter((pixel) => isWanted(plane[pixel] ?? 0));

/** How many pixels it is from each one to the edge of a region. */
const depthsOf = (region: Plane, size: Size): Plane => {
  const outside = pixelsWhere(region, (part) => part <= half);
  const depths = region.map((part) =>
    part <= half ? 0 : Number.POSITIVE_INFINITY,
  );
  spread(outside, size, (pixel, step) => {
    const isNew = (depths[pixel] ?? 0) > step;
    if (isNew) {
      depths[pixel] = step;
    }
    return isNew;
  });
  return depths;
};

/** How differently two pictures show a place, whatever its texture. */
const differenceOf = (left: Planes, right: Planes, size: Size): Plane => {
  const calm = averaging(
    new Float32Array(left[0].length).fill(1),
    size,
    textureRadius,
  );
  const sum = new Float32Array(left[0].length);
  for (const channel of channels) {
    const change = calm(
      left[channel].map((light, pixel) =>
        Math.log(((right[channel][pixel] ?? 0) + darkest) / (light + darkest)),
      ),
    );
    for (const [pixel, value] of change.entries()) {
      sum[pixel] = (sum[pixel] ?? 0) + Math.abs(value) / channels.length;
    }
  }
  return sum;
};

/** The same small view of several pictures. */
export type Pictures = {
  readonly edit: Planes;
  /** The original in the light of the edit. */
  readonly relit: Planes;
  /** The same as if nothing of it was the person. */
  readonly relitSurroundings: Planes;
};

/**
 * How much of each pixel is replaced: the person, from inside up to where the
 * edit and what replaces it show the same. Beyond that the edit stays, so no
 * seam is seen, whether the person moved a little or the outline was wrong.
 * `features` are replaced in any case.
 */
export const replacedPart = (
  person: Plane,
  features: Plane,
  { edit, relit, relitSurroundings }: Pictures,
  size: Size,
): Plane => {
  const difference = differenceOf(relit, edit, size);
  const fromSurroundings = differenceOf(relitSurroundings, edit, size);
  const depths = depthsOf(person, size);
  const stays = person.map((_, pixel) =>
    (depths[pixel] ?? 0) <= edge && (features[pixel] ?? 0) <= half ? 1 : 0,
  );
  spread(
    pixelsWhere(stays, (part) => part > half),
    size,
    (pixel) => {
      const depth = depths[pixel] ?? 0;
      const differs = difference[pixel] ?? 0;
      const isNew =
        (stays[pixel] ?? 0) <= half &&
        (features[pixel] ?? 0) <= half &&
        differs > seen + seenPerPixel * depth &&
        (depth <= rim || (fromSurroundings[pixel] ?? 0) < explained * differs);
      if (isNew) {
        stays[pixel] = 1;
      }
      return isNew;
    },
  );
  return grown(
    stays.map((part) => 1 - part),
    size,
    softness,
  );
};
