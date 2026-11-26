import { useEffect, useRef } from 'react';

// What keepsake answers to a form, for as long as the form is shown. The owner
// may leave it while keepsake works, and then nothing should take them back.

/** Passes on what comes of `sending`, unless `isShown` says it is too late. */
export const whileShown = <Value>(
  sending: Promise<Value>,
  isShown: () => boolean,
  then: {
    readonly onDone: (value: Value) => void;
    readonly onFailed: (error: unknown) => void;
  },
): Promise<void> =>
  sending.then(
    (value) => {
      if (isShown()) {
        then.onDone(value);
      }
    },
    (error: unknown) => {
      if (isShown()) {
        then.onFailed(error);
      }
    },
  );

/** Whether the component is still shown. */
export const useIsShown = (): (() => boolean) => {
  const shownRef = useRef(true);
  useEffect(() => {
    shownRef.current = true;
    return () => {
      shownRef.current = false;
    };
  }, []);
  return () => shownRef.current;
};
