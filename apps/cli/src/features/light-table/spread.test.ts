import { describe, expect, it } from 'bun:test';
import { spread } from './spread.ts';

const hundred = Array.from({ length: 100 }, (_, index) => index);

describe('spread', () => {
  it('takes from all over the list, however few are asked for', () => {
    for (const many of [5, 8, 20]) {
      const quarters = new Set(
        spread(hundred, many).map((item) => Math.floor(item / 25)),
      );
      expect(quarters.size).toBe(4);
    }
  });

  it('takes nothing twice, and no more than there is', () => {
    expect(new Set(spread(hundred, 60)).size).toBe(60);
    expect(spread(hundred, 500).toSorted((one, two) => one - two)).toEqual(
      hundred,
    );
    expect(spread([], 5)).toEqual([]);
  });
});
