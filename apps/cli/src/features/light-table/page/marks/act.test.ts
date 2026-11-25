import { describe, expect, it } from 'bun:test';
import { indexOf } from '../data/derive.ts';
import { sampleMark, samplePhoto, sampleShoot } from '../data/sample.ts';
import {
  actionFor,
  kindOfKey,
  kindsFor,
  offeredFor,
  swapFor,
  turnsPage,
} from './act.ts';

const album = samplePhoto('a', {
  standing: { kind: 'album', url: '', favorite: true },
});
const repeat = samplePhoto('b', {
  standing: { kind: 'left-out', rule: 'repeat', repeats: 'a', because: null },
});
const low = samplePhoto('c', {
  standing: { kind: 'left-out', rule: 'score', repeats: null, because: null },
});
const picked = samplePhoto('d', { standing: { kind: 'picked' } });
const photos = [album, repeat, low, picked];

describe('kindsFor', () => {
  const index = indexOf(sampleShoot(photos));

  it('offers what makes sense for where a photo stands', () => {
    expect(kindsFor(index, album)).toEqual([
      'keep',
      'change',
      'take-out',
      'favorite',
    ]);
    expect(kindsFor(index, picked)).toEqual([
      'keep',
      'change',
      'take-out',
      'favorite',
    ]);
    expect(kindsFor(index, repeat)).toEqual(['put-in', 'swap', 'leave-out']);
    expect(kindsFor(index, low)).toEqual(['put-in', 'leave-out']);
  });

  it('says what is offered when something else was tried', () => {
    expect(offeredFor(index, picked)).toBe(
      'This photo is chosen for the album: Keep (K), Change (C), Take out (X), Favorite (F).',
    );
    expect(offeredFor(index, low)).toBe(
      "This photo isn't in the album: Put in (P), Leave out (L).",
    );
  });

  it('swaps only with a photo that is in the album', () => {
    expect(swapFor(index, repeat)?.id).toBe('a');
    expect(swapFor(index, low)).toBeNull();
  });
});

describe('actionFor', () => {
  it('makes a mark, and takes it back when it is chosen again', () => {
    const index = indexOf(sampleShoot(photos));
    expect(actionFor(index, album, 'keep')).toEqual({
      does: 'make',
      wanted: { photo: 'a', kind: 'keep', note: '', boxes: [], other: null },
    });
    const mark = sampleMark('1', { photo: 'a', kind: 'keep' });
    const marked = indexOf(sampleShoot(photos, [mark]));
    expect(actionFor(marked, album, 'keep')).toEqual({
      does: 'take-back',
      mark,
    });
    expect(actionFor(marked, album, 'take-out')?.does).toBe('make');
  });

  it('asks for words before a change, and opens the ones there are', () => {
    const mark = sampleMark('1', {
      photo: 'a',
      kind: 'change',
      note: 'Warmer',
    });
    expect(actionFor(indexOf(sampleShoot(photos)), album, 'change')).toEqual({
      does: 'compose',
      mark: null,
    });
    expect(
      actionFor(indexOf(sampleShoot(photos, [mark])), album, 'change'),
    ).toEqual({ does: 'compose', mark });
  });

  it('turns a favourite into none, and back', () => {
    const index = indexOf(sampleShoot(photos));
    const action = actionFor(index, album, 'favorite');
    expect(action?.does === 'make' && action.wanted.kind).toBe('not-favorite');
    const other = actionFor(index, picked, 'favorite');
    expect(other?.does === 'make' && other.wanted.kind).toBe('favorite');
    const mark = sampleMark('1', { photo: 'a', kind: 'not-favorite' });
    const marked = indexOf(sampleShoot(photos, [mark]));
    expect(actionFor(marked, album, 'favorite')).toEqual({
      does: 'take-back',
      mark,
    });
  });

  it('names the photo a swap takes out', () => {
    const action = actionFor(indexOf(sampleShoot(photos)), repeat, 'swap');
    expect(action?.does === 'make' && action.wanted.other).toBe('a');
  });

  it('refuses what makes no sense', () => {
    const index = indexOf(sampleShoot(photos));
    expect(actionFor(index, album, 'put-in')).toBeNull();
    expect(actionFor(index, low, 'swap')).toBeNull();
    expect(actionFor(index, picked, 'swap')).toBeNull();
  });
});

describe('keys', () => {
  it('stand for marks, in either case', () => {
    expect(kindOfKey('k')).toBe('keep');
    expect(kindOfKey('X')).toBe('take-out');
    expect(kindOfKey('q')).toBeNull();
  });

  it('turn the page only after an opinion', () => {
    expect(turnsPage('keep')).toBe(true);
    expect(turnsPage('take-out')).toBe(false);
  });
});
