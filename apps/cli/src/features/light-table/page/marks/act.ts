import type { Mark, MarkKind, NewMark, PhotoView } from '../../contract.ts';
import {
  counterpartOf,
  type Index,
  isFavorite,
  markedIn,
} from '../data/derive.ts';

import { lookOf } from './kinds.ts';

// What the owner can say about a photo, and what a press of a key or a
// button does about it. Saying the same thing twice takes it back.

/** The marks for a photo that is or will be in the album, and for one that isn't. */
const forChosen = ['keep', 'change', 'take-out', 'favorite'] as const;
const forLeftOut = ['put-in', 'swap', 'leave-out'] as const;

export const isChosen = ({ standing }: PhotoView): boolean =>
  standing.kind === 'album' || standing.kind === 'picked';

/** The photo of the album a swap would take out, if there is one. */
export const swapFor = (index: Index, photo: PhotoView): PhotoView | null => {
  const other = counterpartOf(index, photo);
  return other !== null && other.standing.kind === 'album' ? other : null;
};

/** The marks that make sense for a photo, in the order they are offered. */
export const kindsFor = (
  index: Index,
  photo: PhotoView,
): ReadonlyArray<MarkKind> => {
  if (isChosen(photo)) {
    return forChosen;
  }
  return swapFor(index, photo) === null
    ? forLeftOut.filter((kind) => kind !== 'swap')
    : forLeftOut;
};

/** What can be said about a photo, as a sentence for when something else was tried. */
export const offeredFor = (index: Index, photo: PhotoView): string => {
  const offered = kindsFor(index, photo)
    .map((kind) => `${lookOf[kind].says} (${lookOf[kind].key})`)
    .join(', ');
  const stands = {
    album: 'is in the album',
    picked: 'is chosen for the album',
  };
  const { standing } = photo;
  const where =
    standing.kind === 'album' || standing.kind === 'picked'
      ? stands[standing.kind]
      : "isn't in the album";
  return `This photo ${where}: ${offered}.`;
};

export type Action =
  | { readonly does: 'make'; readonly wanted: NewMark }
  | { readonly does: 'take-back'; readonly mark: Mark }
  /** A change needs words first. */
  | { readonly does: 'compose'; readonly mark: Mark | null };

const plain = (photo: string, kind: MarkKind): NewMark => ({
  photo,
  kind,
  note: '',
  boxes: [],
  other: null,
});

const aboutFavorite = (index: Index, photo: PhotoView): Action => {
  const { favorite } = markedIn(index, photo.id);
  if (favorite !== null) {
    return { does: 'take-back', mark: favorite };
  }
  const kind = isFavorite(index, photo) ? 'not-favorite' : 'favorite';
  return { does: 'make', wanted: plain(photo.id, kind) };
};

/** What choosing a mark for a photo does, or null when it makes no sense. */
export const actionFor = (
  index: Index,
  photo: PhotoView,
  kind: MarkKind,
): Action | null => {
  if (!kindsFor(index, photo).includes(kind)) {
    return null;
  }
  if (kind === 'favorite') {
    return aboutFavorite(index, photo);
  }
  const { open } = markedIn(index, photo.id);
  if (kind === 'change') {
    return { does: 'compose', mark: open?.kind === 'change' ? open : null };
  }
  if (open?.kind === kind) {
    return { does: 'take-back', mark: open };
  }
  const other = kind === 'swap' ? (swapFor(index, photo)?.id ?? null) : null;
  return { does: 'make', wanted: { ...plain(photo.id, kind), other } };
};

const keys: Readonly<Record<string, MarkKind>> = {
  k: 'keep',
  c: 'change',
  x: 'take-out',
  f: 'favorite',
  p: 'put-in',
  s: 'swap',
  l: 'leave-out',
};

/** The mark a key stands for. */
export const kindOfKey = (key: string): MarkKind | null =>
  keys[key.toLowerCase()] ?? null;

/** Whether the page turns to the next photo after a mark of this kind. */
export const turnsPage = (kind: MarkKind): boolean =>
  kind === 'keep' || kind === 'leave-out';
