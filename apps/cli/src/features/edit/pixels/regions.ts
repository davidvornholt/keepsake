import type { Size } from '../../../shared/pictures.ts';
import type { Plane } from './raster.ts';

/** The pixels beside a pixel. */
const besides = (index: number, { width, height }: Size) => {
  const column = index % width;
  const row = Math.floor(index / width);
  return [
    ...(column > 0 ? [index - 1] : []),
    ...(column < width - 1 ? [index + 1] : []),
    ...(row > 0 ? [index - width] : []),
    ...(row < height - 1 ? [index + width] : []),
  ];
};

/** The pixels of each region in which values above 0 touch each other. */
const regionsOf = (
  plane: Plane,
  size: Size,
): ReadonlyArray<ReadonlyArray<number>> => {
  const isNew = plane.map((value) => (value > 0 ? 1 : 0));
  const regions: Array<ReadonlyArray<number>> = [];
  const take = (index: number, region: Array<number>) => {
    if (isNew[index] === 1) {
      isNew[index] = 0;
      region.push(index);
    }
  };
  for (const first of isNew.keys()) {
    const region: Array<number> = [];
    take(first, region);
    for (const index of region) {
      for (const beside of besides(index, size)) {
        take(beside, region);
      }
    }
    if (region.length > 0) {
      regions.push(region);
    }
  }
  return regions;
};

/** A plane without regions that add up to much less than the largest one. */
export const withoutSpecks = (
  plane: Plane,
  size: Size,
  /** How much of the largest region a region has to be. */
  share: number,
): Plane => {
  const regions = regionsOf(plane, size).map((pixels) => ({
    pixels,
    sum: pixels.reduce((sum, index) => sum + (plane[index] ?? 0), 0),
  }));
  const least =
    share * regions.reduce((most, { sum }) => Math.max(most, sum), 0);
  const result = new Float32Array(plane.length);
  for (const { pixels, sum } of regions) {
    if (sum >= least) {
      for (const index of pixels) {
        result[index] = plane[index] ?? 0;
      }
    }
  }
  return result;
};
