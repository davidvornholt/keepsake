import type { Size } from '../../../shared/pictures.ts';
import { inner } from './outline.ts';
import type { Plane, Planes } from './raster.ts';
import { averaging } from './smooth.ts';

// In pixels of the small view.
/** How far an outline may be off the real edge. */
const unsure = { grow: 3, edge: 1 };
/** How far around a pixel the person and the surroundings are looked up. */
const searchRadius = 11;
/** The difference in colour that weighs as much as a distance of one pixel. */
const perPixel = 0.006;
/** How much the outline counts where the colours don't tell. */
const trust = 0.002;

const half = 0.5;

type Sides = { readonly inside: Plane; readonly outside: Plane };

/** How different the colours of two pixels are. */
const difference = (colours: Planes, left: number, right: number): number => {
  let sum = 0;
  for (const plane of colours) {
    sum += ((plane[left] ?? 0) - (plane[right] ?? 0)) ** 2;
  }
  return sum;
};

/** How different a pixel is from the most similar one on either side. */
const differences = (
  colours: Planes,
  sides: Sides,
  { width, height }: Size,
  index: number,
) => {
  const column = index % width;
  const row = Math.floor(index / width);
  const nearest = {
    inside: Number.POSITIVE_INFINITY,
    outside: Number.POSITIVE_INFINITY,
  };
  const right = Math.min(width - 1, column + searchRadius);
  const bottom = Math.min(height - 1, row + searchRadius);
  for (let y = Math.max(0, row - searchRadius); y <= bottom; y += 1) {
    for (let x = Math.max(0, column - searchRadius); x <= right; x += 1) {
      const other = y * width + x;
      const isInside = (sides.inside[other] ?? 0) > half;
      const isOutside = (sides.outside[other] ?? 0) > half;
      if (isInside || isOutside) {
        const side = isInside ? 'inside' : 'outside';
        const distance = ((x - column) ** 2 + (y - row) ** 2) * perPixel ** 2;
        nearest[side] = Math.min(
          nearest[side],
          difference(colours, index, other) + distance,
        );
      }
    }
  }
  return nearest;
};

/** How much of each pixel is a person, and what is certain. */
export type Matte = Sides & { readonly matte: Plane };

/**
 * Finds a person's edge from a rough outline: near the outline, a pixel
 * belongs to the side that has colours like its own.
 */
export const matteOf = (colours: Planes, mask: Plane, size: Size): Matte => {
  const sides: Sides = {
    inside: inner(mask, size, unsure),
    outside: inner(
      mask.map((part) => 1 - part),
      size,
      unsure,
    ),
  };
  const everywhere = new Float32Array(mask.length).fill(1);
  const guess = averaging(everywhere, size, unsure.grow)(mask);
  const matte = mask.map((_, index) => {
    if ((sides.inside[index] ?? 0) > half) {
      return 1;
    }
    if ((sides.outside[index] ?? 0) > half) {
      return 0;
    }
    const { inside, outside } = differences(colours, sides, size, index);
    const guessed = guess[index] ?? 0;
    return Number.isFinite(inside + outside)
      ? (outside + trust * guessed) / (inside + outside + trust)
      : guessed;
  });
  return { ...sides, matte: averaging(everywhere, size, 1)(matte) };
};
