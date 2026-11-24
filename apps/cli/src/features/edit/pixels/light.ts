import { clamp } from '../../../shared/boxes.ts';
import type { Size } from '../../../shared/pictures.ts';
import { fitted, guidedFilter } from './guided.ts';
import {
  brightnessOf,
  mapPlanes,
  type Plane,
  type Planes,
  srgbOf,
} from './raster.ts';
import { averaging } from './smooth.ts';

// In pixels of the small view. Light that changes over a shorter distance than
// these is a feature rather than light.
const featureRadius = 2;
const lightRadius = 6;
const lightCalm = 0.003;
/** Colour follows the edit only slowly and a little, so nothing is recoloured. */
const colourRadius = 8;
const colourCalm = 0.02;
const mostColour = 0.35;

/** Below this, light is mostly noise. */
const darkest = 0.015;
/** Below this, colour is hardly seen. */
const colourless = 0.06;
/** From here on highlights are compressed rather than cut off. */
const knee = 0.8;

/** By how much light changed, in natural logarithms. */
const ratio = (before: Plane, after: Plane, least: number): Plane =>
  before.map((light, index) =>
    Math.log(((after[index] ?? 0) + least) / (light + least)),
  );

/**
 * By how much an edit changed the light of each channel, smooth except where
 * the original has an edge, as natural logarithms. Pixels count by their
 * weight.
 */
export const lightChange = (
  before: Planes,
  after: Planes,
  weights: Plane,
  size: Size,
): Planes => {
  const withoutFeatures = averaging(weights, size, featureRadius);
  const calmBefore = mapPlanes(before, withoutFeatures);
  const calmAfter = mapPlanes(after, withoutFeatures);
  const guide = mapPlanes(calmBefore, (plane) => plane.map(srgbOf));
  const greyBefore = brightnessOf(calmBefore);
  const greyAfter = brightnessOf(calmAfter);
  const follow = guidedFilter(
    guide,
    averaging(weights, size, lightRadius),
    lightCalm,
  );
  const light = fitted(follow(ratio(greyBefore, greyAfter, darkest)), guide);
  const grey = ratio(greyBefore, greyAfter, colourless);
  const followColour = guidedFilter(
    guide,
    averaging(weights, size, colourRadius),
    colourCalm,
  );
  return mapPlanes(calmBefore, (plane, channel) => {
    const shift = ratio(plane, calmAfter[channel], colourless).map(
      (value, index) => value - (grey[index] ?? 0),
    );
    const colour = fitted(followColour(shift), guide);
    return light.map(
      (value, index) =>
        value + clamp(colour[index] ?? 0, -mostColour, mostColour),
    );
  });
};

/** Light after a change, with highlights that were lifted kept below white. */
export const relit = (light: number, change: number): number => {
  const changed = light * Math.exp(change);
  if (changed <= knee) {
    return changed;
  }
  const compressed =
    knee + (1 - knee) * (1 - Math.exp(-(changed - knee) / (1 - knee)));
  return Math.max(compressed, Math.min(changed, light));
};
