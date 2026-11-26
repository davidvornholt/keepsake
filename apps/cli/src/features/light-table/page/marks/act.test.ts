import { describe, expect, it } from 'bun:test';
import { indexOf } from '../data/derive.ts';
import {
  sampleBehind,
  sampleMark,
  samplePhoto,
  sampleShoot,
} from '../data/sample.ts';
import {
  actionFor,
  effectFor,
  isMadeOn,
  kindOfKey,
  kindsFor,
  nameFor,
  offeredFor,
  swapFor,
  writingFor,
} from './act.ts';

const album = samplePhoto('a', {
  standing: { kind: 'album', url: '', favorite: true },
});
const behind = sampleBehind('b', 'a');
const weak = samplePhoto('c', {
  standing: { kind: 'left-out', because: null },
});
const picked = samplePhoto('d', { standing: { kind: 'picked' } });
const behindWeak = sampleBehind('e', 'c');
const undecided = samplePhoto('f', { standing: { kind: 'open' } });
const photos = [album, behind, weak, picked, behindWeak, undecided];

describe('kindsFor', () => {
  const index = indexOf(sampleShoot(photos));

  it('offers what makes sense for where a photo stands', () => {
    expect(kindsFor(index, album)).toEqual(['change', 'take-out']);
    expect(kindsFor(index, picked)).toEqual(['change', 'take-out']);
    expect(kindsFor(index, behind)).toEqual(['swap', 'put-in']);
    expect(kindsFor(index, weak)).toEqual(['put-in']);
    expect(kindsFor(index, behindWeak)).toEqual(['put-in']);
    expect(kindsFor(index, undecided)).toEqual([]);
  });

  it('names a mark for the photo it is offered for', () => {
    expect(nameFor(index, behind, 'put-in')).toBe('Put in as well');
    expect(nameFor(index, weak, 'put-in')).not.toBe('Put in as well');
    expect(nameFor(index, picked, 'change')).toBe('Wish for the edit');
    expect(effectFor(index, picked, 'take-out')).toContain('isn’t edited');
    expect(effectFor(index, behind, 'put-in')).toContain('stays');
  });

  it('offers a wish once a photo is to come in, and writes it into that mark', () => {
    const plain = sampleMark('1', { photo: 'c', kind: 'put-in' });
    const marked = indexOf(sampleShoot(photos, [plain]));
    expect(kindsFor(marked, weak)).toEqual(['put-in', 'change']);
    expect(nameFor(marked, weak, 'change')).toBe('Wish for the edit');
    expect(effectFor(marked, weak, 'change')).toContain('goes with the photo');
    expect(writingFor(marked, weak)).toEqual({ into: 'wish', mark: plain });
    expect(isMadeOn(marked, weak, 'change')).toBe(false);
    expect(actionFor(marked, weak, 'change')).toEqual({ does: 'compose' });

    const wished = { ...plain, note: 'Warmer' };
    const withWish = indexOf(sampleShoot(photos, [wished]));
    expect(isMadeOn(withWish, weak, 'change')).toBe(true);
    expect(isMadeOn(withWish, weak, 'put-in')).toBe(true);

    const swap = sampleMark('2', { photo: 'b', kind: 'swap', other: 'a' });
    const swapped = indexOf(sampleShoot(photos, [swap]));
    expect(kindsFor(swapped, behind)).toEqual(['swap', 'put-in', 'change']);
    expect(writingFor(swapped, behind)).toEqual({ into: 'wish', mark: swap });
  });

  it('writes a change of a chosen photo, and nothing of one that stays out', () => {
    const change = sampleMark('1', {
      photo: 'a',
      kind: 'change',
      note: 'Warmer',
    });
    expect(writingFor(indexOf(sampleShoot(photos, [change])), album)).toEqual({
      into: 'change',
      mark: change,
    });
    expect(writingFor(index, picked)).toEqual({ into: 'change', mark: null });
    expect(writingFor(index, weak)).toBeNull();
    expect(isMadeOn(index, weak, 'change')).toBe(false);
  });

  it('says what is offered when something else was tried', () => {
    expect(offeredFor(index, picked)).toStartWith(
      'This photo is chosen for the album: Wish for the edit (C), ',
    );
    expect(offeredFor(index, weak)).toStartWith(
      'This photo isn’t in the album: ',
    );
    expect(offeredFor(index, undecided)).toBe(
      'This photo isn’t decided yet. Marks come once the best are chosen.',
    );
  });

  it('swaps only with a photo that is chosen', () => {
    expect(swapFor(index, behind)?.id).toBe('a');
    expect(swapFor(index, weak)).toBeNull();
    expect(swapFor(index, behindWeak)).toBeNull();
  });
});

describe('actionFor', () => {
  it('makes a mark, and takes it back when it is chosen again', () => {
    const index = indexOf(sampleShoot(photos));
    expect(actionFor(index, album, 'take-out')).toEqual({
      does: 'make',
      wanted: {
        photo: 'a',
        kind: 'take-out',
        note: '',
        boxes: [],
        other: null,
      },
    });
    const mark = sampleMark('1', { photo: 'a', kind: 'take-out' });
    const marked = indexOf(sampleShoot(photos, [mark]));
    expect(actionFor(marked, album, 'take-out')).toEqual({
      does: 'take-back',
      mark,
    });
    const other = sampleMark('2', { photo: 'b', kind: 'swap', other: 'a' });
    const swapped = indexOf(sampleShoot(photos, [other]));
    expect(actionFor(swapped, behind, 'put-in')?.does).toBe('make');
  });

  it('asks for words before a change, also once one is written', () => {
    const mark = sampleMark('1', {
      photo: 'a',
      kind: 'change',
      note: 'Warmer',
    });
    expect(actionFor(indexOf(sampleShoot(photos)), album, 'change')).toEqual({
      does: 'compose',
    });
    expect(
      actionFor(indexOf(sampleShoot(photos, [mark])), album, 'change'),
    ).toEqual({ does: 'compose' });
  });

  it('keeps the wish for a photo that is put in another way', () => {
    const mark = sampleMark('1', {
      photo: 'b',
      kind: 'put-in',
      note: 'Warmer',
    });
    const action = actionFor(
      indexOf(sampleShoot(photos, [mark])),
      behind,
      'swap',
    );
    expect(action?.does === 'make' && action.wanted.note).toBe('Warmer');
  });

  it('names the photo a swap takes out', () => {
    const action = actionFor(indexOf(sampleShoot(photos)), behind, 'swap');
    expect(action?.does === 'make' && action.wanted.other).toBe('a');
  });

  it('refuses what makes no sense', () => {
    const index = indexOf(sampleShoot(photos));
    expect(actionFor(index, album, 'put-in')).toBeNull();
    expect(actionFor(index, weak, 'swap')).toBeNull();
    expect(actionFor(index, picked, 'swap')).toBeNull();
    expect(actionFor(index, undecided, 'put-in')).toBeNull();
  });
});

describe('keys', () => {
  it('stand for marks, in either case', () => {
    expect(kindOfKey('c')).toBe('change');
    expect(kindOfKey('X')).toBe('take-out');
    expect(kindOfKey('p')).toBe('put-in');
    expect(kindOfKey('S')).toBe('swap');
    expect(kindOfKey('k')).toBeNull();
    expect(kindOfKey('f')).toBeNull();
  });
});
