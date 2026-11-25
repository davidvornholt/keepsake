import { type RefObject, useRef } from 'react';
import type { Engine } from './engine.ts';

// The frame the keyboard is on, for those who don't see the table: a button
// nobody sees, which says the frame in words and takes the keys.

type Props = {
  readonly label: string;
  readonly cursorRef: RefObject<HTMLButtonElement | null>;
  readonly engineRef: RefObject<Engine | null>;
  readonly onOpen: (id: string) => void;
  /** Lays the pile of a photo out or puts it together; says whether it has one. */
  readonly onPile: (front: string) => boolean;
  /** Called when the keyboard comes to the table. */
  readonly onCursor: () => void;
};

export const Cursor = (props: Props) => {
  const spaceTakenRef = useRef(false);
  const pointed = () => props.engineRef.current?.state.cursor ?? null;
  return (
    <button
      aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown Enter Space"
      className="sr-only"
      onBlur={() => {
        const engine = props.engineRef.current;
        if (engine !== null) {
          engine.state.isCursorShown = false;
          engine.request();
        }
      }}
      onClick={() => {
        const id = pointed();
        if (id !== null) {
          props.onOpen(id);
        }
      }}
      onFocus={(event) => {
        if (event.target.matches(':focus-visible')) {
          props.onCursor();
        }
      }}
      // Space would press the button, which shows the photo large. On a
      // frame with photos behind it, it lays them out instead.
      onKeyDown={(event) => {
        const id = pointed();
        if (event.key === ' ' && id !== null && props.onPile(id)) {
          event.preventDefault();
          spaceTakenRef.current = true;
        }
      }}
      onKeyUp={(event) => {
        if (event.key === ' ' && spaceTakenRef.current) {
          event.preventDefault();
          spaceTakenRef.current = false;
        }
      }}
      ref={props.cursorRef}
      type="button"
    >
      {props.label}
    </button>
  );
};
