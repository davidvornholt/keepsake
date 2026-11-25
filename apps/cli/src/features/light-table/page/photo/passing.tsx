import { type RefObject, useImperativeHandle, useRef, useState } from 'react';
import { Img, Placed } from '../ui/placed.tsx';
import type { Still } from './stage.tsx';

// The photo that makes way when the page is turned. It stays as it was seen
// and leaves to the side, exactly as far as the next one has come in, so
// that the two move like one strip of film.

export type PassingHandle = {
  /** Shows what makes way. `start` is how far off the next photo starts. */
  readonly show: (stills: ReadonlyArray<Still>, start: number) => void;
  /** Moves it with the photo that comes in, which is so far off now. */
  readonly follow: (offset: number) => void;
  readonly clear: () => void;
  readonly isShown: () => boolean;
};

/** Closer than this, in pixels, the next photo has arrived. */
const arrived = 0.5;

export const Passing = ({
  handleRef,
}: {
  readonly handleRef: RefObject<PassingHandle | null>;
}) => {
  const elementRef = useRef<HTMLDivElement>(null);
  const startRef = useRef(0);
  const shownRef = useRef(false);
  const [stills, setStills] = useState<ReadonlyArray<Still>>([]);
  const set = (next: ReadonlyArray<Still>) => {
    shownRef.current = next.length > 0;
    setStills(next);
  };

  useImperativeHandle(handleRef, () => ({
    show: (next, start) => {
      startRef.current = start;
      if (elementRef.current !== null) {
        elementRef.current.style.transform = '';
      }
      set(next);
    },
    follow: (offset) => {
      const element = elementRef.current;
      if (element === null || !shownRef.current) {
        return;
      }
      // It is gone once the next one is there, or has swung past where it rests.
      if (Math.abs(offset) < arrived || offset * startRef.current < 0) {
        set([]);
      } else {
        element.style.transform = `translate3d(${offset - startRef.current}px, 0, 0)`;
      }
    },
    clear: () => set([]),
    isShown: () => shownRef.current,
  }));

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden will-change-transform"
      ref={elementRef}
    >
      {stills.map(({ src, rect }) => (
        <Placed key={src} rect={rect}>
          <Img className="size-full" isUrgent={true} src={src} />
        </Placed>
      ))}
    </div>
  );
};
