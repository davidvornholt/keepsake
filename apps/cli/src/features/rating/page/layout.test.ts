import { describe, expect, it } from 'bun:test';
import { gridFor } from './layout.ts';

const landscape = 3 / 2;
const portrait = 2 / 3;
const screen = { width: 1600, height: 900 };
const phone = { width: 390, height: 640 };

describe('gridFor', () => {
  it('puts upright photos next to each other on a wide screen', () => {
    expect(gridFor(2, portrait, screen)).toEqual({
      columns: 2,
      rows: 1,
      photoWidth: 600,
    });
    expect(gridFor(12, portrait, screen)).toMatchObject({
      columns: 6,
      rows: 2,
    });
  });

  it('puts wide photos below each other on a phone', () => {
    expect(gridFor(2, landscape, phone)).toEqual({
      columns: 1,
      rows: 2,
      photoWidth: 390,
    });
  });

  it('fills the last row as far as it goes', () => {
    expect(gridFor(11, landscape, screen)).toMatchObject({
      columns: 4,
      rows: 3,
    });
  });

  it('has one column before the page is laid out', () => {
    expect(gridFor(5, landscape, { width: 0, height: 0 }).columns).toBe(1);
  });
});
