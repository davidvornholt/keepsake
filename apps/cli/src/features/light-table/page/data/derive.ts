import type { Mark, MarkKind, PhotoView, ShootView } from '../../contract.ts';
import { opinionKinds } from '../../kinds.ts';
import { type Filters, type Why, whys } from '../app/route.ts';
import { dayOf } from './format.ts';

// Everything the page works out from a shoot, once for each time it changes.

/** The marks of one photo, by how far they have got. */
export type Marked = {
  /** Not handed over yet, so it can be taken back. Not about favourites. */
  readonly open: Mark | null;
  /** Not handed over yet, about being a favourite. */
  readonly favorite: Mark | null;
  /** Handed over; an agent hasn't answered. */
  readonly waiting: ReadonlyArray<Mark>;
  /** Answered, and not looked at since. */
  readonly news: ReadonlyArray<Mark>;
  /** Answered and looked at. */
  readonly past: ReadonlyArray<Mark>;
};

export type Day = {
  readonly date: string;
  readonly taken: number;
  readonly moments: number;
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
  readonly byMoment: ReadonlyMap<string, ReadonlyArray<PhotoView>>;
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

const unmarked: Marked = {
  open: null,
  favorite: null,
  waiting: [],
  news: [],
  past: [],
};

export const isAboutFavorites = (kind: MarkKind): boolean =>
  kind === 'favorite' || kind === 'not-favorite';

export const isOpinion = (kind: MarkKind): boolean =>
  (opinionKinds as ReadonlyArray<MarkKind>).includes(kind);

const withMark = (marked: Marked, mark: Mark): Marked => {
  if (mark.handedOverAt === null) {
    return isAboutFavorites(mark.kind)
      ? { ...marked, favorite: mark }
      : { ...marked, open: mark };
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

const daysOf = (photos: ReadonlyArray<PhotoView>): ReadonlyArray<Day> => {
  const days = new Map<string, Day & { readonly seen: Set<string> }>();
  for (const photo of photos) {
    const date = dayOf(photo.takenAt);
    const day = days.get(date) ?? {
      date,
      taken: 0,
      moments: 0,
      edited: 0,
      inAlbum: 0,
      picked: 0,
      seen: new Set<string>(),
    };
    const isNewMoment = !day.seen.has(photo.moment);
    day.seen.add(photo.moment);
    days.set(date, {
      ...day,
      taken: day.taken + 1,
      moments: day.moments + (isNewMoment ? 1 : 0),
      edited: day.edited + (photo.edit === null ? 0 : 1),
      inAlbum: day.inAlbum + (photo.standing.kind === 'album' ? 1 : 0),
      picked: day.picked + (photo.standing.kind === 'picked' ? 1 : 0),
    });
  }
  return [...days.values()]
    .map(({ seen: _, ...day }) => day)
    .toSorted((left, right) => left.date.localeCompare(right.date));
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
  const inAlbum = photos.filter(
    (photo) => photo.standing.kind === 'album',
  ).length;
  return {
    shoot,
    byId: new Map(photos.map((photo) => [photo.id, photo])),
    numberOf: new Map(photos.map((photo, index) => [photo.id, index + 1])),
    byMoment: Map.groupBy(photos, (photo) => photo.moment),
    days: daysOf(photos),
    marked: markedOf(shoot.marks),
    labels: labelsOf(photos),
    inAlbum,
    chosen: photos.filter(
      ({ standing }) => standing.kind === 'album' || standing.kind === 'picked',
    ).length,
    hasAlbum: shoot.album !== null || inAlbum > 0,
  };
};

export const markedIn = (index: Index, photo: string): Marked =>
  index.marked.get(photo) ?? unmarked;

/** Why a photo isn't in the album, or null when it is or will be. */
export const whyOf = ({ standing }: PhotoView): Why | null => {
  if (standing.kind === 'album' || standing.kind === 'picked') {
    return null;
  }
  return standing.kind === 'left-out' ? standing.rule : standing.kind;
};

/** Photos that lie together on the table, under one heading. */
export type Section = {
  readonly key: string;
  readonly day: Day | null;
  readonly why: Why | null;
  readonly photos: ReadonlyArray<PhotoView>;
};

const isShown = (photo: PhotoView, filters: Filters): boolean => {
  const why = whyOf(photo);
  return (
    (filters.day === null || dayOf(photo.takenAt) === filters.day) &&
    (filters.label === null || photo.labels.includes(filters.label)) &&
    (filters.show !== 'album' || why === null) &&
    (filters.show !== 'left' ||
      (why !== null && (filters.why === null || filters.why === why)))
  );
};

/** What lies on the table, in the order it is gone through. */
export const sectionsOf = (
  index: Index,
  filters: Filters,
): ReadonlyArray<Section> => {
  const shown = index.shoot.photos.filter((photo) => isShown(photo, filters));
  if (filters.show === 'left') {
    const byWhy = Map.groupBy(shown, whyOf);
    return whys.flatMap((why) => {
      const photos = byWhy.get(why);
      return photos === undefined ? [] : [{ key: why, day: null, why, photos }];
    });
  }
  const byDay = Map.groupBy(shown, (photo) => dayOf(photo.takenAt));
  return index.days.flatMap((day) => {
    const photos = byDay.get(day.date);
    return photos === undefined
      ? []
      : [{ key: day.date, day, why: null, photos }];
  });
};

/** How many photos were left out for each reason, on one day or on all. */
export const whyCounts = (
  index: Index,
  day: string | null,
): ReadonlyMap<Why, number> => {
  const counts = new Map<Why, number>();
  for (const photo of index.shoot.photos) {
    const why = whyOf(photo);
    if (why !== null && (day === null || dayOf(photo.takenAt) === day)) {
      counts.set(why, (counts.get(why) ?? 0) + 1);
    }
  }
  return counts;
};

/** What waits for the owner or for an agent. */
export type Attention = {
  /** Answered, and not looked at yet. */
  readonly news: ReadonlyArray<Mark>;
  /** Not handed over, for an agent to act on. */
  readonly wishes: ReadonlyArray<Mark>;
  /** Not handed over, and nothing an agent acts on. */
  readonly opinions: ReadonlyArray<Mark>;
  /** Handed over, and not answered yet. */
  readonly waiting: ReadonlyArray<Mark>;
};

export const attentionOf = (marks: ReadonlyArray<Mark>): Attention => {
  const open = marks.filter((mark) => mark.handedOverAt === null);
  return {
    news: marks.filter((mark) => mark.answer !== null && mark.seenAt === null),
    wishes: open.filter((mark) => !isOpinion(mark.kind)),
    opinions: open.filter((mark) => isOpinion(mark.kind)),
    waiting: marks.filter(
      (mark) => mark.handedOverAt !== null && mark.answer === null,
    ),
  };
};

/** Whether acting on a mark means editing a photo, which costs money. */
export const needsEdit = (index: Index, { kind, photo }: Mark): boolean =>
  kind === 'change' ||
  ((kind === 'put-in' || kind === 'swap') &&
    index.byId.get(photo)?.edit === null);

/** How many photos are chosen once these marks are acted on. */
export const chosenAfter = (index: Index, marks: ReadonlyArray<Mark>): number =>
  index.chosen +
  marks.filter(({ kind }) => kind === 'put-in').length -
  marks.filter(({ kind }) => kind === 'take-out').length;

/** Whether a photo will be a favourite, counting the marks about it. */
export const isFavorite = (index: Index, photo: PhotoView): boolean => {
  const { favorite, waiting } = markedIn(index, photo.id);
  const wished =
    favorite ?? waiting.findLast((mark) => isAboutFavorites(mark.kind));
  return wished === undefined
    ? photo.standing.kind === 'album' && photo.standing.favorite
    : wished.kind === 'favorite';
};

/** The photo to look at next to one that isn't in the album. */
export const counterpartOf = (
  index: Index,
  { standing }: PhotoView,
): PhotoView | null => {
  if (standing.kind === 'left-out' && standing.repeats !== null) {
    return index.byId.get(standing.repeats) ?? null;
  }
  return standing.kind === 'other-frame'
    ? (index.byId.get(standing.of) ?? null)
    : null;
};

/** Whether the owner has said anything about a photo that still holds. */
export const isLookedAt = (index: Index, photo: string): boolean => {
  const { open, waiting, past } = markedIn(index, photo);
  return open !== null || waiting.length > 0 || past.length > 0;
};

/** The mark a photo shows on the table, and how far it has got. */
export type Shown = {
  readonly mark: Mark;
  readonly state: 'open' | 'waiting' | 'news';
};

export const shownMarks = (marked: Marked): ReadonlyArray<Shown> => {
  const news = marked.news.at(-1);
  const waiting = marked.waiting.filter((mark) => mark.kind !== 'favorite');
  return [
    ...(news === undefined ? [] : [{ mark: news, state: 'news' } as const]),
    ...waiting.slice(-1).map((mark) => ({ mark, state: 'waiting' }) as const),
    ...[marked.open, marked.favorite]
      .filter((mark) => mark !== null)
      .map((mark) => ({ mark, state: 'open' }) as const),
  ];
};

/** The photos with an answer the owner hasn't looked at, in the order of the shoot. */
export const answeredPhotos = (index: Index): ReadonlyArray<string> =>
  index.shoot.photos
    .filter(({ id }) => markedIn(index, id).news.length > 0)
    .map(({ id }) => id);
