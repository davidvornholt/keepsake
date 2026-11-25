import type { PhotoView } from '../../contract.ts';
import type { Filters, Why } from '../app/route.ts';
import {
  type Index,
  isFavorite,
  markedIn,
  type Section,
  sectionsOf,
  shownMarks,
  whyOf,
} from '../data/derive.ts';
import { clockOf, count, dayAndMonth, weekdayOf } from '../data/format.ts';
import { chosenWords } from '../data/words.ts';
import type { Content, Frame } from './table.ts';

// What lies on the table for the photos that are shown, and what each sheet
// of paper is called.

/** Why photos aren't in the album, as the heading of a sheet says it. */
export const whyTitles: Readonly<Record<Why, string>> = {
  repeat: 'Shows the same as a photo in the album',
  weaker: 'Not as strong as the album',
  score: 'Scored too low',
  'no-room': 'No room in the album',
  unknown: 'Left out, no reason written down',
  'taken-out': 'Taken out',
  'other-frame': 'Another frame of the moment is better',
};

/** The same in a word or two, for where room is short. */
export const whyNames: Readonly<Record<Why, string>> = {
  repeat: 'Same as another',
  weaker: 'Not as strong',
  score: 'Low score',
  'no-room': 'No room',
  unknown: 'No reason',
  'taken-out': 'Taken out',
  'other-frame': 'Other frames',
};

export type Heading = {
  readonly key: string;
  readonly title: string;
  /** What the machine counted, printed small. */
  readonly print: ReadonlyArray<string>;
  /** The day it filters by when pressed, if it stands for one. */
  readonly day: string | null;
};

const frameOf = (
  index: Index,
  photo: PhotoView,
  look: {
    readonly filters: Filters;
    readonly before: PhotoView | undefined;
    readonly workedOn: ReadonlySet<string>;
  },
): Frame => {
  const isFinished = look.filters.show === 'album' && photo.edit !== null;
  const isChosen = whyOf(photo) === null;
  return {
    id: photo.id,
    picture:
      isFinished && photo.edit !== null ? photo.edit.picture : photo.picture,
    // Among what was left out, nothing lies in the shade; nor does anything
    // while nothing has been chosen.
    isLit: look.filters.show === 'all' && index.chosen > 0 ? isChosen : true,
    isMomentStart: look.before?.moment !== photo.moment,
    number: index.numberOf.get(photo.id) ?? 0,
    time: clockOf(photo.takenAt),
    score: photo.verdict?.score ?? null,
    crop: isFinished ? null : (photo.edit?.crop ?? null),
    isFavorite: isFavorite(index, photo),
    marks: shownMarks(markedIn(index, photo.id)),
    isWorkedOn: look.workedOn.has(photo.id),
  };
};

/** The frames on the table, sheet by sheet. */
export const contentOf = (
  index: Index,
  filters: Filters,
  workedOn: ReadonlySet<string>,
): Content =>
  sectionsOf(index, filters).map(({ key, photos }) => ({
    key,
    frames: photos.map((photo, at) =>
      frameOf(index, photo, { filters, before: photos[at - 1], workedOn }),
    ),
  }));

const headingOf = (
  index: Index,
  { key, day, why, photos }: Section,
  filters: Filters,
): Heading => {
  if (day === null || why !== null) {
    return {
      key,
      title: why === null ? key : whyTitles[why],
      print: [count(photos.length, 'photo')],
      day: null,
    };
  }
  const isWhole = photos.length === day.taken;
  return {
    key,
    title: dayAndMonth(day.date),
    print: [
      weekdayOf(day.date),
      ...(isWhole
        ? [
            // Where room is short, the first ones are what is left to read.
            `${day.taken} taken`,
            ...chosenWords(index, day),
            count(day.moments, 'moment'),
            ...(day.edited > 0 ? [`${day.edited} edited`] : []),
          ]
        : [
            filters.show === 'album'
              ? chosenWords(index, day).join(', ')
              : count(photos.length, 'photo'),
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

/** The photos on the table in the order they are gone through. */
export const orderOf = (
  index: Index,
  filters: Filters,
): ReadonlyArray<PhotoView> =>
  sectionsOf(index, filters).flatMap(({ photos }) => photos);
