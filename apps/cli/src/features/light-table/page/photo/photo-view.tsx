import {
  type RefObject,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from 'react';
import type { PhotoView as Photo } from '../../contract.ts';
import { useShootContext } from '../app/shoot-context.ts';
import { pileAround } from '../data/derive.ts';
import { reveal } from '../sheet/arrange.ts';
import type { Engine } from '../sheet/engine.ts';
import { onScreen } from '../sheet/table.ts';
import { prefersReducedMotion } from '../ui/theme.ts';
import { useTitle } from '../ui/use-title.ts';
import { useWindowSize } from '../ui/use-window.ts';
import { Body, type BodyHandle } from './body.tsx';
import type { Entry } from './control.ts';
import { Passing, type PassingHandle } from './passing.tsx';
import { isWide } from './room.ts';
import type { FrameOnTable } from './stage.tsx';

// A photo that is looked at. The lights of the table go down, the frame
// rises from its sheet, and goes back to it when the owner is done.

type Props = {
  readonly photo: Photo;
  /** The photos that are gone through with the arrow keys. */
  readonly order: ReadonlyArray<Photo>;
  readonly engineRef: RefObject<Engine | null>;
  /** True once the owner has left, while the photo goes back to its frame. */
  readonly isLeaving: boolean;
  readonly onGone: () => void;
  readonly onTurn: (photo: string) => void;
  readonly onClose: () => void;
  /** Whether the photos are answers of an agent, gone through one by one. */
  readonly isPile: boolean;
};

const remembered = 'keepsake:about-photo';
/** How bright the table gets while a photo is pulled away from it. */
const pulledLights = 0.85;
const pulledFrom = 0.03;
/** A photo that takes the place of another without moving. */
const inPlace: Entry = { x: 0, speed: 0 };

const wasInfoShown = (): boolean => {
  try {
    return localStorage.getItem(remembered) !== 'no';
  } catch {
    return true;
  }
};

const rememberInfo = (isShown: boolean) => {
  try {
    localStorage.setItem(remembered, isShown ? 'yes' : 'no');
  } catch {
    // A browser that keeps nothing forgets this, which is all right.
  }
};

/**
 * The frame of the table that stands for a photo: its own, or the one in
 * front of the pile it lies in.
 */
const frameIdOf = (
  engine: Engine,
  photo: Photo,
  front: string,
): string | null => {
  const { placed } = engine.table;
  if (placed.has(photo.id)) {
    return photo.id;
  }
  return placed.has(front) ? front : null;
};

/** That frame as it is seen right now, if it is in sight. */
const frameOf = (
  engine: Engine | null,
  photo: Photo,
  look: { readonly front: string; readonly showsEdits: boolean },
): FrameOnTable | null => {
  const id = engine === null ? null : frameIdOf(engine, photo, look.front);
  if (engine === null || id === null) {
    return null;
  }
  const { table } = engine;
  const rect = onScreen(table, id);
  const isInSight =
    rect !== null && rect.y + rect.h > 0 && rect.y < table.size.height;
  return rect !== null && isInSight
    ? {
        rect,
        shows: look.showsEdits && photo.edit !== null ? 'edit' : 'camera',
      }
    : null;
};

/** Dims the table for as long as a photo is looked at, and hides its frame. */
const useTable = (
  engineRef: RefObject<Engine | null>,
  photo: Photo,
  front: string,
) => {
  const firstRef = useRef(photo.id);
  useEffect(() => {
    const engine = engineRef.current;
    if (engine === null) {
      return;
    }
    engine.table.lights.target = 0;
    engine.request();
    return () => {
      engine.table.lights.target = 1;
      engine.state.hidden = null;
      engine.request();
    };
  }, [engineRef]);

  useEffect(() => {
    const engine = engineRef.current;
    const id = engine === null ? null : frameIdOf(engine, photo, front);
    if (engine === null || id === null) {
      return;
    }
    engine.state.hidden = id;
    engine.state.cursor = id;
    if (firstRef.current !== photo.id) {
      // The table follows behind, so the photo goes back to where it is.
      reveal(engine.table, id, true);
    }
    engine.request();
  }, [engineRef, photo, front]);
};

/** Whether the notes about a photo are shown: beside it, or over it on a small screen. */
const useInfo = (wide: boolean) => {
  const [isWanted, setIsWanted] = useState(wasInfoShown);
  const [isOpen, setIsOpen] = useState(false);
  return {
    isShown: wide ? isWanted : isOpen,
    set: (isShown: boolean) => {
      if (wide) {
        setIsWanted(isShown);
        rememberInfo(isShown);
      } else {
        setIsOpen(isShown);
      }
    },
  };
};

/** Sends the photo back to its frame of the table once it is left. */
const useLeaving = (
  isLeaving: boolean,
  {
    engineRef,
    passingRef,
    bodyRef,
    onGone,
  }: Pick<Props, 'engineRef' | 'onGone'> & {
    readonly passingRef: RefObject<PassingHandle | null>;
    readonly bodyRef: RefObject<BodyHandle | null>;
  },
  frame: () => ReturnType<typeof frameOf>,
) => {
  const leave = useEffectEvent(() => {
    const engine = engineRef.current;
    if (engine !== null) {
      engine.table.lights.target = 1;
      engine.request();
    }
    passingRef.current?.clear();
    const body = bodyRef.current;
    if (body === null) {
      onGone();
    } else {
      body.leave(frame, onGone);
    }
  });

  useEffect(() => {
    if (isLeaving) {
      leave();
    }
  }, [isLeaving]);
};

/** The photo is pulled down to be put away: the table comes up under it. */
const pull = (
  view: HTMLElement | null,
  engine: Engine | null,
  share: number,
) => {
  if (view !== null) {
    view.dataset.pulled = String(share > pulledFrom);
  }
  if (engine !== null) {
    engine.table.lights.target = Math.min(1, share) * pulledLights;
    engine.request();
  }
};

export const PhotoView = ({
  photo,
  order,
  engineRef,
  isLeaving,
  onGone,
  onTurn,
  onClose,
  isPile,
}: Props) => {
  const { index, filters } = useShootContext();
  const size = useWindowSize();
  const viewRef = useRef<HTMLElement>(null);
  const bodyRef = useRef<BodyHandle | null>(null);
  const passingRef = useRef<PassingHandle | null>(null);
  /** How the photo shown came in, once a page was turned. */
  const entryRef = useRef<Entry | null>(null);
  const showsEdits = filters.show === 'album';
  const pile = pileAround(index, photo);
  const front = pile.front.id;
  const [from] = useState(() =>
    frameOf(engineRef.current, photo, { front, showsEdits }),
  );
  const [isShown, setIsShown] = useState(false);
  const info = useInfo(isWide(size));
  const own = order.findIndex(({ id }) => id === photo.id);
  // A photo from behind another one stands where its pile does.
  const at = own >= 0 ? own : order.findIndex(({ id }) => id === front);
  const number = index.numberOf.get(photo.id) ?? 0;
  useTable(engineRef, photo, front);
  useTitle(`Photo ${number}`, index.shoot.about ?? index.shoot.name);

  useEffect(() => {
    const view = viewRef.current;
    // The words of a change may have the focus already.
    if (view !== null && !view.contains(document.activeElement)) {
      view.focus({ preventScroll: true });
    }
    const shown = requestAnimationFrame(() => setIsShown(true));
    return () => cancelAnimationFrame(shown);
  }, []);

  // Asked for every frame: the table may be scrolled while it flies.
  useLeaving(isLeaving, { engineRef, passingRef, bodyRef, onGone }, () =>
    frameOf(engineRef.current, photo, { front, showsEdits }),
  );

  /** Shows another photo. The one shown makes way as the other comes in. */
  const show = (id: string, entry: Entry) => {
    // A photo on its way back to the table stays the one that was left.
    if (isLeaving || id === photo.id) {
      return;
    }
    const isStill = prefersReducedMotion() || entry.x === 0;
    entryRef.current = isStill ? inPlace : entry;
    passingRef.current?.show(
      isStill ? [] : (bodyRef.current?.stills() ?? []),
      entry.x,
    );
    onTurn(id);
  };

  const turn = (direction: -1 | 1, entry?: Entry): boolean => {
    const next = order[at + direction];
    if (isLeaving || at < 0 || next === undefined) {
      return false;
    }
    const away = direction * size.width;
    show(next.id, { x: away + (entry?.x ?? 0), speed: entry?.speed ?? 0 });
    return true;
  };

  return (
    <section
      aria-label={`Photo ${number}`}
      // On its way back the photo takes nothing: the table has the pointer again.
      className={`absolute inset-0 z-30 outline-none ${isLeaving ? 'pointer-events-none' : ''}`}
      data-info={info.isShown}
      data-leaving={isLeaving}
      data-shown={isShown && !isLeaving}
      data-view=""
      data-wide={isWide(size)}
      ref={viewRef}
      tabIndex={-1}
    >
      <Passing handleRef={passingRef} />
      <Body
        around={{
          order,
          at,
          pile,
          size,
          isInfoShown: info.isShown,
          isLeaving,
          from: entryRef.current === null ? from : null,
          entry: entryRef.current,
          onTurn: turn,
          onJump: (to) => {
            const target = to === 'first' ? order[0] : order.at(-1);
            if (target !== undefined) {
              const side = to === 'first' ? -1 : 1;
              show(target.id, { x: side * size.width, speed: 0 });
            }
          },
          onShow: (id) => show(id, inPlace),
          onOffset: (offset) => passingRef.current?.follow(offset),
          isPassing: () => passingRef.current?.isShown() ?? false,
          onClose,
          onPull: (share) => pull(viewRef.current, engineRef.current, share),
          onInfo: info.set,
          // What was looked at makes way for the next answer.
          onSeen: () => {
            if (isPile && !turn(1)) {
              onClose();
            }
          },
          place: `${isPile ? 'Answer ' : ''}${at + 1} of ${order.length}`,
        }}
        handleRef={bodyRef}
        key={photo.id}
        photo={photo}
      />
    </section>
  );
};
