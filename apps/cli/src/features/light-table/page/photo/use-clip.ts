import { type RefObject, useEffect } from 'react';

/**
 * Cuts away what lies around a part of an element, given as the sides of an
 * inset, so that two photos looked at from close each stay in their half.
 */
export const useClip = (
  ref: RefObject<HTMLElement | null>,
  clip: string | null,
): void => {
  useEffect(() => {
    const element = ref.current;
    if (element !== null) {
      element.style.clipPath = clip === null ? '' : `inset(${clip})`;
    }
  }, [ref, clip]);
};
