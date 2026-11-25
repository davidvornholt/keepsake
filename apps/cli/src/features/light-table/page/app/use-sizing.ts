import { type RefObject, useRef } from 'react';
import type { Engine } from '../sheet/engine.ts';
import { keepZoom } from '../sheet/sizes.ts';
import {
  zoomBy,
  zoomKept,
  zoomLetGo,
  zoomShare,
  zoomToShare,
} from '../sheet/steer.ts';
import { topOf } from '../sheet/table.ts';
import { zoomSteps } from '../sheet/zoom.ts';
import type { Show } from './route.ts';

// How large the frames on the table are, as the keys and the slider in the
// bar have it. Each view of the table keeps its own size.

export const useSizing = (engineRef: RefObject<Engine | null>, show: Show) => {
  const rangeRef = useRef<HTMLInputElement | null>(null);

  /** The view opens at the size the owner gave it, the next time too. */
  const remember = () => {
    const engine = engineRef.current;
    if (engine !== null) {
      keepZoom(show, zoomKept(engine));
    }
  };

  return {
    rangeRef,
    remember,
    /** One size larger or smaller, or back to everything at once. */
    zoom: (direction: -1 | 0 | 1) => {
      const engine = engineRef.current;
      if (engine !== null) {
        zoomBy(engine, direction);
        remember();
      }
    },
    /** The slider is held somewhere, from 0 to 1. */
    zoomTo: (share: number) => {
      const engine = engineRef.current;
      if (engine !== null) {
        zoomToShare(engine, share);
      }
    },
    /** The slider was let go: the frames come to rest. */
    zoomLetGo: () => {
      const engine = engineRef.current;
      if (engine !== null) {
        zoomLetGo(engine);
        remember();
      }
    },
    /** Moves the slider to the size the frames have, and the bar out of the way. */
    follow: (bar: HTMLElement | null) => {
      const engine = engineRef.current;
      const range = rangeRef.current;
      if (engine !== null && bar !== null) {
        const { table } = engine;
        const away = topOf(table) - table.size.top;
        bar.style.transform = `translate3d(0, ${away}px, 0)`;
      }
      if (engine !== null && range !== null) {
        const value = String(Math.round(zoomShare(engine) * zoomSteps));
        if (range.value !== value && document.activeElement !== range) {
          range.value = value;
        }
      }
    },
  };
};
