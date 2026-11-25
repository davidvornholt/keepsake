import type { PhotoView } from '../../contract.ts';
import type { Filters, Why } from '../app/route.ts';
import {
  type Index,
  isChosen,
  isFavorite,
  markedIn,
  marksOfPile,
  type Pile,
  type Section,
  sectionsOf,
  shownMarks,
} from '../data/derive.ts';
import { clockOf, count, dayAndMonth, weekdayOf } from '../data/format.ts';
import { chosenWords } from '../data/words.ts';
import type { Content, Frame } from './table.ts';

// What lies on the table for the photos that are shown, and what each sheet
// of paper is called. Photos that show the same lie in one pile, the best
// of them in front; one pile at a time can lie open.

/** Why photos aren't in the album, as the heading of a sheet says it. */
export const whyTitles: Readonly<Record<Why, string>> = {
  weak: 'Not strong enough',
  'taken-out': 'Taken out by you',
};

export type Heading = {
  readonly key: string;
  readonly title: string;
  /** What the machine counted, printed small. */
  readonly print: ReadonlyArray<string>;
  /** The day it filters by when pressed, if it stands for one. */
  readonly day: string | null;
};

type Look = {
  readonly filters: Filters;
  readonly workedOn: ReadonlySet<string>;
};

/** How far a photo is in the album that was ordered, if it is part of one. */
const stageOf = (index: Index, photo: PhotoView): Frame['order'] => {
  if (index.shoot.ordered === null || photo.standing.kind !== 'picked') {
    return null;
  }
  return photo.edit === null ? 'waits' : 'edited';
};

/** What every frame of a photo shows, whether it stands for a pile or not. */
const frameOf = (
  index: Index,
  photo: PhotoView,
  { filters, workedOn }: Look,
): Frame => {
  const isFinished = filters.show === 'album' && photo.edit !== null;
  return {
    id: photo.id,
    picture:
      isFinished && photo.edit !== null ? photo.edit.picture : photo.picture,
    // Among what was left out, nothing lies in the shade; nor does anything
    // while nothing has been chosen.
    isLit: filters.show === 'all' && index.chosen > 0 ? isChosen(photo) : true,
    number: index.numberOf.get(photo.id) ?? 0,
    time: clockOf(photo.takenAt),
    score: photo.verdict?.score ?? null,
    crop: isFinished ? null : (photo.edit?.crop ?? null),
    isFavorite: isFavorite(photo),
    marks: shownMarks(markedIn(index, photo.id)),
    isWorkedOn: workedOn.has(photo.id),
    order: stageOf(index, photo),
    pile: 1,
    opened: null,
    isApart: false,
  };
};

/** A pile as one frame: the photo in front, which carries the marks of all. */
const closed = (index: Index, pile: Pile, look: Look): Frame => ({
  ...frameOf(index, pile.front, look),
  marks: marksOfPile(index, pile),
  isWorkedOn: pile.photos.some(({ id }) => look.workedOn.has(id)),
  pile: pile.photos.length,
});

/** A pile that lies open: every photo of it, in the order they were taken. */
const open = (
  index: Index,
  { front, photos }: Pile,
  look: Look,
): ReadonlyArray<Frame> =>
  photos.map((photo, at) => {
    const frame = frameOf(index, photo, look);
    const isFront = photo.id === front.id;
    return {
      ...frame,
      // The one that stands for the pile is the one the lamp shines through.
      isLit: isChosen(front) ? isFront : frame.isLit,
      opened: { front: front.id, isFront, count: photos.length },
      isApart: at === 0,
    };
  });

const framesOf = (
  index: Index,
  piles: ReadonlyArray<Pile>,
  look: Look,
  opened: string | null,
): ReadonlyArray<Frame> =>
  piles.flatMap((pile, at) => {
    const isOpen = pile.front.id === opened && pile.photos.length > 1;
    if (isOpen) {
      return open(index, pile, look);
    }
    const isAfterOpen = at > 0 && piles[at - 1]?.front.id === opened;
    return [{ ...closed(index, pile, look), isApart: isAfterOpen }];
  });

/** The frames on the table, sheet by sheet. `opened` is the pile that lies open. */
export const contentOf = (
  index: Index,
  filters: Filters,
  workedOn: ReadonlySet<string>,
  opened: string | null = null,
): Content =>
  sectionsOf(index, filters).map(({ key, piles }) => ({
    key,
    frames: framesOf(index, piles, { filters, workedOn }, opened),
  }));

const photosIn = (piles: ReadonlyArray<Pile>): number =>
  piles.reduce((sum, { photos }) => sum + photos.length, 0);

/** How many photos lie there, and in how many piles when some lie together. */
export const pilesWords = (
  piles: number,
  photos: number,
): ReadonlyArray<string> =>
  photos === piles
    ? [count(photos, 'photo')]
    : [count(photos, 'photo'), count(piles, 'stack')];

const headingOf = (
  index: Index,
  { key, day, why, piles }: Section,
  filters: Filters,
): Heading => {
  if (day === null || why !== null) {
    return {
      key,
      title: why === null ? key : whyTitles[why],
      print: pilesWords(piles.length, photosIn(piles)),
      day: null,
    };
  }
  const isWhole = piles.length === day.piles;
  return {
    key,
    title: dayAndMonth(day.date),
    print: [
      weekdayOf(day.date),
      ...(isWhole
        ? [
            // Where room is short, the first ones are what is left to read.
            ...pilesWords(day.piles, day.taken),
            ...chosenWords(index, day),
            ...(day.edited > 0 ? [`${day.edited} edited`] : []),
          ]
        : [
            filters.show === 'album'
              ? chosenWords(index, day).join(', ')
              : pilesWords(piles.length, photosIn(piles)).join(', '),
          ]),
    ],
    day: day.date,
  };
};

export const headingsOf = (
  index: Index,
  filters: Filters,
): ReadonlyArray<Heading> =>
  sectionsOf(index, filters).map((section) =>
    headingOf(index, section, filters),
  );

/** The photos in front on the table, in the order they are gone through. */
export const orderOf = (
  index: Index,
  filters: Filters,
): ReadonlyArray<PhotoView> =>
  sectionsOf(index, filters).flatMap(({ piles }) =>
    piles.map(({ front }) => front),
  );
