import { describe, expect, it } from 'bun:test';
import { everything, type Filters } from '../app/route.ts';
import { indexOf } from '../data/derive.ts';
import {
  sampleEdit,
  sampleMark,
  samplePhoto,
  sampleShoot,
} from '../data/sample.ts';
import { contentOf, headingsOf, orderOf } from './content.ts';

const crop = { left: 0.1, top: 0.2, right: 0.9, bottom: 0.8 };
const verdict = { score: 5, subject: '', description: '', reason: null };

const first = samplePhoto('a', {
  moment: 'one',
  edit: sampleEdit('a', { crop }),
});
const second = samplePhoto('b', {
  moment: 'one',
  verdict,
  standing: { kind: 'left-out', rule: 'repeat', repeats: 'a', because: '' },
});
const later = samplePhoto('c', {
  moment: 'two',
  takenAt: '2026-05-02T09:30:00+01:00',
  edit: sampleEdit('c'),
});
const index = indexOf(
  sampleShoot([first, second, later], [sampleMark('m', { photo: 'c' })]),
);

const album: Filters = { ...everything, show: 'album' };
const left: Filters = { ...everything, show: 'left' };
const nobody: ReadonlySet<string> = new Set();

describe('contentOf', () => {
  it('lays every photo on the sheet of its day, the chosen ones lit', () => {
    const content = contentOf(index, everything, new Set(['c']));
    expect(content.map(({ key }) => key)).toEqual(['2026-05-01', '2026-05-02']);
    const [a, b] = content[0]?.frames ?? [];
    expect(a).toMatchObject({ id: 'a', isLit: true, isMomentStart: true });
    expect(b).toMatchObject({ id: 'b', isLit: false, isMomentStart: false });
    expect(b?.score).toBe(verdict.score);
    const [c] = content[1]?.frames ?? [];
    expect(c?.isWorkedOn).toBe(true);
    expect(c?.marks).toHaveLength(1);
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
      ['b', true],
    ]);
  });
});

describe('headingsOf', () => {
  it('names a day and prints what was counted on it', () => {
    const [day] = headingsOf(index, everything);
    expect(day?.title).toBe('1 May');
    expect(day?.day).toBe('2026-05-01');
    expect(day?.print).toEqual([
      'Friday',
      '2 taken',
      '1 in the album',
      '1 moment',
      '1 edited',
    ]);
  });

  it('names why photos were left out, which is no day to filter by', () => {
    const [why] = headingsOf(index, left);
    expect(why?.day).toBeNull();
    expect(why?.print).toEqual(['1 photo']);
  });
});

describe('orderOf', () => {
  it('goes through the photos as they lie on the table', () => {
    expect(orderOf(index, everything).map(({ id }) => id)).toEqual([
      'a',
      'b',
      'c',
    ]);
    expect(orderOf(index, album).map(({ id }) => id)).toEqual(['a', 'c']);
    expect(
      orderOf(index, { ...everything, day: '2026-05-02' }).map(({ id }) => id),
    ).toEqual(['c']);
  });
});
