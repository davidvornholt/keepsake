import { useEffect, useRef } from 'react';

/** A ref for what the keyboard is on as soon as it is shown. */
export const useFocused = <Focused extends HTMLElement>() => {
  const ref = useRef<Focused>(null);
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, []);
  return ref;
};
