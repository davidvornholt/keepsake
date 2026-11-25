import type { Mark, PhotoView } from '../../contract.ts';
import { frontOf, type Index } from './derive.ts';
import {
  apertureOf,
  exposureOf,
  focalLengthOf,
  localClock,
  localDay,
} from './format.ts';

// What the page says about a photo, in the owner's words.

export type Said = {
  /** Where the photo stands: "In the album", "Behind a photo that shows the same". */
  readonly text: string;
  /** The photo in front of it, shown as a picture. */
  readonly other: string | null;
  /** Why, as it was written down. Null while nobody has. */
  readonly because: string | null;
  /** What kind of sentence it is, for how it is shown. */
  readonly tone: 'in' | 'out' | 'open';
};

/**
 * How many photos of some part of the shoot were chosen: "45 in the album",
 * "3 chosen", both, or nothing while nothing has been chosen at all.
 */
export const chosenWords = (
  index: Index,
  part: { readonly inAlbum: number; readonly picked: number },
): ReadonlyArray<string> => [
  ...(index.hasAlbum ? [`${part.inAlbum} in the album`] : []),
  ...(part.picked > 0 || (index.chosen > 0 && !index.hasAlbum)
    ? [`${part.picked} chosen`]
    : []),
];

/** What the chosen photos are called together: the album, once there is one. */
export const chosenName = (index: Index): string =>
  index.hasAlbum ? 'Album' : 'Chosen';

/** Where the photo in front stands, as part of a sentence about one behind it. */
const frontWords = (front: PhotoView | null): string => {
  if (front === null) {
    return 'another photo that shows the same';
  }
  const stands = {
    album: 'the photo in the album',
    picked: 'the photo chosen for the album',
    open: 'a photo that shows the same',
    'taken-out': 'a photo you took out',
    similar: 'a photo that shows the same',
    'left-out': 'a photo that was left out too',
  } as const;
  return stands[front.standing.kind];
};

/** Where a photo stands, said in a sentence. */
export const standingOf = (index: Index, photo: PhotoView): Said => {
  const { standing } = photo;
  if (standing.kind === 'album') {
    return { text: 'In the album', other: null, because: null, tone: 'in' };
  }
  if (standing.kind === 'picked') {
    return {
      text: 'Chosen for the album',
      other: null,
      because: null,
      tone: 'in',
    };
  }
  if (standing.kind === 'open') {
    return {
      text: 'Not decided yet',
      other: null,
      because: null,
      tone: 'open',
    };
  }
  if (standing.kind === 'taken-out') {
    return {
      text: `Taken out by you ${localDay(standing.at)}`.trim(),
      other: null,
      because: standing.because,
      tone: 'out',
    };
  }
  if (standing.kind === 'similar') {
    return {
      text: `Behind ${frontWords(frontOf(index, photo))}`,
      other: standing.to,
      because: standing.because,
      tone: 'out',
    };
  }
  return {
    text: 'Left out: not strong enough',
    other: null,
    because: standing.because,
    tone: 'out',
  };
};

/** What is said when nobody wrote down why. */
const unsaid = (photo: PhotoView, isPreparing: boolean): string | null => {
  const { kind } = photo.standing;
  if (kind === 'album' || kind === 'picked') {
    return photo.verdict?.reason ?? photo.verdict?.description ?? null;
  }
  if (kind === 'open') {
    return isPreparing
      ? 'Keepsake is still going through the photos.'
      : 'The best photos haven’t been chosen yet.';
  }
  if (kind === 'taken-out') {
    return 'No reason was given.';
  }
  return isPreparing
    ? 'The reason is being written down.'
    : 'No reason was written down.';
};

/** Why a photo stands where it does, or that nobody has said. */
export const whyOf = (
  index: Index,
  photo: PhotoView,
  isPreparing: boolean,
): string | null =>
  standingOf(index, photo).because ?? unsaid(photo, isPreparing);

/** The same in a word or two, for where room is short. */
export const standingName = ({ standing }: PhotoView): string => {
  const names = {
    album: 'In the album',
    picked: 'Chosen',
    open: 'Not decided',
    'taken-out': 'Taken out',
    similar: 'Behind',
    'left-out': 'Left out',
  } as const;
  return names[standing.kind];
};

/** The lens and how the photo was exposed: 600 mm · f/6.3 · 1/1000 s · ISO 800. */
export const exposureLine = (photo: PhotoView): ReadonlyArray<string> => [
  ...(photo.focalLength === null ? [] : [focalLengthOf(photo.focalLength)]),
  ...(photo.aperture === null ? [] : [apertureOf(photo.aperture)]),
  ...(photo.exposure === null ? [] : [exposureOf(photo.exposure)]),
  ...(photo.iso === null ? [] : [`ISO ${photo.iso}`]),
];

/** How far a mark has got, in a few words. */
export const stateOf = (mark: Mark): string => {
  if (mark.answer !== null) {
    const at = `${localDay(mark.answer.at)}, ${localClock(mark.answer.at)}`;
    return mark.answer.outcome === 'done' ? `Done ${at}` : `Not done ${at}`;
  }
  return mark.handedOverAt === null
    ? 'Not handed over yet'
    : `Handed over ${localDay(mark.handedOverAt)}, ${localClock(mark.handedOverAt)}`;
};
