import type { Mark, PhotoView } from '../../contract.ts';
import { type Index, markedIn } from '../data/derive.ts';

/** What stands above the pencils of a photo, if anything. */
export type Word =
  | { readonly kind: 'answer'; readonly mark: Mark }
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
  }: { readonly isWorkedOn: boolean; readonly isComposing: boolean },
): Word | null => {
  const { news, waiting, open } = markedIn(index, photo.id);
  const answered = news.at(-1);
  if (answered !== undefined) {
    return { kind: 'answer', mark: answered };
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
