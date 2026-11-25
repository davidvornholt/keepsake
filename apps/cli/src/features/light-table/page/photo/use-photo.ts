import { type RefObject, useEffect, useRef, useState } from 'react';
import type { Box, MarkKind, PhotoView, Picture } from '../../contract.ts';
import { useShootContext } from '../app/shoot-context.ts';
import { markedIn } from '../data/derive.ts';
import { actionFor, kindOfKey, turnsPage } from '../marks/act.ts';
import type { Keys } from '../ui/keys.ts';
import type { Version } from './compare.tsx';
import type { Draft } from './composer.tsx';
import { wasAskedToCompose } from './intent.ts';
import type { FrameOnTable, StageHandle } from './stage.tsx';
import { usePrepared } from './use-picture.ts';

// What the owner does with a photo that is looked at: which picture of it
// is shown, the change being written, the marks, and the keys for it all.

export type Around = {
  /** The photos gone through, and where this one is among them. */
  readonly order: ReadonlyArray<PhotoView>;
  readonly at: number;
  /** Where that is, in words: "12 of 168". */
  readonly place: string;
  readonly size: { readonly width: number; readonly height: number };
  readonly isInfoShown: boolean;
  /** True while the photo goes back to the table, which has the keys again. */
  readonly isLeaving: boolean;
  readonly from: FrameOnTable | null;
  readonly side: -1 | 0 | 1;
  readonly stageRef: RefObject<StageHandle | null>;
  /** Goes to a neighbour. Says whether there is one. */
  readonly onTurn: (direction: -1 | 1) => boolean;
  readonly onJump: (to: 'first' | 'last') => void;
  readonly onClose: () => void;
  readonly onPull: (share: number) => void;
  readonly onInfo: (isShown: boolean) => void;
  /** Called when the owner has looked at what an agent answered. */
  readonly onSeen: () => void;
};

/** How long a mark is looked at before the page turns, in milliseconds. */
const turnAfter = 300;
const longAgo = Number.NEGATIVE_INFINITY;
const nearby = 3;

const bestOf = ({ edit, picture }: PhotoView): Picture =>
  edit?.picture ?? picture;

/** Has the photos beside this one ready, so that turning the page is instant. */
export const useNeighbours = ({ order, at, size }: Around): void => {
  const next = [order[at + 1], order[at - 1]].filter(
    (one) => one !== undefined,
  );
  const further = order
    .slice(Math.max(0, at - nearby), at + nearby + 1)
    .map(bestOf);
  usePrepared(next.map(bestOf), size.width * globalThis.devicePixelRatio);
  usePrepared(further, 1);
};

/** The change that is being written, and what the owner does with it. */
export const useComposing = (photo: PhotoView) => {
  const { index, store } = useShootContext();
  const { open } = markedIn(index, photo.id);
  const saved = open?.kind === 'change' ? open : null;
  const fresh = (): Draft => ({
    note: saved?.note ?? '',
    boxes: (saved?.boxes ?? []).map((box) => ({ box, since: longAgo })),
  });
  const [draft, setDraft] = useState<Draft | null>(() =>
    wasAskedToCompose(photo.id) ? fresh() : null,
  );
  return {
    draft,
    setDraft,
    isSaved: saved !== null,
    begin: () => setDraft(fresh()),
    cancel: () => setDraft(null),
    addBox: (box: Box) =>
      setDraft((now) =>
        now === null
          ? now
          : // Drawn by the owner's own hand, so it is there as it was drawn.
            { ...now, boxes: [...now.boxes, { box, since: longAgo }] },
      ),
    save: () => {
      if (draft !== null) {
        store.make({
          photo: photo.id,
          kind: 'change',
          note: draft.note.trim(),
          boxes: draft.boxes.map(({ box }) => box),
          other: null,
        });
        setDraft(null);
      }
    },
    remove: () => {
      if (saved !== null) {
        store.takeBack(saved).catch(() => undefined);
      }
      setDraft(null);
    },
  };
};

export type Composing = ReturnType<typeof useComposing>;

/** Which picture of the photo is shown. */
export const useVersion = (photo: PhotoView) => {
  const [version, setVersion] = useState<Version>(0);
  const [isWiping, setIsWiping] = useState(false);
  const earlier = photo.edit?.earlier.length ?? 0;
  return {
    version,
    isWiping,
    setVersion,
    setIsWiping,
    now: () => {
      setVersion(0);
      setIsWiping(false);
    },
    toggleWipe: () => setIsWiping((isOn) => !isOn),
    toggleCamera: () => {
      setIsWiping(false);
      setVersion((shown) => (shown === 'camera' ? 0 : 'camera'));
    },
    /** Goes through the earlier finished photos, and back to the one of now. */
    stepBack: () => {
      setIsWiping(false);
      setVersion((shown) => {
        const from = shown === 'camera' ? 0 : shown;
        return from < earlier ? from + 1 : 0;
      });
    },
  };
};

export type Showing = ReturnType<typeof useVersion>;

/** Making marks, taking them back, and saying an answer was looked at. */
export const useMarking = (
  photo: PhotoView,
  around: Around,
  doing: { readonly shown: Showing; readonly composing: Composing },
) => {
  const { index, store } = useShootContext();
  const turningRef = useRef(0);
  useEffect(() => () => clearTimeout(turningRef.current), []);

  const lookedAt = () => {
    for (const mark of markedIn(index, photo.id).news) {
      store.seen(mark.id).catch(() => undefined);
    }
  };

  return {
    seen: () => {
      lookedAt();
      around.onSeen();
    },
    undo: () => {
      store.undo().catch(() => undefined);
    },
    onKind: (kind: MarkKind) => {
      const action = actionFor(index, photo, kind);
      if (action?.does === 'compose') {
        doing.shown.now();
        doing.composing.begin();
      } else if (action?.does === 'take-back') {
        store.takeBack(action.mark).catch(() => undefined);
      } else if (action?.does === 'make') {
        store.make(action.wanted);
        lookedAt();
        if (turnsPage(kind)) {
          turningRef.current = Number(
            setTimeout(() => around.onTurn(1), turnAfter),
          );
        }
      }
    },
  };
};

export type Marking = ReturnType<typeof useMarking>;

const markKeys = 'kcxfpsl';

/** What every key does while a photo is looked at. */
export const keysOf = (
  around: Around,
  doing: {
    readonly shown: Showing | null;
    readonly marking: Marking;
    readonly hasAnswer: boolean;
    readonly onLabel: () => void;
  },
): Keys => {
  const { shown, marking } = doing;
  const marks: Keys = [...markKeys].map((key) => {
    const kind = kindOfKey(key);
    return [key, kind === null ? undefined : () => marking.onKind(kind)];
  });
  return [
    ...marks,
    ['ArrowLeft', () => around.onTurn(-1)],
    ['ArrowRight', () => around.onTurn(1)],
    ['Home', () => around.onJump('first')],
    ['End', () => around.onJump('last')],
    ['Escape', around.onClose],
    ['b', shown?.toggleCamera],
    ['v', shown?.stepBack],
    ['w', shown?.toggleWipe],
    ['z', () => around.stageRef.current?.toggleZoom()],
    ['i', () => around.onInfo(!around.isInfoShown)],
    ['t', doing.onLabel],
    ['u', marking.undo],
    ['ctrl+z', marking.undo],
    ['Enter', doing.hasAnswer ? marking.seen : undefined],
  ];
};
