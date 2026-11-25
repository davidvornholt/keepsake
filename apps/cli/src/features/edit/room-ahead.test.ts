import { describe, expect, it } from 'bun:test';
import type { Box } from '../../shared/domain.ts';
import { type Side, withRoomAhead } from './room-ahead.ts';

const digits = 6;

const moved = (
  [left, right]: readonly [number, number],
  facing: Side,
  held: ReadonlyArray<Box> = [],
) => {
  const box = withRoomAhead(
    { left, top: 0.1, right, bottom: 0.9 },
    {
      subject: { left: 0.4, top: 0.3, right: 0.6, bottom: 0.7 },
      facing,
      held,
    },
  );
  return [Number(box.left.toFixed(digits)), Number(box.right.toFixed(digits))];
};

describe('withRoomAhead', () => {
  it('gives a subject more room in front than behind', () => {
    expect(moved([0.25, 0.85], 'left')).toEqual([0.16, 0.76]);
    expect(moved([0.15, 0.75], 'right')).toEqual([0.24, 0.84]);
  });

  it('leaves a frame that does so, and a subject that faces no side', () => {
    expect(moved([0.1, 0.7], 'left')).toEqual([0.1, 0.7]);
    expect(moved([0.25, 0.85], 'neither')).toEqual([0.25, 0.85]);
  });

  it('keeps what belongs to the photo in the frame', () => {
    const tree = { left: 0.7, top: 0.1, right: 0.8, bottom: 0.9 };
    expect(moved([0.25, 0.85], 'left', [tree])).toEqual([0.2, 0.8]);
    const far = { ...tree, right: 0.9 };
    expect(moved([0.25, 0.85], 'left', [far])).toEqual([0.25, 0.85]);
  });

  it('goes no further beyond the photo', () => {
    expect(moved([0.05, 0.95], 'left')).toEqual([0, 0.9]);
    expect(moved([0.02, 0.98], 'left')).toEqual([0, 0.96]);
    expect(moved([-0.1, 1.1], 'left')).toEqual([-0.1, 1.1]);
    expect(moved([0.02, 1], 'right')).toEqual([0.02, 1]);
  });
});
