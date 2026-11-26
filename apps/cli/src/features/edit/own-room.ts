import type { Box } from '../../shared/domain.ts';
import type { Side } from './room-ahead.ts';

/** How much room there is in front of a subject, of its own width, … */
const inFront = 0.5;
/** … and on its other sides, of its width or height. */
const beside = 0.15;
/** Boxes from a model are never exact. */
const closeToEdge = 0.01;

/** How much further than the photo a frame may reach on one side. */
const missing = (own: number, extent: number, least: number): number =>
  own <= closeToEdge
    ? Number.POSITIVE_INFINITY
    : Math.max(0, extent * least - own);

/** How far beyond the photo a frame may reach to complete what an edge cuts off. */
const completing = (own: number): number =>
  own <= closeToEdge ? Number.POSITIVE_INFINITY : 0;

/**
 * A frame that uses the room its photo has. It reaches beyond an edge only
 * where that cuts off the subject or something that belongs to the photo, such
 * as the flower a bee flies to, or leaves too little room beside the subject.
 */
export const withOwnRoomFirst = (
  frame: Box,
  subject: Box,
  facing: Side,
  belongings: ReadonlyArray<Box>,
): Box => {
  const width = subject.right - subject.left;
  const height = subject.bottom - subject.top;
  const sideways = (side: Side) => (side === facing ? inFront : beside);
  const reach = (forSubject: number, gaps: ReadonlyArray<number>): number =>
    Math.max(forSubject, ...gaps.map(completing));
  return {
    left: Math.max(
      frame.left,
      -reach(
        missing(subject.left, width, sideways('left')),
        belongings.map(({ left }) => left),
      ),
    ),
    top: Math.max(
      frame.top,
      -reach(
        missing(subject.top, height, beside),
        belongings.map(({ top }) => top),
      ),
    ),
    right: Math.min(
      frame.right,
      1 +
        reach(
          missing(1 - subject.right, width, sideways('right')),
          belongings.map(({ right }) => 1 - right),
        ),
    ),
    bottom: Math.min(
      frame.bottom,
      1 +
        reach(
          missing(1 - subject.bottom, height, beside),
          belongings.map(({ bottom }) => 1 - bottom),
        ),
    ),
  };
};
