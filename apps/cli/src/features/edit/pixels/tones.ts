import { clamp } from '../../../shared/boxes.ts';
import type { Size } from '../../../shared/pictures.ts';
import {
  brightest,
  brightnessOf,
  lightOf,
  mapPlanes,
  type Plane,
  type Planes,
  srgbOf,
} from './raster.ts';
import { averaging } from './smooth.ts';

/** A brightness before and after a change of light, from 0 to 1. */
export type Tone = { readonly before: number; readonly after: number };

/** How many steps from the darkest to the brightest are compared. */
const steps = 32;
/** Steps that are closer together than this are one. */
const closest = 0.02;
/** What varies over a shorter distance is grain. */
const grain = 1;
/** The most that light is multiplied by. */
const mostGain = 12;
/** How much less or more colourful a picture may become. */
const colourful = { least: 0.7, most: 1.6 };
const hardlyAny = 1e-6;

const inSteps = (plane: Plane): ReadonlyArray<number> => {
  const sorted = plane.toSorted();
  return Array.from(
    { length: steps + 1 },
    (_, step) => sorted[Math.round((step / steps) * (sorted.length - 1))] ?? 0,
  );
};

/** How a change of light changed each brightness, from dark to bright. */
export const tonesOf = (before: Plane, after: Plane): ReadonlyArray<Tone> => {
  const changed = inSteps(after);
  let last: Tone = { before: 0, after: 0 };
  const tones = [last];
  for (const [step, value] of inSteps(before).entries()) {
    if (value - last.before > closest) {
      last = { before: value, after: Math.max(changed[step] ?? 0, last.after) };
      tones.push(last);
    }
  }
  tones.push({ before: 1, after: 1 });
  return tones;
};

/** What a brightness from 0 to 1 becomes. */
export const toneOf = (tones: ReadonlyArray<Tone>, value: number): number => {
  const next = Math.max(
    1,
    tones.findIndex(({ before }) => before >= value),
  );
  const low = tones[next - 1] ?? { before: 0, after: 0 };
  const high = tones[next] ?? { before: 1, after: 1 };
  const part =
    high.before > low.before
      ? (value - low.before) / (high.before - low.before)
      : 0;
  return low.after + clamp(part, 0, 1) * (high.after - low.after);
};

const calmBrightness = (values: Planes, size: Size): Plane => {
  const everywhere = new Float32Array(size.width * size.height).fill(1);
  return averaging(everywhere, size, grain)(brightnessOf(values));
};

const onlyCounted = (plane: Plane, counted: Plane): Plane =>
  plane.filter((_, index) => (counted[index] ?? 0) > 0);

/** How far colours are from grey in all. */
const colourOf = (values: Planes, counted: Plane): number => {
  const grey = brightnessOf(values);
  return values.reduce(
    (sum, plane) =>
      plane.reduce(
        (colour, value, index) =>
          colour + (counted[index] ?? 0) * Math.abs(value - (grey[index] ?? 0)),
        sum,
      ),
    0,
  );
};

/**
 * A picture with the light and the colourfulness an edit has, as far as the
 * pixels that count tell, and how that changed each brightness. All values are
 * sRGB from 0 to 1.
 */
export const inLightOf = (
  before: Planes,
  after: Planes,
  counted: Plane,
  size: Size,
) => {
  const tones = tonesOf(
    onlyCounted(calmBrightness(before, size), counted),
    onlyCounted(calmBrightness(after, size), counted),
  );
  const gains = brightnessOf(before).map((value) =>
    Math.min(
      lightOf(toneOf(tones, value)) / lightOf(Math.max(value, 1 / brightest)),
      mostGain,
    ),
  );
  const lit = mapPlanes(before, (plane) =>
    plane.map((value, index) =>
      srgbOf(Math.min(lightOf(value) * (gains[index] ?? 1), 1)),
    ),
  );
  const more = clamp(
    colourOf(after, counted) / Math.max(colourOf(lit, counted), hardlyAny),
    colourful.least,
    colourful.most,
  );
  const grey = brightnessOf(lit);
  const values = mapPlanes(lit, (plane) =>
    plane.map((value, index) => {
      const middle = grey[index] ?? 0;
      return clamp(middle + (value - middle) * more, 0, 1);
    }),
  );
  return { tones, values };
};
