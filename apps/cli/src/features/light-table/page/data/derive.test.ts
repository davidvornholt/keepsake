import { describe, expect, it } from 'bun:test';
import { everything } from '../app/route.ts';
import {
  attentionOf,
  countsOf,
  frontOf,
  indexOf,
  isFavorite,
  markedIn,
  marksOfPile,
  needsEdit,
  newPhotos,
  pileAround,
  sectionsOf,
  shownMarks,
  whyOf,
} from './derive.ts';
import {
  sampleBehind,
  sampleChoice,
  sampleEdit,
  sampleMark,
  samplePhoto,
  sampleShoot,
} from './sample.ts';

const first = '2026-05-01T10:00:00+01:00';
const second = '2026-05-02T23:30:00+01:00';

const photos = [
  samplePhoto('a', { edit: sampleEdit('a'), labels: ['print'] }),
  sampleBehind('b', 'a'),
  samplePhoto('c', {
    standing: { kind: 'left-out', because: 'The tram is cut off.' },
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
  samplePhoto('f', { takenAt: second, standing: { kind: 'picked' } }),
  sampleBehind('g', 'f', { takenAt: second, labels: ['tram'] }),
  sampleBehind('h', 'f', { takenAt: second }),
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
        piles: 2,
        edited: 1,
        inAlbum: 1,
        picked: 0,
      },
      {
        date: '2026-05-02',
        taken: 5,
        piles: 3,
        edited: 2,
        inAlbum: 1,
        picked: 1,
      },
    ]);
    expect(index.inAlbum).toBe(2);
    expect(index.chosen).toBe(3);
    expect(index.hasAlbum).toBe(true);
    expect(index.numberOf.get('c')).toBe(3);
    expect(first.slice(0, 10)).toBe(index.days[0]?.date ?? '');
  });

  it('lists the labels in use, the most used first', () => {
    expect(index.labels).toEqual([
      { label: 'print', count: 2 },
      { label: 'tram', count: 2 },
    ]);
  });

  it('knows the pile of every photo and the one in front of it', () => {
    const pile = pileAround(index, photoAt(6));
    expect(pile.front.id).toBe('f');
    expect(pile.photos.map(({ id }) => id)).toEqual(['f', 'g', 'h']);
    expect(pileAround(index, photoAt(2)).photos).toHaveLength(1);
    expect(frontOf(index, photoAt(1))?.id).toBe('a');
    expect(frontOf(index, photoAt(0))).toBeNull();
    // Every photo lies in one pile, and in one only.
    expect(index.piles.flatMap((each) => each.photos)).toHaveLength(
      photos.length,
    );
  });

  it('has no album where nothing is published', () => {
    const fresh = indexOf(
      sampleShoot([samplePhoto('a', { standing: { kind: 'picked' } })]),
    );
    expect(fresh.hasAlbum).toBe(false);
    expect(fresh.chosen).toBe(1);
  });
});

describe('sectionsOf', () => {
  const index = indexOf(sampleShoot(photos));
  const fronts = (filters: typeof everything) =>
    sectionsOf(index, filters).map(
      (section) =>
        `${section.key}: ${section.piles.map((pile) => pile.front.id)}`,
    );

  it('lays the piles out by day, the photo in front for each', () => {
    expect(fronts(everything)).toEqual([
      '2026-05-01: a,c',
      '2026-05-02: d,e,f',
    ]);
    expect(fronts({ ...everything, show: 'album' })).toEqual([
      '2026-05-01: a',
      '2026-05-02: e,f',
    ]);
  });

  it('lays what isn’t in the album by the reason', () => {
    expect(fronts({ ...everything, show: 'left' })).toEqual([
      'weak: c',
      'taken-out: d',
    ]);
    expect(fronts({ ...everything, show: 'left', why: 'taken-out' })).toEqual([
      'taken-out: d',
    ]);
    expect(whyOf(photoAt(0))).toBeNull();
    expect(whyOf(photoAt(1))).toBeNull();
  });

  it('filters by day, and by the label of any photo of a pile', () => {
    expect(fronts({ ...everything, day: '2026-05-01' })).toEqual([
      '2026-05-01: a,c',
    ]);
    expect(fronts({ ...everything, label: 'tram' })).toEqual([
      '2026-05-01: c',
      '2026-05-02: f',
    ]);
    expect(fronts({ ...everything, label: 'nothing' })).toEqual([]);
  });
});

describe('countsOf', () => {
  const index = indexOf(sampleShoot(photos));

  it('counts piles so that the views add up', () => {
    const counts = countsOf(index, null);
    expect(counts).toEqual({
      all: 5,
      album: 3,
      left: 2,
      weak: 1,
      takenOut: 1,
      open: 0,
    });
    expect(counts.album + counts.left + counts.open).toBe(counts.all);
    expect(counts.weak + counts.takenOut).toBe(counts.left);
  });

  it('counts one day alone', () => {
    expect(countsOf(index, '2026-05-01')).toMatchObject({
      all: 2,
      album: 1,
      left: 1,
    });
  });

  it('counts what nothing is decided about', () => {
    const open = indexOf(
      sampleShoot([
        samplePhoto('a', { standing: { kind: 'open' } }),
        samplePhoto('b', { standing: { kind: 'open' } }),
      ]),
    );
    expect(countsOf(open, null)).toMatchObject({ all: 2, album: 0, open: 2 });
  });
});

describe('marks', () => {
  const marks = [
    sampleMark('1', { photo: 'a', note: 'Less sky', ...answered }),
    sampleMark('2', { photo: 'a', note: 'Brighter' }),
    sampleMark('6', { photo: 'e', note: 'Warmer', ...handedOver }),
    sampleMark('7', { photo: 'f', note: 'Warmer' }),
  ];
  // b is to come in instead of a, which waits for other work.
  const choices = [
    sampleChoice('b', { action: 'swap', wants: 'in', because: null }),
    sampleChoice('a', { action: 'swap' }),
  ];
  const index = indexOf(sampleShoot(photos, marks, choices));

  it('sorts the marks of a photo by how far they have got', () => {
    const marked = markedIn(index, 'a');
    expect(marked.open?.id).toBe('2');
    expect(marked.news.map(({ id }) => id)).toEqual(['1']);
    expect(markedIn(index, 'e').waiting).toHaveLength(1);
    expect(markedIn(index, 'nothing').open).toBeNull();
    expect(shownMarks(marked).map(({ state }) => state)).toEqual([
      'news',
      'open',
    ]);
  });

  it('shows what waits for the photos behind on the one in front', () => {
    const pile = pileAround(index, photoAt(0));
    expect(marksOfPile(index, pile)).toEqual([
      { photo: 'a', pencil: 'change', state: 'news' },
      { photo: 'a', pencil: 'change', state: 'open' },
      { photo: 'a', pencil: 'take-out', state: 'open' },
      { photo: 'b', pencil: 'swap', state: 'open' },
    ]);
  });

  it('shows nothing for a choice that couldn’t be done', () => {
    const failed = sampleChoice('a', { failed: 'Immich refused.' });
    const shoot = sampleShoot(photos, [], [failed]);
    expect(indexOf(shoot).waiting.size).toBe(0);
  });

  it('says what waits for whom', () => {
    const attention = attentionOf(marks);
    expect(attention.news.map(({ id }) => id)).toEqual(['1']);
    expect(attention.wishes.map(({ id }) => id)).toEqual(['2', '7']);
    expect(attention.waiting.map(({ id }) => id)).toEqual(['6']);
  });

  it('counts the changes that cost money', () => {
    // The wish for f is part of its first edit, which the order pays for.
    expect(
      marks.filter((mark) => needsEdit(index, mark)).map(({ id }) => id),
    ).toEqual(['1', '2', '6']);
  });

  it('lists the photos with an answer to look at', () => {
    expect(newPhotos(index)).toEqual(['a']);
  });

  it('lists what is new, oldest first, each photo once', () => {
    const answer = (time: string) => ({
      at: time,
      outcome: 'done' as const,
      note: '',
    });
    const shoot = sampleShoot(
      [samplePhoto('a'), samplePhoto('b'), samplePhoto('c')],
      [
        sampleMark('late', {
          photo: 'a',
          answer: answer('2026-05-03T00:00:00Z'),
        }),
        sampleMark('early', {
          photo: 'c',
          answer: answer('2026-05-01T00:00:00Z'),
        }),
        sampleMark('again', {
          photo: 'c',
          answer: answer('2026-05-04T00:00:00Z'),
        }),
      ],
    );
    const walked = indexOf({
      ...shoot,
      added: [
        { photo: 'b', at: '2026-05-02T00:00:00Z', seenAt: null },
        { photo: 'gone', at: '2026-05-02T00:00:00Z', seenAt: null },
      ],
      carrying: {
        since: null,
        stopped: {
          at: '2026-05-05T00:00:00Z',
          reason: 'It stopped.',
          needs: 'retry',
          photos: ['a', 'b'],
          seenAt: null,
        },
      },
    });
    expect(newPhotos(walked)).toEqual(['c', 'b', 'a']);
  });

  it('knows the favorites, which only the album has', () => {
    expect(isFavorite(photoAt(4))).toBe(true);
    expect(isFavorite(photoAt(0))).toBe(false);
    expect(isFavorite(photoAt(5))).toBe(false);
  });
});
