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

/**
 * A frame that uses the room its photo has. It reaches beyond an edge only
 * where that cuts off the subject, or leaves too little room beside it.
 */
export const withOwnRoomFirst = (
  frame: Box,
  subject: Box,
  facing: Side,
): Box => {
  const width = subject.right - subject.left;
  const height = subject.bottom - subject.top;
  const sideways = (side: Side) => (side === facing ? inFront : beside);
  return {
    left: Math.max(frame.left, -missing(subject.left, width, sideways('left'))),
    top: Math.max(frame.top, -missing(subject.top, height, beside)),
    right: Math.min(
      frame.right,
      1 + missing(1 - subject.right, width, sideways('right')),
    ),
    bottom: Math.min(
      frame.bottom,
      1 + missing(1 - subject.bottom, height, beside),
    ),
  };
};
