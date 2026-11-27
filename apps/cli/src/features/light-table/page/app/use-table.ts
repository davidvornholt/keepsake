import { type RefObject, useRef, useState } from 'react';
import { type Index, isFavorite, pileAround } from '../data/derive.ts';
import type { ShootStore } from '../data/store.ts';
import { actionFor, offeredFor, pencilOfKey, undoOf } from '../marks/act.ts';
import type { Pencil } from '../marks/kinds.ts';
import type { Engine } from '../sheet/engine.ts';
import type { Direction } from '../sheet/find.ts';
import { moveCursor, pointedAt } from '../sheet/steer.ts';
import type { Keys } from '../ui/keys.ts';
import type { Show } from './route.ts';
import { useSizing } from './use-sizing.ts';

// The table as the owner steers it with the keyboard and the bar: where the
// cursor is, how large the frames are, and the marks made right on a frame.

type Wanted = {
  readonly index: Index;
  readonly store: ShootStore;
  /** Which photos lie on the table. Each view keeps its own size. */
  readonly show: Show;
  readonly onOpen: (photo: string, isComposing?: boolean) => void;
};

const markKeys = 'cxps';

/** Said when the heart is asked for where it can't be set. */
export const favoriteHint =
  'The heart marks a favorite in Immich, so it is for photos in the album.';

const arrows: ReadonlyArray<readonly [string, Direction]> = [
  ['ArrowLeft', 'left'],
  ['ArrowRight', 'right'],
  ['ArrowUp', 'up'],
  ['ArrowDown', 'down'],
  ['Home', 'first'],
  ['End', 'last'],
];

/** The pile that lies open on the table, by the photo in front of it. */
const usePiles = (
  index: Index,
  engineRef: RefObject<Engine | null>,
  onCursor: (id: string) => void,
) => {
  const [opened, setOpened] = useState<string | null>(null);
  const isOpenStill =
    opened !== null && (index.pileOf.get(opened)?.front.id ?? null) === opened;
  /** Puts the open pile together. The keyboard stays on what is left of it. */
  const close = () => {
    const engine = engineRef.current;
    const at = engine?.state.cursor ?? null;
    const isInIt =
      at !== null &&
      opened !== null &&
      index.pileOf.get(at)?.front.id === opened;
    if (engine !== null && isInIt) {
      engine.state.cursor = opened;
      onCursor(opened);
    }
    setOpened(null);
  };
  return {
    opened: isOpenStill ? opened : null,
    close,
    /** Lays the pile of a photo out on the table, or puts it together again. */
    toggle: (id: string): boolean => {
      const photo = index.byId.get(id);
      const pile = photo === undefined ? null : pileAround(index, photo);
      if (pile === null || pile.photos.length < 2) {
        return false;
      }
      if (opened === pile.front.id) {
        close();
      } else {
        setOpened(pile.front.id);
      }
      return true;
    },
  };
};

export const useTable = ({ index, store, show, onOpen }: Wanted) => {
  const engineRef = useRef<Engine | null>(null);
  const sizing = useSizing(engineRef, show);
  const [cursor, setCursor] = useState<string | null>(null);
  const piles = usePiles(index, engineRef, setCursor);

  const pointed = () => {
    const engine = engineRef.current;
    const id = engine === null ? null : pointedAt(engine);
    return id === null ? undefined : index.byId.get(id);
  };

  /** Sets or takes away the favorite heart of the photo the pointer is on. */
  const favorite = () => {
    const photo = pointed();
    if (photo === undefined) {
      return;
    }
    if (photo.standing.kind === 'album') {
      store.favorite(photo.id, !isFavorite(photo)).catch(() => undefined);
    } else {
      store.hint(favoriteHint);
    }
  };

  const move = (direction: Direction) => {
    const engine = engineRef.current;
    if (engine !== null) {
      setCursor(moveCursor(engine, direction));
    }
  };

  const mark = (pencil: Pencil) => {
    const photo = pointed();
    const action = photo === undefined ? null : actionFor(index, photo, pencil);
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
    } else {
      const back = undoOf(photo, action.wanted, index);
      store.choose(action.wanted, back).catch(() => undefined);
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
      const pencil = pencilOfKey(key);
      return [key, pencil === null ? undefined : () => mark(pencil)] as const;
    }),
    ['Enter', open],
    [
      'Space',
      () => {
        const photo = pointed();
        if (photo === undefined || !piles.toggle(photo.id)) {
          open();
        }
      },
    ],
    ['Escape', piles.opened === null ? undefined : piles.close],
    ['f', favorite],
    ['+', () => sizing.zoom(1)],
    ['=', () => sizing.zoom(1)],
    ['-', () => sizing.zoom(-1)],
    ['0', () => sizing.zoom(0)],
    ['u', undo],
    ['ctrl+z', undo],
  ];

  return {
    engineRef,
    rangeRef: sizing.rangeRef,
    cursor,
    keys,
    opened: piles.opened,
    togglePile: piles.toggle,
    closePile: piles.close,
    /** Shows where the keyboard is when the table gets the focus. */
    showCursor: () => {
      const engine = engineRef.current;
      if (engine !== null && !engine.state.isCursorShown) {
        setCursor(moveCursor(engine, 'right'));
      }
    },
    zoomTo: sizing.zoomTo,
    zoomLetGo: sizing.zoomLetGo,
    remember: sizing.remember,
    zoomBy: sizing.zoom,
    follow: sizing.follow,
  };
};
