import { describe, expect, it } from 'bun:test';
import { everything } from '../app/route.ts';
import {
  answeredPhotos,
  attentionOf,
  chosenAfter,
  counterpartOf,
  indexOf,
  isFavorite,
  isLookedAt,
  markedIn,
  needsEdit,
  sectionsOf,
  shownMarks,
  whyCounts,
  whyOf,
} from './derive.ts';
import { sampleEdit, sampleMark, samplePhoto, sampleShoot } from './sample.ts';

const first = '2026-05-01T10:00:00+01:00';
const second = '2026-05-02T23:30:00+01:00';

const photos = [
  samplePhoto('a', { edit: sampleEdit('a'), labels: ['print'] }),
  samplePhoto('b', {
    moment: 'a',
    standing: { kind: 'other-frame', of: 'a' },
  }),
  samplePhoto('c', {
    standing: {
      kind: 'left-out',
      rule: 'repeat',
      repeats: 'a',
      because: 'The same tram.',
    },
    labels: ['print', 'tram'],
  }),
  samplePhoto('d', {
    takenAt: second,
    standing: { kind: 'taken-out', at: second, because: null },
    edit: sampleEdit('d'),
  }),
  samplePhoto('e', {
    takenAt: second,
    standing: { kind: 'album', url: '', favorite: true },
    edit: sampleEdit('e'),
  }),
];

const photoAt = (at: number) => photos[at] ?? samplePhoto('none');

const handedOver = { handedOverAt: '2026-05-21T10:00:00.000Z' };
const answered = {
  ...handedOver,
  answer: { outcome: 'done', note: '', at: '2026-05-21T11:00:00.000Z' },
} as const;

describe('indexOf', () => {
  const index = indexOf(sampleShoot(photos));

  it('counts each day by the clocks there', () => {
    expect(index.days).toEqual([
      {
        date: '2026-05-01',
        taken: 3,
        moments: 2,
        edited: 1,
        inAlbum: 1,
        picked: 0,
      },
      {
        date: '2026-05-02',
        taken: 2,
        moments: 2,
        edited: 2,
        inAlbum: 1,
        picked: 0,
      },
    ]);
    expect(index.inAlbum).toBe(2);
    expect(index.numberOf.get('c')).toBe(3);
    expect(first.slice(0, 10)).toBe(index.days[0]?.date ?? '');
  });

  it('lists the labels in use, the most used first', () => {
    expect(index.labels).toEqual([
      { label: 'print', count: 2 },
      { label: 'tram', count: 1 },
    ]);
  });

  it('knows the frames of a moment and the photo to compare with', () => {
    expect(index.byMoment.get('a')?.map((photo) => photo.id)).toEqual([
      'a',
      'b',
    ]);
    expect(counterpartOf(index, photoAt(1))?.id).toBe('a');
    expect(counterpartOf(index, photoAt(2))?.id).toBe('a');
    expect(counterpartOf(index, photoAt(0))).toBeNull();
  });
});

describe('sectionsOf', () => {
  const index = indexOf(sampleShoot(photos));
  const ids = (filters: typeof everything) =>
    sectionsOf(index, filters).map(
      (section) => `${section.key}: ${section.photos.map(({ id }) => id)}`,
    );

  it('lays everything out by day', () => {
    expect(ids(everything)).toEqual(['2026-05-01: a,b,c', '2026-05-02: d,e']);
    expect(ids({ ...everything, show: 'album' })).toEqual([
      '2026-05-01: a',
      '2026-05-02: e',
    ]);
  });

  it('lays what was left out by the reason', () => {
    expect(ids({ ...everything, show: 'left' })).toEqual([
      'repeat: c',
      'taken-out: d',
      'other-frame: b',
    ]);
    expect(ids({ ...everything, show: 'left', why: 'taken-out' })).toEqual([
      'taken-out: d',
    ]);
    expect(whyOf(photoAt(0))).toBeNull();
    expect([...whyCounts(index, '2026-05-01')]).toEqual([
      ['other-frame', 1],
      ['repeat', 1],
    ]);
  });

  it('filters by day and by label', () => {
    expect(ids({ ...everything, day: '2026-05-02' })).toEqual([
      '2026-05-02: d,e',
    ]);
    expect(ids({ ...everything, label: 'tram' })).toEqual(['2026-05-01: c']);
    expect(ids({ ...everything, label: 'nothing' })).toEqual([]);
  });
});

describe('marks', () => {
  const marks = [
    sampleMark('1', { photo: 'a', kind: 'change', ...answered }),
    sampleMark('2', { photo: 'a', kind: 'keep' }),
    sampleMark('3', { photo: 'a', kind: 'favorite' }),
    sampleMark('4', { photo: 'c', kind: 'put-in' }),
    sampleMark('5', { photo: 'd', kind: 'put-in' }),
    sampleMark('6', { photo: 'e', kind: 'take-out', ...handedOver }),
    sampleMark('7', { photo: 'e', kind: 'not-favorite', ...handedOver }),
    sampleMark('8', { photo: 'b', kind: 'swap', other: 'a' }),
  ];
  const index = indexOf(sampleShoot(photos, marks));

  it('sorts the marks of a photo by how far they have got', () => {
    const marked = markedIn(index, 'a');
    expect(marked.open?.id).toBe('2');
    expect(marked.favorite?.id).toBe('3');
    expect(marked.news.map(({ id }) => id)).toEqual(['1']);
    expect(markedIn(index, 'e').waiting).toHaveLength(2);
    expect(markedIn(index, 'nothing').open).toBeNull();
    expect(shownMarks(marked).map(({ state }) => state)).toEqual([
      'news',
      'open',
      'open',
    ]);
  });

  it('says what waits for whom', () => {
    const attention = attentionOf(marks);
    expect(attention.news.map(({ id }) => id)).toEqual(['1']);
    expect(attention.wishes.map(({ id }) => id)).toEqual(['3', '4', '5', '8']);
    expect(attention.opinions.map(({ id }) => id)).toEqual(['2']);
    expect(attention.waiting.map(({ id }) => id)).toEqual(['6', '7']);
  });

  it('counts the edits that cost money and the album afterwards', () => {
    // c and b have no edit yet; d has one from before it was taken out.
    expect(marks.filter((mark) => needsEdit(index, mark))).toHaveLength(3);
    expect(chosenAfter(index, marks)).toBe(3);
  });

  it('lists the photos with an answer to look at', () => {
    expect(answeredPhotos(index)).toEqual(['a']);
  });

  it('knows favourites and what was looked at', () => {
    expect(isFavorite(index, photoAt(0))).toBe(true);
    expect(isFavorite(index, photoAt(4))).toBe(false);
    expect(isFavorite(index, photoAt(3))).toBe(false);
    expect(isLookedAt(index, 'a')).toBe(true);
    expect(isLookedAt(index, 'd')).toBe(true);
    expect(isLookedAt(indexOf(sampleShoot(photos)), 'a')).toBe(false);
  });
});
