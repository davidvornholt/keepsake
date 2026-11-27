import { describe, expect, it } from 'bun:test';
import { everything, type Filters } from '../app/route.ts';
import { indexOf } from '../data/derive.ts';
import {
  sampleBehind,
  sampleChoice,
  sampleEdit,
  sampleMark,
  samplePhoto,
  sampleShoot,
} from '../data/sample.ts';
import { contentOf, headingsOf, orderOf, pilesWords } from './content.ts';

const crop = { left: 0.1, top: 0.2, right: 0.9, bottom: 0.8 };
const verdict = { score: 5, subject: '', description: '', reason: null };
const nextDay = '2026-05-02T09:30:00+01:00';

const first = samplePhoto('a', { edit: sampleEdit('a', { crop }) });
const behind = sampleBehind('b', 'a', { verdict });
const alsoBehind = sampleBehind('c', 'a');
const weak = samplePhoto('d', {
  standing: { kind: 'left-out', because: 'Blurred.' },
});
const later = samplePhoto('e', { takenAt: nextDay, edit: sampleEdit('e') });
const index = indexOf(
  sampleShoot(
    [first, behind, alsoBehind, weak, later],
    [sampleMark('m', { photo: 'e', note: 'Warmer.' })],
    [sampleChoice('b', { wants: 'in', because: null })],
  ),
);

const album: Filters = { ...everything, show: 'album' };
const left: Filters = { ...everything, show: 'left' };
const nobody: ReadonlySet<string> = new Set();

describe('contentOf', () => {
  it('lays one frame for every pile on the sheet of its day', () => {
    const content = contentOf(index, everything, new Set(['c']));
    expect(content.map(({ key }) => key)).toEqual(['2026-05-01', '2026-05-02']);
    const [a, d] = content[0]?.frames ?? [];
    expect(content[0]?.frames).toHaveLength(2);
    // The photo in front stands for its pile: it says how many lie in it,
    // carries the marks of all, and shows when one of them is worked on.
    expect(a).toMatchObject({
      id: 'a',
      isLit: true,
      pile: 3,
      opened: null,
      isWorkedOn: true,
    });
    expect(a?.marks.map(({ photo, pencil }) => [photo, pencil])).toEqual([
      ['b', 'put-in'],
    ]);
    expect(d).toMatchObject({ id: 'd', isLit: false, pile: 1 });
    const [e] = content[1]?.frames ?? [];
    expect(e?.marks).toHaveLength(1);
  });

  it('lays a pile open, its photos in the order they were taken', () => {
    const [sheet] = contentOf(index, everything, nobody, 'a');
    expect(sheet?.frames.map(({ id }) => id)).toEqual(['a', 'b', 'c', 'd']);
    const [a, b, c, d] = sheet?.frames ?? [];
    expect(a).toMatchObject({
      isLit: true,
      isApart: true,
      pile: 1,
      opened: { front: 'a', isFront: true, count: 3 },
    });
    expect(b).toMatchObject({
      isLit: false,
      isApart: false,
      opened: { front: 'a', isFront: false, count: 3 },
    });
    expect(b?.score).toBe(verdict.score);
    // Each photo carries its own marks once the pile lies open.
    expect(a?.marks).toHaveLength(0);
    expect(b?.marks).toHaveLength(1);
    expect(c?.opened?.isFront).toBe(false);
    // What comes after an open pile lies apart from it.
    expect(d).toMatchObject({ isApart: true, opened: null });
  });

  it('doesn’t open what isn’t a pile', () => {
    const [sheet] = contentOf(index, everything, nobody, 'd');
    expect(sheet?.frames.map(({ id }) => id)).toEqual(['a', 'd']);
    expect(sheet?.frames[1]?.opened).toBeNull();
  });

  it('shows the camera’s picture with its crop among everything', () => {
    const [a] = contentOf(index, everything, nobody)[0]?.frames ?? [];
    expect(a?.picture).toBe(first.picture);
    expect(a?.crop).toEqual(crop);
  });

  it('shows the finished photo in the album, without a crop', () => {
    const [a] = contentOf(index, album, nobody)[0]?.frames ?? [];
    expect(a?.picture).toBe(first.edit?.picture);
    expect(a?.crop).toBeNull();
  });

  it('puts nothing in the shade among what was left out', () => {
    const [sheet] = contentOf(index, left, nobody);
    expect(sheet?.frames.map(({ id, isLit }) => [id, isLit])).toEqual([
      ['d', true],
    ]);
  });

  it('says how far each photo of an order is', () => {
    const picked = { standing: { kind: 'picked' } } as const;
    const ordered = indexOf({
      ...sampleShoot([
        samplePhoto('a', picked),
        samplePhoto('b', { ...picked, edit: sampleEdit('b') }),
        samplePhoto('c', { standing: { kind: 'left-out', because: null } }),
      ]),
      ordered: { at: nextDay, dollars: 1.5, photos: [] },
    });
    const [sheet] = contentOf(ordered, everything, nobody);
    expect(sheet?.frames.map(({ order }) => order)).toEqual([
      'waits',
      'edited',
      null,
    ]);
    const [before] = contentOf(
      indexOf(sampleShoot([samplePhoto('a', picked)])),
      everything,
      nobody,
    );
    expect(before?.frames[0]?.order).toBeNull();
  });
});

describe('headingsOf', () => {
  it('names a day and prints what was counted on it', () => {
    const [day] = headingsOf(index, everything);
    expect(day?.title).toBe('1 May');
    expect(day?.day).toBe('2026-05-01');
    expect(day?.print).toEqual([
      'Friday',
      '4 photos',
      '2 stacks',
      '1 in the album',
      '1 edited',
    ]);
  });

  it('names why photos were left out, which is no day to filter by', () => {
    const [why] = headingsOf(index, left);
    expect(why?.title).toBe('Not strong enough');
    expect(why?.day).toBeNull();
    expect(why?.print).toEqual(['1 photo']);
  });

  it('speaks of stacks only where photos lie together', () => {
    expect(pilesWords(3, 3)).toEqual(['3 photos']);
    expect(pilesWords(291, 894)).toEqual(['894 photos', '291 stacks']);
  });
});

describe('orderOf', () => {
  it('goes through the photos in front as they lie on the table', () => {
    expect(orderOf(index, everything).map(({ id }) => id)).toEqual([
      'a',
      'd',
      'e',
    ]);
    expect(orderOf(index, album).map(({ id }) => id)).toEqual(['a', 'e']);
    expect(
      orderOf(index, { ...everything, day: '2026-05-02' }).map(({ id }) => id),
    ).toEqual(['e']);
  });
});
