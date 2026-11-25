import type { Preparation } from '../../contract.ts';
import type { Index } from '../data/derive.ts';

// An album is made in three parts: keepsake gets it ready, the owner goes
// over the choice and orders it, an agent has it edited.

export type MakingPart = 'ready' | 'chosen' | 'ordered';

/** Which part of making an album is going on, if any still is. */
export const makingOf = ({
  index,
  state,
}: {
  readonly index: Index;
  readonly state: { readonly preparation: Preparation | null };
}): MakingPart | null => {
  if (state.preparation !== null) {
    return 'ready';
  }
  if (index.shoot.ordered !== null) {
    return 'ordered';
  }
  return index.chosen > 0 && !index.hasAlbum ? 'chosen' : null;
};
