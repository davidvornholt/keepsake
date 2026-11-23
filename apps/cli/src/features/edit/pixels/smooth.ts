import type { Size } from '../../../shared/pictures.ts';
import type { Plane } from './raster.ts';

/** Two passes look much like a Gaussian blur. */
const passes = 2;

type Line = {
  readonly start: number;
  readonly step: number;
  readonly length: number;
};

/** Adds up the neighbours within a radius along one row or column. */
const sumLine = (
  source: Plane,
  target: Plane,
  { start, step, length }: Line,
  radius: number,
) => {
  let sum = 0;
  for (let ahead = 0; ahead < Math.min(radius, length); ahead += 1) {
    sum += source[start + ahead * step] ?? 0;
  }
  for (let place = 0; place < length; place += 1) {
    const entering = place + radius;
    const leaving = place - radius - 1;
    sum += entering < length ? (source[start + entering * step] ?? 0) : 0;
    sum -= leaving >= 0 ? (source[start + leaving * step] ?? 0) : 0;
    target[start + place * step] = sum;
  }
};

/** Adds up the neighbours of every pixel, the closer ones more often. */
export const gathered = (
  plane: Plane,
  { width, height }: Size,
  radius: number,
): Plane => {
  let values = plane;
  for (let pass = 0; pass < passes; pass += 1) {
    const rows = new Float32Array(values.length);
    for (let y = 0; y < height; y += 1) {
      const line = { start: y * width, step: 1, length: width };
      sumLine(values, rows, line, radius);
    }
    const columns = new Float32Array(values.length);
    for (let x = 0; x < width; x += 1) {
      const line = { start: x, step: width, length: height };
      sumLine(rows, columns, line, radius);
    }
    values = columns;
  }
  return values;
};

export const multiplied = (left: Plane, right: Plane): Plane =>
  left.map((value, index) => value * (right[index] ?? 0));

/** Averages of a plane's neighbourhoods. */
export type Average = (plane: Plane) => Plane;

const hardlyAny = 1e-3;

/**
 * Averages in which each pixel counts by its weight. Where no neighbour
 * counts, the average is 0.
 */
export const averaging = (
  weights: Plane,
  size: Size,
  radius: number,
): Average => {
  const total = gathered(weights, size, radius);
  return (plane) =>
    gathered(multiplied(plane, weights), size, radius).map((sum, index) => {
      const weight = total[index] ?? 0;
      return weight > hardlyAny ? sum / weight : 0;
    });
};
