import type { CarryingOut, Mark, PhotoView } from '../../contract.ts';
import { type Index, markedIn } from '../data/derive.ts';
import { type CarryingState, carryingStateOf } from '../flows/ledger.ts';

/** What stands above the pencils of a photo, if anything. */
export type Word =
  | { readonly kind: 'answer'; readonly mark: Mark }
  /** What was handed over stopped at this photo, until the owner goes on. */
  | {
      readonly kind: 'stopped';
      readonly carrying: Extract<CarryingState, { is: 'stopped' }>;
    }
  /** An order put it into the album, and the owner hasn't looked at it. */
  | { readonly kind: 'added'; readonly at: string }
  | { readonly kind: 'working' }
  | { readonly kind: 'waiting'; readonly mark: Mark }
  /** The owner's own words on a mark that isn't handed over. */
  | { readonly kind: 'mine'; readonly mark: Mark };

export const wordOf = (
  index: Index,
  photo: PhotoView,
  {
    isWorkedOn,
    isComposing,
    carrying = index.shoot.carrying,
  }: {
    readonly isWorkedOn: boolean;
    readonly isComposing: boolean;
    /** How what was handed over goes, as keepsake last said. */
    readonly carrying?: CarryingOut;
  },
): Word | null => {
  const { news, waiting, open } = markedIn(index, photo.id);
  const answered = news.at(-1);
  if (answered !== undefined) {
    return { kind: 'answer', mark: answered };
  }
  const state = carryingStateOf(index.shoot, carrying, null);
  if (state.is === 'stopped' && state.stopped.photos.includes(photo.id)) {
    return { kind: 'stopped', carrying: state };
  }
  const added = index.shoot.added.find(
    (one) => one.photo === photo.id && one.seenAt === null,
  );
  if (added !== undefined) {
    return { kind: 'added', at: added.at };
  }
  if (isWorkedOn) {
    return { kind: 'working' };
  }
  const held = waiting.at(-1);
  if (held !== undefined) {
    return { kind: 'waiting', mark: held };
  }
  // While the words are written they stand in the field, not above it.
  return open === null || open.note === '' || isComposing
    ? null
    : { kind: 'mine', mark: open };
};

/** The keys of what is new in a word, as the server knows them. */
const keysIn = (word: Word | null, photo: string): ReadonlyArray<string> => {
  switch (word?.kind) {
    case 'answer':
      return word.mark.answer === null
        ? []
        : [`answer:${word.mark.id}:${word.mark.answer.at}`];
    case 'stopped':
      return [`stop:${word.carrying.stopped.id}`];
    case 'added':
      return [`added:${photo}:${word.at}`];
    default:
      return [];
  }
};

/**
 * What the page shows as new about a photo, by the keys the owner sees it
 * by. Only that, so what came after it was shown stays new.
 */
export const newsShownOf = (
  index: Index,
  photo: string,
  carrying: CarryingOut,
): ReadonlyArray<string> => {
  const view = index.byId.get(photo);
  return view === undefined
    ? []
    : keysIn(
        wordOf(index, view, {
          isWorkedOn: false,
          isComposing: false,
          carrying,
        }),
        photo,
      );
};
