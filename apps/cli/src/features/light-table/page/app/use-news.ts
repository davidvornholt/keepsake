import { useState } from 'react';
import type { CarryingOut } from '../../contract.ts';
import { type Index, newPhotos } from '../data/derive.ts';

// What is new as a pile to go through, oldest first: the photos with
// something new when the owner starts, and those that get something meanwhile.
// Moving on from a photo counts what is new about it as seen.

type Pile = {
  readonly photos: ReadonlyArray<string>;
  readonly current: string | null;
};

export const useNews = (
  index: Index,
  carrying: CarryingOut,
  {
    isOn,
    onSeen,
  }: {
    readonly isOn: boolean;
    /** Called with a photo the owner moved on from while it was new. */
    readonly onSeen: (photo: string) => Promise<void>;
  },
) => {
  const [pile, setPile] = useState<Pile | null>(null);
  if (isOn) {
    const fresh = newPhotos(index, carrying);
    const known = pile?.photos ?? [];
    const late = fresh.filter((photo) => !known.includes(photo));
    if (pile === null || late.length > 0) {
      // A photo stays in the pile once it is looked at, so the owner can go back to it.
      const photos = [...known, ...late];
      setPile({ photos, current: pile?.current ?? photos[0] ?? null });
    }
  } else if (pile !== null) {
    setPile(null);
  }
  const current = pile?.current ?? null;
  return {
    photos: pile?.photos ?? null,
    current,
    /** True when there is nothing to look at. */
    isEmpty: isOn && pile !== null && pile.photos.length === 0,
    show: (photo: string) => {
      if (current !== null && newPhotos(index, carrying).includes(current)) {
        onSeen(current).catch(() => undefined);
      }
      setPile((now) => (now === null ? now : { ...now, current: photo }));
    },
  };
};
