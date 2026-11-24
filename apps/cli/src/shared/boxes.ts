import type { Box } from './domain.ts';

export const clamp = (value: number, low: number, high: number) =>
  Math.min(Math.max(value, low), high);

/** All of a picture. */
export const wholePicture: Box = { left: 0, top: 0, right: 1, bottom: 1 };

/** A box with its sides in order. */
export const ordered = ({ left, top, right, bottom }: Box): Box => ({
  left: Math.min(left, right),
  top: Math.min(top, bottom),
  right: Math.max(left, right),
  bottom: Math.max(top, bottom),
});

/** A box with its sides in order and inside the picture. */
export const tidyBox = ({ left, top, right, bottom }: Box): Box =>
  ordered({
    left: clamp(left, 0, 1),
    top: clamp(top, 0, 1),
    right: clamp(right, 0, 1),
    bottom: clamp(bottom, 0, 1),
  });

/** How much of a picture's area a box covers, from 0 to 1. */
export const coverage = ({ left, top, right, bottom }: Box): number =>
  (right - left) * (bottom - top);

/** The smallest box around all of the boxes. */
export const around = (boxes: readonly [Box, ...ReadonlyArray<Box>]): Box => ({
  left: Math.min(...boxes.map(({ left }) => left)),
  top: Math.min(...boxes.map(({ top }) => top)),
  right: Math.max(...boxes.map(({ right }) => right)),
  bottom: Math.max(...boxes.map(({ bottom }) => bottom)),
});

/** A box with room on every side, as far as the picture goes. */
export const widened = (
  { left, top, right, bottom }: Box,
  room: number,
): Box => ({
  left: Math.max(left - room, 0),
  top: Math.max(top - room, 0),
  right: Math.min(right + room, 1),
  bottom: Math.min(bottom + room, 1),
});

/** Boxes from a model are never exact. */
const tolerance = 0.005;

export const holds = (outer: Box, inner: Box): boolean =>
  inner.left >= outer.left - tolerance &&
  inner.top >= outer.top - tolerance &&
  inner.right <= outer.right + tolerance &&
  inner.bottom <= outer.bottom + tolerance;
