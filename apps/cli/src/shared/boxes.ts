import type { Box } from './domain.ts';

export const clamp = (value: number, low: number, high: number) =>
  Math.min(Math.max(value, low), high);

/** A box with its sides in order and inside the picture. */
export const tidyBox = (box: Box): Box => {
  const xs = [box.left, box.right].map((x) => clamp(x, 0, 1));
  const ys = [box.top, box.bottom].map((y) => clamp(y, 0, 1));
  return {
    left: Math.min(...xs),
    top: Math.min(...ys),
    right: Math.max(...xs),
    bottom: Math.max(...ys),
  };
};

/** How much of a picture's area a box covers, from 0 to 1. */
export const coverage = ({ left, top, right, bottom }: Box): number =>
  (right - left) * (bottom - top);
