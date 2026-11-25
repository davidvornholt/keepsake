import { useRef, useState } from 'react';
import type { MarkKind } from '../../contract.ts';
import type { Index } from '../data/derive.ts';
import type { ShootStore } from '../data/store.ts';
import { actionFor, kindOfKey, offeredFor } from '../marks/act.ts';
import type { Engine } from '../sheet/engine.ts';
import type { Direction } from '../sheet/find.ts';
import { keepZoom } from '../sheet/sizes.ts';
import {
  moveCursor,
  pointedAt,
  zoomBy,
  zoomShare,
  zoomToShare,
} from '../sheet/steer.ts';
import { topOf } from '../sheet/table.ts';
import { zoomSteps } from '../sheet/zoom.ts';
import type { Keys } from '../ui/keys.ts';
import type { Show } from './route.ts';

// The table as the owner steers it with the keyboard and the bar: where the
// cursor is, how large the frames are, and the marks made right on a frame.

type Wanted = {
  readonly index: Index;
  readonly store: ShootStore;
  /** Which photos lie on the table. Each view keeps its own size. */
  readonly show: Show;
  readonly onOpen: (photo: string, isComposing?: boolean) => void;
};

const markKeys = 'kcxfpsl';

const arrows: ReadonlyArray<readonly [string, Direction]> = [
  ['ArrowLeft', 'left'],
  ['ArrowRight', 'right'],
  ['ArrowUp', 'up'],
  ['ArrowDown', 'down'],
  ['Home', 'first'],
  ['End', 'last'],
];

export const useTable = ({ index, store, show, onOpen }: Wanted) => {
  const engineRef = useRef<Engine | null>(null);
  const rangeRef = useRef<HTMLInputElement | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);

  const move = (direction: Direction) => {
    const engine = engineRef.current;
    if (engine !== null) {
      setCursor(moveCursor(engine, direction));
    }
  };

  const mark = (kind: MarkKind) => {
    const engine = engineRef.current;
    const id = engine === null ? null : pointedAt(engine);
    const photo = id === null ? undefined : index.byId.get(id);
    const action = photo === undefined ? null : actionFor(index, photo, kind);
    if (photo === undefined) {
      return;
    }
    if (action === null) {
      store.hint(offeredFor(index, photo));
      return;
    }
    if (action.does === 'compose') {
      // A change needs words, and the photo large to draw on.
      onOpen(photo.id, true);
    } else if (action.does === 'take-back') {
      store.takeBack(action.mark).catch(() => undefined);
    } else {
      store.make(action.wanted);
    }
  };

  /** The view opens at the size the owner gave it, the next time too. */
  const remember = () => {
    const engine = engineRef.current;
    if (engine !== null) {
      keepZoom(show, engine.table.zoom);
    }
  };

  const zoom = (direction: -1 | 0 | 1) => {
    const engine = engineRef.current;
    if (engine !== null) {
      zoomBy(engine, direction);
      remember();
    }
  };

  const open = () => {
    const engine = engineRef.current;
    const id = engine === null ? null : pointedAt(engine);
    if (id !== null) {
      onOpen(id);
    }
  };

  const undo = () => {
    store.undo().catch(() => undefined);
  };

  const keys: Keys = [
    ...arrows.map(([key, direction]) => [key, () => move(direction)] as const),
    ...[...markKeys].map((key) => {
      const kind = kindOfKey(key);
      return [key, kind === null ? undefined : () => mark(kind)] as const;
    }),
    ['Enter', open],
    ['Space', open],
    ['+', () => zoom(1)],
    ['=', () => zoom(1)],
    ['-', () => zoom(-1)],
    ['0', () => zoom(0)],
    ['u', undo],
    ['ctrl+z', undo],
  ];

  return {
    engineRef,
    rangeRef,
    cursor,
    keys,
    /** Shows where the keyboard is when the table gets the focus. */
    showCursor: () => {
      const engine = engineRef.current;
      if (engine !== null && !engine.state.isCursorShown) {
        setCursor(moveCursor(engine, 'right'));
      }
    },
    zoomTo: (share: number) => {
      const engine = engineRef.current;
      if (engine !== null) {
        zoomToShare(engine, share);
        remember();
      }
    },
    remember,
    zoomBy: zoom,
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
