import { describe, expect, it } from 'bun:test';
import { inPhoto, isWhole } from './crop.ts';

describe('isWhole', () => {
  it('takes a frame inside the photo that shows almost all of it', () => {
    expect(isWhole({ left: 0, top: 0.01, right: 1, bottom: 1 })).toBe(true);
  });

  it('keeps a frame that reaches a little beyond the photo', () => {
    expect(isWhole({ left: 0, top: 0.025, right: 1, bottom: 1.045 })).toBe(
      false,
    );
  });
});

describe('inPhoto', () => {
  it('keeps the part of a box in the photo and drops one wholly outside', () => {
    const across = { left: 0.5, top: 0.6, right: 0.8, bottom: 1.1 };
    const outside = { left: 1.02, top: 0.3, right: 1.1, bottom: 0.5 };
    expect(inPhoto([across, outside])).toEqual([
      { left: 0.5, top: 0.6, right: 0.8, bottom: 1 },
    ]);
  });
});
