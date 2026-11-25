import { describe, expect, it } from 'bun:test';
import { frameOfShare, shareOfFrame } from './zoom.ts';

const limits = { least: 20, most: 320 };

describe('the size of the frames on a slider', () => {
  it('has the smallest frames at one end and the largest at the other', () => {
    expect(shareOfFrame(20, limits)).toBe(0);
    expect(shareOfFrame(320, limits)).toBe(1);
    expect(frameOfShare(0, limits)).toBe(20);
    expect(frameOfShare(1, limits)).toBeCloseTo(320);
  });

  it('grows by the same share with every step', () => {
    expect(frameOfShare(0.5, limits)).toBeCloseTo(80);
    expect(shareOfFrame(80, limits)).toBeCloseTo(0.5);
  });

  it('stays within its ends', () => {
    expect(shareOfFrame(5, limits)).toBe(0);
    expect(shareOfFrame(900, limits)).toBe(1);
    expect(frameOfShare(2, limits)).toBeCloseTo(320);
  });

  it('has one place when the frames cannot change', () => {
    expect(shareOfFrame(40, { least: 40, most: 40 })).toBe(0);
    expect(frameOfShare(0.7, { least: 40, most: 40 })).toBe(40);
  });
});
