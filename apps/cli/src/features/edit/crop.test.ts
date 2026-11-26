import { describe, expect, it } from 'bun:test';
import { isWhole } from './crop.ts';

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
