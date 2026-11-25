import { describe, expect, it } from 'bun:test';
import { fittingFrame, largestFrame, smallestFrame } from './fit.ts';
import { type Group, layOut } from './layout.ts';

const landscape = 3 / 2;

const group = (key: string, count: number): Group => ({
  key,
  items: Array.from({ length: count }, (_, index) => ({
    id: `${key}${index}`,
    aspect: landscape,
    isMomentStart: index % 3 === 0,
  })),
});

describe('fittingFrame', () => {
  it('finds the largest frames with which everything fits', () => {
    const groups = [group('a', 200), group('b', 430), group('c', 264)];
    const frame = fittingFrame(groups, 1440, 800);
    const tallest = largestFrame(1440, 800);
    expect(layOut(groups, 1440, frame, { tallest }).height).toBeLessThanOrEqual(
      800,
    );
    expect(
      layOut(groups, 1440, frame * 1.15, { tallest }).height,
    ).toBeGreaterThan(800);
  });

  it('stops at frames that can still be told apart', () => {
    expect(fittingFrame([group('a', 5000)], 400, 600)).toBe(smallestFrame);
  });

  it('doesn’t blow up a few frames', () => {
    expect(fittingFrame([group('a', 1)], 1440, 800)).toBe(
      largestFrame(1440, 800),
    );
  });
});
