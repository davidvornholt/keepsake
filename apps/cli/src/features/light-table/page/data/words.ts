import type { Mark, PhotoView } from '../../contract.ts';
import type { Index } from './derive.ts';
import {
  apertureOf,
  exposureOf,
  focalLengthOf,
  localClock,
  localDay,
} from './format.ts';

// What the page says about a photo, in the owner's words.

export type Said = {
  /** "Left out: the album shows the same already" */
  readonly text: string;
  /** The photo the sentence is about, shown as a picture. */
  readonly other: string | null;
  /** What was written down about it, if anything. */
  readonly because: string | null;
};

const leftOut = (index: Index, photo: PhotoView): string => {
  const { standing, verdict } = photo;
  const rule = standing.kind === 'left-out' ? standing.rule : 'unknown';
  const { picked } = index.shoot;
  if (rule === 'repeat') {
    return 'Left out: the album shows the same already';
  }
  if (rule === 'weaker') {
    return 'Left out: not as strong as the rest of the album';
  }
  if (rule === 'score') {
    return verdict === null || picked === null
      ? 'Left out: scored too low'
      : `Left out: scored ${verdict.score}, below ${picked.minimumScore}`;
  }
  if (rule === 'no-room') {
    return picked?.maximum === null || picked === null
      ? 'Left out: the album was full'
      : `Left out: the album is full at ${picked.maximum}`;
  }
  // Nothing has been chosen yet, so nothing was left out either.
  return index.chosen === 0 ? 'Not chosen yet' : 'Left out';
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

/** Where a photo stands, said in a sentence. */
export const standingOf = (index: Index, photo: PhotoView): Said => {
  const { standing } = photo;
  if (standing.kind === 'album') {
    return { text: 'In the album', other: null, because: null };
  }
  if (standing.kind === 'picked') {
    return { text: 'Chosen, not in the album yet', other: null, because: null };
  }
  if (standing.kind === 'taken-out') {
    return {
      text: `Taken out ${localDay(standing.at)}`.trim(),
      other: null,
      because: standing.because,
    };
  }
  if (standing.kind === 'other-frame') {
    return {
      text:
        index.chosen === 0
          ? 'Another frame of the moment is better'
          : 'Left out: another frame of the moment is better',
      other: standing.of,
      because: null,
    };
  }
  return {
    text: leftOut(index, photo),
    other: standing.repeats,
    because: standing.because,
  };
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
