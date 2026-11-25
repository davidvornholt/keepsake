import { describe, expect, it } from 'bun:test';
import { samplePicture } from '../data/sample.ts';
import { pileOf, printIn, printsInPile } from './pile.ts';

const place = { width: 300, height: 200 };
const across = samplePicture('a');
const upright = samplePicture('b', { width: 2000, height: 3000 });
const wide = samplePicture('c', { width: 3000, height: 1000 });

describe('printIn', () => {
  it('keeps the shape of the photo', () => {
    for (const aspect of [1.5, 2 / 3, 3, 1]) {
      const rect = printIn(place, aspect);
      expect(rect.w / rect.h).toBeCloseTo(aspect);
    }
  });

  it('lies in the middle of its place, with room to lie askew', () => {
    for (const aspect of [1.5, 2 / 3, 3, 1]) {
      const rect = printIn(place, aspect);
      expect(rect.x + rect.w / 2).toBeCloseTo(place.width / 2);
      expect(rect.y + rect.h / 2).toBeCloseTo(place.height / 2);
      expect(rect.x).toBeGreaterThan(0);
      expect(rect.y).toBeGreaterThan(0);
      expect(rect.x + rect.w).toBeLessThan(place.width);
      expect(rect.y + rect.h).toBeLessThan(place.height);
    }
  });
});

describe('pileOf', () => {
  it('lays the cover last, over at most two prints', () => {
    const pile = pileOf([across, upright, wide, across], place);
    expect(pile).toHaveLength(printsInPile);
    expect(pile.map(({ depth }) => depth)).toEqual([2, 1, 0]);
    expect(pile.at(-1)?.picture).toBe(across);
    expect(pile[0]?.picture).toBe(wide);
  });

  it('is one print for an album of one photo, and nothing for none', () => {
    expect(pileOf([upright], place)).toHaveLength(1);
    expect(pileOf([], place)).toEqual([]);
  });
});
