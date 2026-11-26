import type { Mark, PhotoView, ShootView } from '../../contract.ts';
import { type Filters, type Why, whys } from '../app/route.ts';
import { dayOf } from './format.ts';

// Everything the page works out from a shoot, once for each time it changes.

/** The marks of one photo, by how far they have got. */
export type Marked = {
  /** Not handed over yet, so it can be taken back. */
  readonly open: Mark | null;
  /** Handed over; an agent hasn't answered. */
  readonly waiting: ReadonlyArray<Mark>;
  /** Answered, and not looked at since. */
  readonly news: ReadonlyArray<Mark>;
  /** Answered and looked at. */
  readonly past: ReadonlyArray<Mark>;
};

/** Photos that show the same. The one in front stands for all of them. */
export type Pile = {
  readonly front: PhotoView;
  /** All of them, the front one too, in the order they were taken. */
  readonly photos: ReadonlyArray<PhotoView>;
};

export type Day = {
  readonly date: string;
  readonly taken: number;
  readonly piles: number;
  readonly edited: number;
  readonly inAlbum: number;
  /** Chosen for the album, and not published there yet. */
  readonly picked: number;
};

export type Index = {
  readonly shoot: ShootView;
  readonly byId: ReadonlyMap<string, PhotoView>;
  /** The number of a frame in the shoot, from 1. */
  readonly numberOf: ReadonlyMap<string, number>;
  /** Every pile, in the order of the photos in front. */
  readonly piles: ReadonlyArray<Pile>;
  /** The pile each photo lies in. */
  readonly pileOf: ReadonlyMap<string, Pile>;
  readonly days: ReadonlyArray<Day>;
  readonly marked: ReadonlyMap<string, Marked>;
  /** Every label in use, the most used first. */
  readonly labels: ReadonlyArray<{
    readonly label: string;
    readonly count: number;
  }>;
  readonly inAlbum: number;
  /** In the album, or chosen for it and not published yet. */
  readonly chosen: number;
  /** Whether the shoot has an album, however few photos are in it. */
  readonly hasAlbum: boolean;
};

const unmarked: Marked = { open: null, waiting: [], news: [], past: [] };

const withMark = (marked: Marked, mark: Mark): Marked => {
  if (mark.handedOverAt === null) {
    return { ...marked, open: mark };
  }
  if (mark.answer === null) {
    return { ...marked, waiting: [...marked.waiting, mark] };
  }
  return mark.seenAt === null
    ? { ...marked, news: [...marked.news, mark] }
    : { ...marked, past: [...marked.past, mark] };
};

const markedOf = (marks: ReadonlyArray<Mark>): Map<string, Marked> => {
  const marked = new Map<string, Marked>();
  for (const mark of marks) {
    marked.set(mark.photo, withMark(marked.get(mark.photo) ?? unmarked, mark));
  }
  return marked;
};

export const isChosen = ({ standing }: PhotoView): boolean =>
  standing.kind === 'album' || standing.kind === 'picked';

const pilesOf = (
  { stacks }: ShootView,
  byId: ReadonlyMap<string, PhotoView>,
): ReadonlyArray<Pile> =>
  stacks.flatMap(({ front, photos }) => {
    const first = byId.get(front);
    return first === undefined
      ? []
      : [
          {
            front: first,
            photos: photos.flatMap((id) => byId.get(id) ?? []),
          },
        ];
  });

const daysOf = (piles: ReadonlyArray<Pile>): ReadonlyArray<Day> => {
  const days = new Map<string, Day>();
  for (const { front, photos } of piles) {
    const date = dayOf(front.takenAt);
    const day = days.get(date) ?? {
      date,
      taken: 0,
      piles: 0,
      edited: 0,
      inAlbum: 0,
      picked: 0,
    };
    days.set(date, {
      date,
      taken: day.taken + photos.length,
      piles: day.piles + 1,
      edited: day.edited + photos.filter(({ edit }) => edit !== null).length,
      inAlbum: day.inAlbum + (front.standing.kind === 'album' ? 1 : 0),
      picked: day.picked + (front.standing.kind === 'picked' ? 1 : 0),
    });
  }
  return [...days.values()].toSorted((left, right) =>
    left.date.localeCompare(right.date),
  );
};

const labelsOf = (photos: ReadonlyArray<PhotoView>): Index['labels'] => {
  const counts = new Map<string, number>();
  for (const label of photos.flatMap((photo) => photo.labels)) {
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts]
    .map(([label, count]) => ({ label, count }))
    .toSorted(
      (left, right) =>
        right.count - left.count || left.label.localeCompare(right.label),
    );
};

export const indexOf = (shoot: ShootView): Index => {
  const { photos } = shoot;
  const byId = new Map(photos.map((photo) => [photo.id, photo]));
  const piles = pilesOf(shoot, byId);
  const inAlbum = photos.filter(
    (photo) => photo.standing.kind === 'album',
  ).length;
  return {
    shoot,
    byId,
    numberOf: new Map(photos.map((photo, index) => [photo.id, index + 1])),
    piles,
    pileOf: new Map(
      piles.flatMap((pile) => pile.photos.map(({ id }) => [id, pile] as const)),
    ),
    days: daysOf(piles),
    marked: markedOf(shoot.marks),
    labels: labelsOf(photos),
    inAlbum,
    chosen: photos.filter(isChosen).length,
    hasAlbum: shoot.album !== null || inAlbum > 0,
  };
};

export const markedIn = (index: Index, photo: string): Marked =>
  index.marked.get(photo) ?? unmarked;

/** The photos that show the same as this one, itself too. */
export const pileAround = (index: Index, photo: PhotoView): Pile =>
  index.pileOf.get(photo.id) ?? { front: photo, photos: [photo] };

/**
 * Why the photo in front of a pile isn't in the album, or null when it is,
 * will be, or nothing is decided yet.
 */
export const whyOf = ({ standing }: PhotoView): Why | null => {
  if (standing.kind === 'taken-out') {
    return 'taken-out';
  }
  return standing.kind === 'left-out' ? 'weak' : null;
};

/** Piles that lie together on the table, under one heading. */
export type Section = {
  readonly key: string;
  readonly day: Day | null;
  readonly why: Why | null;
  readonly piles: ReadonlyArray<Pile>;
};

const isShown = ({ front, photos }: Pile, filters: Filters): boolean => {
  const why = whyOf(front);
  const { label } = filters;
  return (
    (filters.day === null || dayOf(front.takenAt) === filters.day) &&
    (label === null || photos.some(({ labels }) => labels.includes(label))) &&
    (filters.show !== 'album' || isChosen(front)) &&
    (filters.show !== 'left' ||
      (why !== null && (filters.why === null || filters.why === why)))
  );
};

/** What lies on the table, in the order it is gone through. */
export const sectionsOf = (
  index: Index,
  filters: Filters,
): ReadonlyArray<Section> => {
  const shown = index.piles.filter((pile) => isShown(pile, filters));
  if (filters.show === 'left') {
    const byWhy = Map.groupBy(shown, ({ front }) => whyOf(front));
    return whys.flatMap((why) => {
      const piles = byWhy.get(why);
      return piles === undefined ? [] : [{ key: why, day: null, why, piles }];
    });
  }
  const byDay = Map.groupBy(shown, ({ front }) => dayOf(front.takenAt));
  return index.days.flatMap((day) => {
    const piles = byDay.get(day.date);
    return piles === undefined
      ? []
      : [{ key: day.date, day, why: null, piles }];
  });
};

/** How many piles each view of the table holds. They add up. */
export type Counts = {
  readonly all: number;
  readonly album: number;
  readonly left: number;
  readonly weak: number;
  readonly takenOut: number;
  /** Nothing is decided about them yet. */
  readonly open: number;
};

/** How many piles each view holds, on one day or on all. */
export const countsOf = (index: Index, day: string | null): Counts => {
  const fronts = index.piles
    .map(({ front }) => front)
    .filter(({ takenAt }) => day === null || dayOf(takenAt) === day);
  const weak = fronts.filter((front) => whyOf(front) === 'weak').length;
  const takenOut = fronts.filter(
    (front) => whyOf(front) === 'taken-out',
  ).length;
  const album = fronts.filter(isChosen).length;
  return {
    all: fronts.length,
    album,
    left: weak + takenOut,
    weak,
    takenOut,
    open: fronts.length - album - weak - takenOut,
  };
};

/** What waits for the owner or for an agent. */
export type Attention = {
  /** Answered, and not looked at yet. */
  readonly news: ReadonlyArray<Mark>;
  /** Not handed over yet. */
  readonly wishes: ReadonlyArray<Mark>;
  /** Handed over, and not answered yet. */
  readonly waiting: ReadonlyArray<Mark>;
};

export const attentionOf = (marks: ReadonlyArray<Mark>): Attention => ({
  news: marks.filter((mark) => mark.answer !== null && mark.seenAt === null),
  wishes: marks.filter((mark) => mark.handedOverAt === null),
  waiting: marks.filter(
    (mark) => mark.handedOverAt !== null && mark.answer === null,
  ),
});

/** Whether acting on a mark means editing a photo, which costs money. */
export const needsEdit = (
  index: Index,
  { kind, photo, note }: Mark,
): boolean => {
  const about = index.byId.get(photo);
  if (kind === 'change') {
    // A wish for a photo that isn't edited yet is part of its first edit.
    return about?.standing.kind !== 'picked';
  }
  return (
    (kind === 'put-in' || kind === 'swap') &&
    (about?.edit === null || note !== '')
  );
};

/** How many photos are chosen once these marks are acted on. */
export const chosenAfter = (index: Index, marks: ReadonlyArray<Mark>): number =>
  index.chosen +
  marks.filter(({ kind }) => kind === 'put-in').length -
  marks.filter(({ kind }) => kind === 'take-out').length;

/** Whether a photo carries the favorite heart in Immich. */
export const isFavorite = ({ standing }: PhotoView): boolean =>
  standing.kind === 'album' && standing.favorite;

/** The photo that stands in front of this one, if one does. */
export const frontOf = (
  index: Index,
  { standing }: PhotoView,
): PhotoView | null =>
  standing.kind === 'similar' ? (index.byId.get(standing.to) ?? null) : null;

/** The mark a photo shows on the table, and how far it has got. */
export type Shown = {
  readonly mark: Mark;
  readonly state: 'open' | 'waiting' | 'news';
};

export const shownMarks = (marked: Marked): ReadonlyArray<Shown> => {
  const news = marked.news.at(-1);
  return [
    ...(news === undefined ? [] : [{ mark: news, state: 'news' } as const]),
    ...marked.waiting
      .slice(-1)
      .map((mark) => ({ mark, state: 'waiting' }) as const),
    ...(marked.open === null
      ? []
      : [{ mark: marked.open, state: 'open' } as const]),
  ];
};

/** The marks of every photo of a pile, as the photo in front shows them. */
export const marksOfPile = (
  index: Index,
  { photos }: Pile,
): ReadonlyArray<Shown> =>
  photos.flatMap(({ id }) => shownMarks(markedIn(index, id)));

/** The photos with an answer the owner hasn't looked at, in the order of the shoot. */
export const answeredPhotos = (index: Index): ReadonlyArray<string> =>
  index.shoot.photos
    .filter(({ id }) => markedIn(index, id).news.length > 0)
    .map(({ id }) => id);
