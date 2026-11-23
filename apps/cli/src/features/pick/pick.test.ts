import { describe, expect, it } from 'bun:test';
import { leftOut } from './pick.ts';
import { groupsIn, pointsOf } from './ranking.ts';

describe('leftOut', () => {
  it('leaves out the new photos another one replaces', () => {
    const answer = {
      leaveOut: [
        { photo: 3, insteadOf: 1 },
        { photo: 1, insteadOf: 3 },
      ],
    };
    expect([...leftOut(answer, 2, 4)]).toEqual([3]);
  });

  it('never loses two photos to each other', () => {
    const answer = {
      leaveOut: [
        { photo: 1, insteadOf: 2 },
        { photo: 2, insteadOf: 1 },
      ],
    };
    expect([...leftOut(answer, 0, 2)]).toEqual([1]);
  });

  it('ignores numbers that mean nothing', () => {
    const answer = {
      leaveOut: [
        { photo: 9, insteadOf: 1 },
        { photo: 2, insteadOf: 2 },
        { photo: 2, insteadOf: 7 },
      ],
    };
    expect([...leftOut(answer, 0, 3)]).toEqual([]);
  });
});

describe('groupsIn', () => {
  const items = Array.from({ length: 30 }, (_, index) => index);

  it('puts every photo into one group of at most eight', () => {
    for (const round of [0, 1, 2]) {
      const groups = groupsIn(items, round);
      expect(groups.flat().toSorted((a, b) => a - b)).toEqual(items);
      expect(Math.max(...groups.map(({ length }) => length))).toBeLessThan(9);
    }
  });

  it('brings other photos together in another round', () => {
    const partners = (round: number) =>
      groupsIn(items, round).find((group) => group.includes(0)) ?? [];
    const shared = partners(0).filter((item) => partners(1).includes(item));
    expect(shared.length).toBeLessThan(4);
  });
});

describe('pointsOf', () => {
  it('goes from 1 for the best to 0 for the last', () => {
    expect(pointsOf([2, 3, 1], 3)).toEqual([0, 1, 0.5]);
  });

  it('counts a photo the model left out as the last', () => {
    expect(pointsOf([2], 3)).toEqual([0, 1, 0]);
  });
});
