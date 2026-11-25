import { clamp } from '../../shared/boxes.ts';
import type { Box } from '../../shared/domain.ts';

/** The sides of a photo that a subject can face. */
export const sides = ['left', 'right', 'neither'] as const;
export type Side = (typeof sides)[number];

/** The least that is in front of a subject, of all the room beside it. */
const ahead = 0.6;

/** The same seen in a mirror. */
const mirrored = ({ left, right, ...box }: Box): Box => ({
  ...box,
  left: 1 - right,
  right: 1 - left,
});

type Framed = {
  readonly subject: Box;
  readonly facing: Side;
  /** What stays in the frame. */
  readonly held: ReadonlyArray<Box>;
};

const movedLeft = (frame: Box, { subject, held }: Framed): Box => {
  const front = subject.left - frame.left;
  const behind = frame.right - subject.right;
  const needed = ahead * (front + behind) - front;
  const inPhoto = Math.max(frame.left, 0);
  const spare =
    frame.right - Math.max(subject.right, ...held.map(({ right }) => right));
  const step = clamp(needed, 0, Math.max(0, Math.min(inPhoto, spare)));
  return { ...frame, left: frame.left - step, right: frame.right - step };
};

/**
 * A frame moved to the side, so that a subject that looks or moves to one side
 * has clearly more room in front than behind. It shows no more of what is
 * beyond the photo than before.
 */
export const withRoomAhead = (frame: Box, framed: Framed): Box => {
  switch (framed.facing) {
    case 'left':
      return movedLeft(frame, framed);
    case 'right':
      return mirrored(
        movedLeft(mirrored(frame), {
          ...framed,
          subject: mirrored(framed.subject),
          held: framed.held.map(mirrored),
        }),
      );
    default:
      return frame;
  }
};
