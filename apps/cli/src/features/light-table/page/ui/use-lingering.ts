import { useEffect, useState } from 'react';
import { prefersReducedMotion } from './theme.ts';

/**
 * Whether something is there, and for a moment after it was sent away, so
 * that it can leave the way it came instead of being gone at once.
 */
export const useLingering = (isWanted: boolean, time: number) => {
  const [isKept, setIsKept] = useState(isWanted);
  if (isWanted && !isKept) {
    setIsKept(true);
  }
  useEffect(() => {
    if (isWanted || !isKept) {
      return;
    }
    const timer = setTimeout(
      () => setIsKept(false),
      prefersReducedMotion() ? 0 : time,
    );
    return () => clearTimeout(timer);
  }, [isWanted, isKept, time]);
  return { isThere: isWanted || isKept, isLeaving: !isWanted && isKept };
};
