import { describe, expect, it } from 'bun:test';
import type { Box } from '../../shared/domain.ts';
import { withOwnRoomFirst } from './own-room.ts';
import type { Side } from './room-ahead.ts';

const digits = 6;
const beyond = { left: -0.2, top: -0.2, right: 1.2, bottom: 1.2 };

/** The sides of a frame: left, top, right and bottom. */
const framed = (
  frame: Box,
  subject: Box,
  facing: Side,
  belongings: ReadonlyArray<Box> = [],
) => {
  const box = withOwnRoomFirst(frame, subject, facing, belongings);
  return [box.left, box.top, box.right, box.bottom].map((side) =>
    Number(side.toFixed(digits)),
  );
};

describe('withOwnRoomFirst', () => {
  it('stays in a photo that has room beside its subject', () => {
    const subject = { left: 0.3, top: 0.3, right: 0.7, bottom: 0.7 };
    expect(framed(beyond, subject, 'left')).toEqual([0, 0, 1, 1]);
  });

  it('completes a subject that an edge cuts off', () => {
    const subject = { left: 0, top: 0.3, right: 0.5, bottom: 0.995 };
    expect(framed(beyond, subject, 'neither')).toEqual([-0.2, 0, 1, 1.2]);
  });

  it('completes what belongs to the photo where an edge cuts it off', () => {
    const bee = { left: 0.45, top: 0.17, right: 0.62, bottom: 0.37 };
    const flower = { left: 0.15, top: 0.3, right: 0.7, bottom: 1 };
    expect(framed(beyond, bee, 'neither', [flower])).toEqual([0, 0, 1, 1.2]);
  });

  it('stays in the photo around what belongs to it and is whole', () => {
    const bee = { left: 0.45, top: 0.17, right: 0.62, bottom: 0.37 };
    const flower = { left: 0.15, top: 0.3, right: 0.7, bottom: 0.9 };
    expect(framed(beyond, bee, 'neither', [flower])).toEqual([0, 0, 1, 1]);
  });

  it('adds the room that is missing, and more of it in front', () => {
    const wide = { left: 0.1, top: 0.3, right: 0.9, bottom: 0.7 };
    expect(framed(beyond, wide, 'right')).toEqual([-0.02, 0, 1.2, 1]);
    const tall = { left: 0.45, top: 0.05, right: 0.55, bottom: 0.75 };
    expect(framed(beyond, tall, 'left')).toEqual([0, -0.055, 1, 1]);
  });

  it('leaves a frame inside the photo as it is', () => {
    const frame = { left: 0.1, top: 0.2, right: 0.8, bottom: 0.9 };
    const whole = { left: 0, top: 0, right: 1, bottom: 1 };
    expect(framed(frame, whole, 'neither')).toEqual([0.1, 0.2, 0.8, 0.9]);
  });
});
