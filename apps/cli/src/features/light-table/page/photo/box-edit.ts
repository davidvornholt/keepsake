import type { Box } from '../../contract.ts';
import { clamp } from '../motion/spring.ts';

// What can be done to a box that was drawn on a photo: it is moved as a
// whole, or one of its sides or corners is pulled. A box is in fractions of
// the photo, never leaves it, and never gets smaller than can be grabbed.

/** The side or corner of a box that is pulled, by the points of the compass. */
export type Handle = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';

export const handles: ReadonlyArray<Handle> = [
  'nw',
  'n',
  'ne',
  'e',
  'se',
  's',
  'sw',
  'w',
];

/** A distance in fractions of the photo, across and down. */
export type By = { readonly x: number; readonly y: number };

/** The same box somewhere else, as far as the photo reaches. */
export const moved = (box: Box, by: By): Box => {
  const x = clamp(by.x, -box.left, 1 - box.right);
  const y = clamp(by.y, -box.top, 1 - box.bottom);
  return {
    left: box.left + x,
    top: box.top + y,
    right: box.right + x,
    bottom: box.bottom + y,
  };
};

/**
 * The box with one side or corner pulled. The side opposite stays where it
 * is, and the box keeps at least the size given.
 */
export const resized = (box: Box, handle: Handle, by: By, least: By): Box => {
  const pullsLeft = handle.includes('w');
  const pullsRight = handle.includes('e');
  const pullsTop = handle.includes('n');
  const pullsBottom = handle.includes('s');
  return {
    left: pullsLeft
      ? clamp(box.left + by.x, 0, Math.max(0, box.right - least.x))
      : box.left,
    right: pullsRight
      ? clamp(box.right + by.x, Math.min(1, box.left + least.x), 1)
      : box.right,
    top: pullsTop
      ? clamp(box.top + by.y, 0, Math.max(0, box.bottom - least.y))
      : box.top,
    bottom: pullsBottom
      ? clamp(box.bottom + by.y, Math.min(1, box.top + least.y), 1)
      : box.bottom,
  };
};

const directions: ReadonlyMap<string, By> = new Map([
  ['ArrowLeft', { x: -1, y: 0 }],
  ['ArrowRight', { x: 1, y: 0 }],
  ['ArrowUp', { x: 0, y: -1 }],
  ['ArrowDown', { x: 0, y: 1 }],
]);

/**
 * What an arrow key does to a box: it moves it a step, or, with shift held,
 * pulls its right or lower side. Null for any other key.
 */
export const nudged = (
  box: Box,
  key: string,
  how: { readonly isResizing: boolean; readonly step: By; readonly least: By },
): Box | null => {
  const direction = directions.get(key);
  if (direction === undefined) {
    return null;
  }
  const by = { x: direction.x * how.step.x, y: direction.y * how.step.y };
  if (!how.isResizing) {
    return moved(box, by);
  }
  return resized(box, direction.x === 0 ? 's' : 'e', by, how.least);
};

/** Whether two boxes are the same, but for what rounding does. */
export const isSameBox = (one: Box, other: Box): boolean =>
  one.left === other.left &&
  one.top === other.top &&
  one.right === other.right &&
  one.bottom === other.bottom;
