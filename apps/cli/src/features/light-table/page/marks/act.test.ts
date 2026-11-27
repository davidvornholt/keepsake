import { describe, expect, it } from 'bun:test';
import type { PhotoView } from '../../contract.ts';
import { indexOf } from '../data/derive.ts';
import {
  sampleBehind,
  sampleChoice,
  sampleMark,
  samplePhoto,
  sampleShoot,
} from '../data/sample.ts';
import {
  actionFor,
  effectFor,
  insteadReason,
  isMadeOn,
  nameFor,
  offeredFor,
  outReason,
  pencilOfKey,
  pencilsFor,
  swapFor,
  writingFor,
} from './act.ts';
import type { Pencil } from './kinds.ts';

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
const out = samplePhoto('g', {
  standing: {
    kind: 'taken-out',
    at: '2026-05-21T10:00:00.000Z',
    because: 'Too dark.',
  },
});
const photos = [album, behind, weak, picked, behindWeak, undecided, out];

describe('pencilsFor', () => {
  const index = indexOf(sampleShoot(photos));

  it('offers what makes sense for where a photo stands', () => {
    expect(pencilsFor(index, album)).toEqual(['change', 'take-out']);
    expect(pencilsFor(index, picked)).toEqual(['change', 'take-out']);
    expect(pencilsFor(index, behind)).toEqual(['swap', 'put-in']);
    expect(pencilsFor(index, weak)).toEqual(['put-in']);
    expect(pencilsFor(index, behindWeak)).toEqual(['put-in']);
    expect(pencilsFor(index, out)).toEqual(['put-in']);
    expect(pencilsFor(index, undecided)).toEqual([]);
  });

  it('names a pencil for the photo it is offered for', () => {
    expect(nameFor(index, behind, 'put-in')).toBe('Put in as well');
    expect(nameFor(index, weak, 'put-in')).toBe('Put in');
    expect(nameFor(index, out, 'put-in')).toBe('Put back');
    expect(nameFor(index, picked, 'change')).toBe('Wish for the edit');
    expect(effectFor(index, picked, 'take-out')).toContain('isn’t edited');
    expect(effectFor(index, behind, 'put-in')).toContain('stays');
    expect(effectFor(index, album, 'take-out')).toContain('now');
  });

  it('writes a change of a chosen photo, and nothing of one that is out', () => {
    const change = sampleMark('1', { photo: 'a', note: 'Warmer' });
    const marked = indexOf(sampleShoot(photos, [change]));
    expect(writingFor(marked, album)).toEqual({ mark: change });
    expect(isMadeOn(marked, album, 'change')).toBe(true);
    expect(writingFor(index, picked)).toEqual({ mark: null });
    expect(writingFor(index, weak)).toBeNull();
    expect(isMadeOn(index, weak, 'change')).toBe(false);
  });

  it('draws the pencil of what waits for other work', () => {
    const waits = indexOf(
      sampleShoot(
        photos,
        [],
        [
          sampleChoice('b', { action: 'one', wants: 'in', because: null }),
          sampleChoice('a', { action: 'one' }),
          sampleChoice('c', { wants: 'in', because: null }),
        ],
      ),
    );
    expect(isMadeOn(waits, behind, 'swap')).toBe(true);
    expect(isMadeOn(waits, behind, 'put-in')).toBe(false);
    expect(isMadeOn(waits, album, 'take-out')).toBe(true);
    expect(isMadeOn(waits, weak, 'put-in')).toBe(true);
    expect(effectFor(waits, weak, 'put-in')).toContain('Press again');
    const failed = sampleChoice('c', { wants: 'in', failed: 'No.' });
    const notWaiting = indexOf(sampleShoot(photos, [], [failed]));
    expect(isMadeOn(notWaiting, weak, 'put-in')).toBe(false);
  });

  it('says what is offered when something else was tried', () => {
    expect(offeredFor(index, picked)).toStartWith(
      'This photo is chosen for the album: Wish for the edit (C), ',
    );
    expect(offeredFor(index, weak)).toBe(
      'This photo isn’t in the album: Put in (P).',
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
  const index = indexOf(sampleShoot(photos));

  it('takes a photo out at once, for a plain reason', () => {
    expect(actionFor(index, album, 'take-out')).toMatchObject({
      does: 'choose',
      wanted: { photo: 'a', wants: 'out', because: outReason, instead: null },
    });
  });

  it('puts a photo in at once', () => {
    expect(actionFor(index, weak, 'put-in')).toMatchObject({
      does: 'choose',
      wanted: { photo: 'c', wants: 'in', because: null, instead: null },
    });
  });

  it('uses a photo instead of the one in front, as one', () => {
    expect(actionFor(index, behind, 'swap')).toMatchObject({
      does: 'choose',
      wanted: {
        photo: 'b',
        wants: 'in',
        because: insteadReason('b'),
        instead: 'a',
      },
    });
    expect(insteadReason('b')).toBe('You chose b instead.');
  });

  it('takes back what waits when its pencil is pressed again', () => {
    const waits = indexOf(
      sampleShoot(
        photos,
        [],
        [sampleChoice('a'), sampleChoice('c', { wants: 'in' })],
      ),
    );
    expect(actionFor(waits, album, 'take-out')).toMatchObject({
      does: 'choose',
      wanted: { photo: 'a', wants: 'in', because: null, instead: null },
    });
    expect(actionFor(waits, weak, 'put-in')).toMatchObject({
      does: 'choose',
      wanted: { photo: 'c', wants: 'out' },
    });
  });

  it('asks for words before a change, also once one is written', () => {
    const mark = sampleMark('1', { photo: 'a', note: 'Warmer' });
    expect(actionFor(index, album, 'change')).toEqual({ does: 'compose' });
    expect(
      actionFor(indexOf(sampleShoot(photos, [mark])), album, 'change'),
    ).toEqual({ does: 'compose' });
  });

  it('refuses what makes no sense', () => {
    expect(actionFor(index, album, 'put-in')).toBeNull();
    expect(actionFor(index, weak, 'swap')).toBeNull();
    expect(actionFor(index, weak, 'change')).toBeNull();
    expect(actionFor(index, picked, 'swap')).toBeNull();
    expect(actionFor(index, undecided, 'put-in')).toBeNull();
  });
});

describe('undoing a choice', () => {
  const index = indexOf(sampleShoot(photos));
  const backOf = (on: typeof index, photo: PhotoView, pencil: Pencil) => {
    const action = actionFor(on, photo, pencil);
    return action?.does === 'choose' ? action.back : null;
  };

  it('puts back what was taken out', () => {
    expect(backOf(index, album, 'take-out')).toEqual({
      photo: 'a',
      wants: 'in',
      because: null,
      instead: null,
    });
  });

  it('takes out again what was put in, for the reason it had before', () => {
    expect(backOf(index, out, 'put-in')).toMatchObject({
      wants: 'out',
      because: 'Too dark.',
    });
    expect(backOf(index, weak, 'put-in')).toMatchObject({
      wants: 'out',
      because: outReason,
    });
  });

  it('brings back the photo that another took the place of', () => {
    expect(backOf(index, behind, 'swap')).toEqual({
      photo: 'a',
      wants: 'in',
      because: outReason,
      instead: 'b',
    });
  });

  it('brings back all of a swap that waited, from either of its photos', () => {
    const swap = {
      photo: 'b',
      wants: 'in',
      because: insteadReason('b'),
      instead: 'a',
    } as const;
    const waits = indexOf(
      sampleShoot(
        photos,
        [],
        [
          sampleChoice('b', { action: 'one', wants: 'in', because: null }),
          sampleChoice('a', { action: 'one', because: insteadReason('b') }),
        ],
      ),
    );
    expect(backOf(waits, behind, 'swap')).toEqual(swap);
    expect(backOf(waits, album, 'take-out')).toEqual(swap);
  });

  it('brings back what waited for one photo alone', () => {
    const waits = indexOf(
      sampleShoot(
        photos,
        [],
        [
          sampleChoice('a', { because: 'Blurred.' }),
          sampleChoice('c', { wants: 'in', because: null }),
        ],
      ),
    );
    expect(backOf(waits, album, 'take-out')).toEqual({
      photo: 'a',
      wants: 'out',
      because: 'Blurred.',
      instead: null,
    });
    expect(backOf(waits, weak, 'put-in')).toEqual({
      photo: 'c',
      wants: 'in',
      because: null,
      instead: null,
    });
  });
});

describe('keys', () => {
  it('stand for pencils, in either case', () => {
    expect(pencilOfKey('c')).toBe('change');
    expect(pencilOfKey('X')).toBe('take-out');
    expect(pencilOfKey('p')).toBe('put-in');
    expect(pencilOfKey('S')).toBe('swap');
    expect(pencilOfKey('k')).toBeNull();
    expect(pencilOfKey('f')).toBeNull();
  });
});
