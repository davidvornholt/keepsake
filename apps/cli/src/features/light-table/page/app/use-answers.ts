import { useState } from 'react';
import { answeredPhotos, type Index } from '../data/derive.ts';

// The answers of an agent as a pile to go through: the photos that have one
// when the owner starts, and those that get one meanwhile.

type Pile = {
  readonly photos: ReadonlyArray<string>;
  readonly current: string | null;
};

export const useAnswers = (index: Index, isOn: boolean) => {
  const [pile, setPile] = useState<Pile | null>(null);
  if (isOn) {
    const answered = answeredPhotos(index);
    const known = pile?.photos ?? [];
    const late = answered.filter((photo) => !known.includes(photo));
    if (pile === null || late.length > 0) {
      // A photo stays in the pile once it is looked at, so the owner can go back to it.
      const photos = [...known, ...late];
      setPile({ photos, current: pile?.current ?? photos[0] ?? null });
    }
  } else if (pile !== null) {
    setPile(null);
  }
  return {
    photos: pile?.photos ?? null,
    current: pile?.current ?? null,
    /** True when there is nothing to look at. */
    isEmpty: isOn && pile !== null && pile.photos.length === 0,
    show: (photo: string) =>
      setPile((now) => (now === null ? now : { ...now, current: photo })),
  };
};
