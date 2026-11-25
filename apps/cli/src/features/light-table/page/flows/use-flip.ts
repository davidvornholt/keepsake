import { type RefObject, useLayoutEffect, useRef } from 'react';
import { prefersReducedMotion } from '../ui/theme.ts';

const movingTime = 460;
const easing = 'cubic-bezier(0.22, 1, 0.36, 1)';

/**
 * Lets the rows of a list travel to their new places when the list changes,
 * instead of jumping there. A row is anything with `data-row` in the list.
 */
export const useFlip = (listRef: RefObject<HTMLElement | null>): void => {
  const placesRef = useRef(new Map<string, number>());

  useLayoutEffect(() => {
    const list = listRef.current;
    if (list === null) {
      return;
    }
    const places = new Map<string, number>();
    for (const row of list.querySelectorAll<HTMLElement>('[data-row]')) {
      const key = row.dataset.row ?? '';
      const top = row.offsetTop;
      const before = placesRef.current.get(key);
      places.set(key, top);
      if (before !== undefined && before !== top && !prefersReducedMotion()) {
        row.animate(
          [
            { transform: `translateY(${before - top}px)` },
            { transform: 'none' },
          ],
          { duration: movingTime, easing },
        );
      }
    }
    placesRef.current = places;
  });
};
