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

/** Whether an edge of the photo cuts off what is at a position beside it. */
const cutOff = (position: number, edge: 0 | 1): boolean =>
  edge === 0 ? position <= closeToEdge : position >= 1 - closeToEdge;

/**
 * A frame that uses the room its photo has. It reaches beyond an edge only
 * where that cuts off the subject or something that belongs to the photo, or
 * leaves too little room beside the subject.
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
  /** The subject's own room, or no limit where a belonging is cut off. */
  const reach = (forSubject: number, cut: (belonging: Box) => boolean) =>
    belongings.some(cut) ? Number.POSITIVE_INFINITY : forSubject;
  return {
    left: Math.max(
      frame.left,
      -reach(missing(subject.left, width, sideways('left')), ({ left }) =>
        cutOff(left, 0),
      ),
    ),
    top: Math.max(
      frame.top,
      -reach(missing(subject.top, height, beside), ({ top }) => cutOff(top, 0)),
    ),
    right: Math.min(
      frame.right,
      1 +
        reach(
          missing(1 - subject.right, width, sideways('right')),
          ({ right }) => cutOff(right, 1),
        ),
    ),
    bottom: Math.min(
      frame.bottom,
      1 +
        reach(missing(1 - subject.bottom, height, beside), ({ bottom }) =>
          cutOff(bottom, 1),
        ),
    ),
  };
};
