import { describe, expect, it } from 'bun:test';
import { drawnOf, glyphOf, seedOf, shapes } from './glyphs.ts';

const total = (numbers: ReadonlyArray<number>): number =>
  numbers.reduce((sum, one) => sum + one, 0);

describe('seedOf', () => {
  it('gives a text the same number every time, and another text another', () => {
    expect(seedOf('photo-1')).toBe(seedOf('photo-1'));
    expect(seedOf('photo-1')).not.toBe(seedOf('photo-2'));
    expect(seedOf('')).toBeGreaterThan(0);
  });
});

describe('glyphOf', () => {
  it('draws a mark the same way for the same seed', () => {
    expect(glyphOf('tick', 7)).toEqual(glyphOf('tick', 7));
    expect(glyphOf('tick', 7)).not.toEqual(glyphOf('tick', 8));
  });

  it('keeps every mark near its square, with a stroke that has a width', () => {
    const reach = 0.25;
    for (const shape of shapes) {
      const glyph = glyphOf(shape, seedOf(shape));
      const dots = glyph.strokes.flat();
      expect(dots.length).toBeGreaterThan(0);
      expect(dots.every(({ width }) => width > 0)).toBe(true);
      expect(
        dots.every(
          ({ x, y }) =>
            x > -reach && x < 1 + reach && y > -reach && y < 1 + reach,
        ),
      ).toBe(true);
      expect(glyph.shares).toHaveLength(glyph.strokes.length);
      expect(total(glyph.shares)).toBeCloseTo(1);
    }
  });
});

describe('drawnOf', () => {
  const cross = glyphOf('cross', 3);

  it('draws nothing at the start and everything at the end', () => {
    expect(drawnOf(cross, 0).every((part) => part === 0)).toBe(true);
    expect(total(drawnOf(cross, 1))).toBeCloseTo(cross.strokes.length);
  });

  it('draws one stroke after the other', () => {
    const [first = 0] = cross.shares;
    const [one, two] = drawnOf(cross, first);
    expect(one).toBeCloseTo(1);
    expect(two).toBe(0);
  });

  it('never goes back while the hand moves on', () => {
    const steps = 20;
    let before = 0;
    for (let step = 0; step <= steps; step += 1) {
      const drawn = total(drawnOf(cross, step / steps));
      expect(drawn).toBeGreaterThanOrEqual(before);
      before = drawn;
    }
  });
});
