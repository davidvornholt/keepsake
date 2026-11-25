import { describe, expect, it } from 'bun:test';
import { measureOf } from './layout.ts';
import { cornerOf, pileIn } from './pile.ts';

const frame = (height: number) => ({
  x: 10,
  y: 20,
  w: height * 1.5,
  h: height,
});

describe('pileIn', () => {
  it('shows the edges of up to two photos behind the one in front', () => {
    const measure = measureOf(100);
    expect(pileIn(frame(100), 1, measure).edges).toHaveLength(0);
    expect(pileIn(frame(100), 2, measure).edges).toHaveLength(1);
    expect(pileIn(frame(100), 46, measure).edges).toHaveLength(2);
  });

  it('keeps everything in the place of the frame', () => {
    const { face, edges } = pileIn(frame(100), 3, measureOf(100));
    for (const { x, y, w, h } of [face, ...edges]) {
      expect(x).toBeGreaterThanOrEqual(10);
      expect(y).toBeGreaterThanOrEqual(20);
      expect(x + w).toBeLessThanOrEqual(10 + 150);
      expect(y + h).toBeLessThanOrEqual(20 + 100);
    }
  });

  it('goes by the table, so that a lower row shows its piles like the others', () => {
    expect(pileIn(frame(22), 3, measureOf(26)).edges).toHaveLength(2);
    expect(pileIn(frame(34), 3, measureOf(25)).edges).toHaveLength(0);
  });
});

describe('cornerOf', () => {
  it('is large enough for a finger and leaves most of a small photo', () => {
    expect(cornerOf(frame(60)).w).toBe(28);
    expect(cornerOf(frame(30)).w).toBe(18);
    expect(cornerOf(frame(400)).w).toBe(48);
  });
});
