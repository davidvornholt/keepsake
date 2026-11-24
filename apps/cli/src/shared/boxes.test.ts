import { describe, expect, it } from 'bun:test';
import { tidyBox } from './boxes.ts';

describe('tidyBox', () => {
  it('puts the sides of a box in order', () => {
    expect(tidyBox({ left: 0.6, top: 0.65, right: 0.4, bottom: 0.35 })).toEqual(
      { left: 0.4, top: 0.35, right: 0.6, bottom: 0.65 },
    );
  });

  it('keeps a box inside the picture', () => {
    expect(tidyBox({ left: -0.2, top: 0.5, right: 1.3, bottom: 7 })).toEqual({
      left: 0,
      top: 0.5,
      right: 1,
      bottom: 1,
    });
  });
});
