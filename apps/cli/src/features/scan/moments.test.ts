import { describe, expect, it } from 'bun:test';
import type { Photo } from '../../shared/domain.ts';
import { hashDistance, hashOf, momentsOf } from './moments.ts';

const photo = (id: string, seconds: number, overrides = {}): Photo => ({
  id,
  file: `${id}.ARW`,
  takenAt: new Date(Date.UTC(2026, 2, 30, 10, 0, seconds))
    .toISOString()
    .slice(0, -1),
  utcOffset: null,
  camera: null,
  lens: null,
  focalLength: 600,
  aperture: null,
  exposure: null,
  iso: null,
  orientation: 1,
  width: 6000,
  height: 4000,
  raw: true,
  cameraJpeg: true,
  hash: '0000000000000000',
  ...overrides,
});

const groups = (...photos: ReadonlyArray<Photo>) =>
  momentsOf(photos).map((moment) => moment.photos.join(' '));

describe('momentsOf', () => {
  it('keeps a burst together however different it looks', () => {
    expect(
      groups(photo('A', 0), photo('B', 2, { hash: 'ffffffffffffffff' })),
    ).toEqual(['A B']);
  });

  it('keeps photos of the same scene within a minute together', () => {
    expect(
      groups(photo('A', 0), photo('B', 50, { hash: '0000000000000fff' })),
    ).toEqual(['A B']);
  });

  it.each([
    ['look different', 50, { hash: '000000000000ffff' }],
    ['are more than a minute apart', 61, {}],
    ['are held differently', 50, { orientation: 8 }],
    ['are zoomed differently', 50, { focalLength: 200 }],
  ])('separates photos that %s', (_, seconds, overrides) => {
    expect(groups(photo('A', 0), photo('B', seconds, overrides))).toEqual([
      'A',
      'B',
    ]);
  });

  it('names a moment after its first photo', () => {
    expect(momentsOf([photo('A', 0), photo('B', 1), photo('C', 500)])).toEqual([
      { id: 'A', photos: ['A', 'B'] },
      { id: 'C', photos: ['C'] },
    ]);
  });
});

describe('hashOf', () => {
  it('has a bit for each step from dark to light', () => {
    const rising = Uint8Array.from({ length: 72 }, (_, index) => index % 9);
    expect(hashOf(rising)).toBe('ffffffffffffffff');
    expect(hashOf(new Uint8Array(72))).toBe('0000000000000000');
  });
});

describe('hashDistance', () => {
  it('counts the bits that differ', () => {
    expect(hashDistance('00ff', '00ff')).toBe(0);
    expect(hashDistance('0000', '8001')).toBe(2);
  });
});
