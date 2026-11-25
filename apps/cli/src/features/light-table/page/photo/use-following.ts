import { useRef } from 'react';
import type { BesideHandle } from './beside.tsx';
import type { BoxesHandle } from './boxes.tsx';
import type { NeighboursHandle } from './neighbours.tsx';
import type { Seen } from './room.ts';
import type { Around } from './use-photo.ts';

// What lies around a photo follows it on every frame, past React: the
// boxes drawn on it, the photo it is measured against, the photos before
// and after it, and how close it is looked at.

const percent = 100;

export const useFollowing = (around: Around) => {
  const besideRef = useRef<BesideHandle | null>(null);
  const neighboursRef = useRef<NeighboursHandle | null>(null);
  const boxesRef = useRef<BoxesHandle | null>(null);
  const seenRef = useRef<Seen | null>(null);
  const shareRef = useRef<HTMLSpanElement>(null);
  return {
    besideRef,
    neighboursRef,
    boxesRef,
    seenRef,
    shareRef,
    /** The photo is somewhere else on the screen, or seen at another size. */
    onSeen: (seen: Seen) => {
      seenRef.current = seen;
      boxesRef.current?.follow(seen.edit);
      besideRef.current?.follow(seen);
      if (shareRef.current !== null) {
        shareRef.current.textContent = `${Math.round(seen.share * percent)} %`;
      }
    },
    /** The photo is pulled aside, towards the one before or after it. */
    onOffset: (offset: number) => {
      around.onOffset(offset);
      besideRef.current?.shift(offset);
      // While the photo before makes way, it is what lies beside this one.
      neighboursRef.current?.follow(around.isPassing() ? 0 : offset);
    },
  };
};
