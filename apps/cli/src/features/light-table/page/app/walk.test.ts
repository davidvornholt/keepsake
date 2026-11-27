import { describe, expect, it } from 'bun:test';
import type { ShootList } from '../../contract.ts';
import { newsIn, walkOrder } from './walk-order.ts';

type Summary = ShootList['shoots'][number];

const shoot = (
  name: string,
  news: number,
  newSince: string | null,
): Summary => ({
  name,
  title: name,
  about: null,
  from: null,
  to: null,
  photos: 10,
  inAlbum: 4,
  picked: 0,
  preparation: null,
  activity: null,
  isOrdered: false,
  openMarks: 0,
  carrying: { since: null, stopped: null },
  news,
  newSince,
  covers: [],
});

const shelf = [
  shoot('harbor', 2, '2026-05-03T00:00:00.000Z'),
  shoot('meadow', 0, null),
  shoot('garden', 1, '2026-05-01T00:00:00.000Z'),
  shoot('coast', 3, '2026-05-02T00:00:00.000Z'),
];

describe('the walk through what is new', () => {
  it('counts what is new in all the albums', () => {
    expect(newsIn(shelf)).toBe(6);
    expect(newsIn([])).toBe(0);
  });

  it('goes to the album whose news is oldest first', () => {
    expect(walkOrder(shelf)).toEqual(['garden', 'coast', 'harbor']);
  });

  it('goes on to the next album, and never back to one it went through', () => {
    expect(walkOrder(shelf, new Set(['garden']))).toEqual(['coast', 'harbor']);
    expect(walkOrder(shelf, new Set(['garden', 'coast', 'harbor']))).toEqual(
      [],
    );
  });
});
