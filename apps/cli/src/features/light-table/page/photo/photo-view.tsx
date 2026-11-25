import {
  type RefObject,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from 'react';
import type { PhotoView as Photo } from '../../contract.ts';
import { useShootContext } from '../app/shoot-context.ts';
import { reveal } from '../sheet/arrange.ts';
import type { Engine } from '../sheet/engine.ts';
import { onScreen, restingOnScreen } from '../sheet/table.ts';
import { useTitle } from '../ui/use-title.ts';
import { useWindowSize } from '../ui/use-window.ts';
import { Body } from './body.tsx';
import { isWide } from './room.ts';
import type { FrameOnTable, StageHandle } from './stage.tsx';

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

/** The frame of a photo on the table, as it is seen right now. */
const frameOf = (
  engine: Engine | null,
  photo: Photo,
  showsEdits: boolean,
  isResting: boolean,
): FrameOnTable | null => {
  if (engine === null) {
    return null;
  }
  const { table } = engine;
  const rect = isResting
    ? restingOnScreen(table, photo.id)
    : onScreen(table, photo.id);
  const isInSight =
    rect !== null && rect.y + rect.h > 0 && rect.y < table.size.height;
  return rect !== null && isInSight
    ? { rect, shows: showsEdits && photo.edit !== null ? 'edit' : 'camera' }
    : null;
};

/** Dims the table for as long as a photo is looked at, and hides its frame. */
const useTable = (engineRef: RefObject<Engine | null>, photo: string) => {
  const firstRef = useRef(photo);
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
    if (engine === null) {
      return;
    }
    engine.state.hidden = photo;
    engine.state.cursor = photo;
    if (firstRef.current !== photo) {
      // The table follows behind, so the photo goes back to where it is.
      reveal(engine.table, photo, true);
    }
    engine.request();
  }, [engineRef, photo]);
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
  const stageRef = useRef<StageHandle | null>(null);
  const sideRef = useRef<-1 | 0 | 1>(0);
  const [first] = useState(photo.id);
  const showsEdits = filters.show === 'album';
  const [from] = useState(() =>
    frameOf(engineRef.current, photo, showsEdits, false),
  );
  const [isShown, setIsShown] = useState(false);
  const info = useInfo(isWide(size));
  const at = order.findIndex(({ id }) => id === photo.id);
  const number = index.numberOf.get(photo.id) ?? 0;
  useTable(engineRef, photo.id);
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

  const leave = useEffectEvent(() => {
    const engine = engineRef.current;
    if (engine !== null) {
      engine.table.lights.target = 1;
      engine.request();
    }
    const to = frameOf(engine, photo, showsEdits, true);
    const stage = stageRef.current;
    if (stage === null) {
      onGone();
    } else {
      stage.leave(to, onGone);
    }
  });

  useEffect(() => {
    if (isLeaving) {
      leave();
    }
  }, [isLeaving]);

  const turn = (direction: -1 | 1): boolean => {
    const next = order[at + direction];
    // A photo on its way back to the table stays the one that was left.
    if (isLeaving || at < 0 || next === undefined) {
      return false;
    }
    sideRef.current = direction;
    onTurn(next.id);
    return true;
  };

  const pull = (share: number) => {
    const view = viewRef.current;
    const engine = engineRef.current;
    if (view !== null) {
      view.dataset.pulled = String(share > pulledFrom);
    }
    if (engine !== null) {
      engine.table.lights.target = Math.min(1, share) * pulledLights;
      engine.request();
    }
  };

  return (
    <section
      aria-label={`Photo ${number}`}
      className="absolute inset-0 z-30 outline-none"
      data-view=""
      data-info={info.isShown}
      data-shown={isShown && !isLeaving}
      data-wide={isWide(size)}
      ref={viewRef}
      tabIndex={-1}
    >
      <Body
        around={{
          order,
          at,
          size,
          isInfoShown: info.isShown,
          isLeaving,
          from: photo.id === first ? from : null,
          side: photo.id === first ? 0 : sideRef.current,
          stageRef,
          onTurn: turn,
          onJump: (to) => {
            const target = to === 'first' ? order[0] : order.at(-1);
            if (!isLeaving && target !== undefined && target.id !== photo.id) {
              sideRef.current = to === 'first' ? -1 : 1;
              onTurn(target.id);
            }
          },
          onClose,
          onPull: pull,
          onInfo: info.set,
          // What was looked at makes way for the next answer.
          onSeen: () => {
            if (isPile && !turn(1)) {
              onClose();
            }
          },
          place: `${isPile ? 'Answer ' : ''}${at + 1} of ${order.length}`,
        }}
        key={photo.id}
        photo={photo}
      />
    </section>
  );
};
