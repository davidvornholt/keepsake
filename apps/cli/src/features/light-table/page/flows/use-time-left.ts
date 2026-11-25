import { useRef } from 'react';
import { secondsLeft, timeLeft } from '../data/activity.ts';

const second = 1000;

/**
 * About how long something still takes, in words, from how fast its share
 * grew while the page looked on. Null until enough got done to tell.
 */
export const useTimeLeft = (share: number | null): string | null => {
  const firstRef = useRef<{ share: number; at: number } | null>(null);
  if (share === null) {
    firstRef.current = null;
    return null;
  }
  // Starting over, as after it stopped, is a new start for the guess too.
  if (firstRef.current === null || share < firstRef.current.share) {
    firstRef.current = { share, at: performance.now() };
  }
  const left = secondsLeft(share, {
    share: firstRef.current.share,
    seconds: (performance.now() - firstRef.current.at) / second,
  });
  return left === null ? null : timeLeft(left);
};
