import { clamp, tidyBox } from '../../shared/boxes.ts';
import type { Box } from '../../shared/domain.ts';

/** A close-up shows this many times what has to be sharp. */
const margin = 1.6;
const smallest = 0.15;

/** A stretch around the same middle, with a margin, inside 0 to 1. */
const widened = (from: number, to: number) => {
  const length = clamp((to - from) * margin, smallest, 1);
  const start = clamp((from + to - length) / 2, 0, 1 - length);
  return [start, start + length] as const;
};

/** A box around what has to be sharp, with room to see what is around it. */
export const closeUpOf = (focus: Box): Box => {
  const box = tidyBox(focus);
  const [left, right] = widened(box.left, box.right);
  const [top, bottom] = widened(box.top, box.bottom);
  return { left, top, right, bottom };
};
