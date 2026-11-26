import { useEffect, useState } from 'react';
import type { Box, MarkKind, PhotoView, Picture } from '../../contract.ts';
import { useShootContext } from '../app/shoot-context.ts';
import { favoriteHint } from '../app/use-table.ts';
import { wantedOf } from '../data/changes.ts';
import { isFavorite, markedIn, type Pile } from '../data/derive.ts';
import type { Unsaved } from '../data/store-state.ts';
import { actionFor, kindOfKey, offeredFor, writingFor } from '../marks/act.ts';
import type { Keys } from '../ui/keys.ts';
import type { Version } from './compare.tsx';
import type { Draft } from './composer.tsx';
import type { Entry } from './control.ts';
import { wasAskedToCompose } from './intent.ts';
import type { FrameOnTable } from './stage.tsx';
import { usePrepared } from './use-picture.ts';

// What the owner does with a photo that is looked at: which picture of it
// is shown, the change being written, the marks, and the keys for it all.

export type Around = {
  /** The photos gone through, and where this one is among them. */
  readonly order: ReadonlyArray<PhotoView>;
  readonly at: number;
  /** Where that is, in words: "12 of 168". */
  readonly place: string;
  /** The photos that show the same as this one, itself too. */
  readonly pile: Pile;
  readonly size: { readonly width: number; readonly height: number };
  readonly isInfoShown: boolean;
  /** True while the photo goes back to the table, which has the keys again. */
  readonly isLeaving: boolean;
  readonly from: FrameOnTable | null;
  /** How it comes in when the page was turned to it. */
  readonly entry: Entry | null;
  /** Goes to a neighbour. Says whether there is one. */
  readonly onTurn: (direction: -1 | 1, entry?: Entry) => boolean;
  readonly onJump: (to: 'first' | 'last') => void;
  /** Shows another photo of the pile, in place. */
  readonly onShow: (photo: string) => void;
  /** Called every frame with how far the photo is off to the side. */
  readonly onOffset: (offset: number) => void;
  /** Whether the photo before this one is still making way. */
  readonly isPassing: () => boolean;
  readonly onClose: () => void;
  readonly onPull: (share: number) => void;
  readonly onInfo: (isShown: boolean) => void;
  /** Called when the owner has looked at what an agent answered. */
  readonly onSeen: () => void;
};

const longAgo = Number.NEGATIVE_INFINITY;
const nearby = 3;
/** How many photos of a pile are had ready small, around the one shown. */
const pileNearby = 12;

const bestOf = ({ edit, picture }: PhotoView): Picture =>
  edit?.picture ?? picture;

/** The photo of the pile that lies so many steps from the one shown. */
export const stepInPile = (
  { photos }: Pile,
  shown: string,
  step: -1 | 1,
): PhotoView | null => {
  const at = photos.findIndex(({ id }) => id === shown);
  return at < 0 ? null : (photos[at + step] ?? null);
};

/** Has the photos beside this one ready, so that turning the page is instant. */
export const useNeighbours = (
  { order, at, size, pile }: Around,
  shown: string,
): void => {
  const inPile = pile.photos.findIndex(({ id }) => id === shown);
  const next = [
    order[at + 1],
    order[at - 1],
    pile.photos[inPile + 1],
    pile.photos[inPile - 1],
    pile.front,
  ].filter((one) => one !== undefined);
  const further = [
    ...order.slice(Math.max(0, at - nearby), at + nearby + 1),
    ...pile.photos.slice(
      Math.max(0, inPile - pileNearby),
      inPile + pileNearby + 1,
    ),
  ];
  usePrepared(next.map(bestOf), size.width * globalThis.devicePixelRatio);
  usePrepared(further.map(bestOf), 1);
};

type Boxes = Draft['boxes'];
/** How many steps of drawing can be undone. */
const remembered = 40;

const draftOf = ({ note, boxes }: Unsaved): Draft => ({
  note,
  boxes: boxes.map((box) => ({ box, since: longAgo })),
});

/** The change that is being written, and what the owner does with it. */
export const useComposing = (photo: PhotoView) => {
  const { index, state, store } = useShootContext();
  const writing = writingFor(index, photo);
  const saved = writing?.mark ?? null;
  const unsaved = state.unsaved[photo.id] ?? null;
  /** What is written when the change is begun: what wasn't saved, if any. */
  const fresh = (): Draft =>
    unsaved === null
      ? {
          note: saved?.note ?? '',
          boxes: (saved?.boxes ?? []).map((box) => ({ box, since: longAgo })),
        }
      : draftOf(unsaved);
  const [draft, setDraft] = useState<Draft | null>(() =>
    wasAskedToCompose(photo.id) || unsaved !== null ? fresh() : null,
  );
  // What was written comes back when keepsake didn't get it, also after
  // another photo was shown meanwhile. It stays until it is saved again or
  // let go of.
  const isClosed = draft === null;
  useEffect(() => {
    if (unsaved !== null && isClosed) {
      setDraft(draftOf(unsaved));
    }
  }, [unsaved, isClosed]);
  /** The boxes as they were before each thing done to them. */
  const [past, setPast] = useState<ReadonlyArray<Boxes>>([]);
  const [selected, setSelected] = useState<number | null>(null);

  /** Notes the boxes as they are, so that what comes next can be undone. */
  const record = () => {
    if (draft !== null) {
      setPast((before) => [...before, draft.boxes].slice(-remembered));
    }
  };
  const withBoxes = (change: (boxes: Boxes) => Boxes) =>
    setDraft((now) =>
      now === null ? now : { ...now, boxes: change(now.boxes) },
    );
  /** Closes the change, which lets go of what wasn't saved of it. */
  const end = () => {
    if (unsaved !== null) {
      store.forgetUnsaved(photo.id);
    }
    setDraft(null);
    setPast([]);
    setSelected(null);
  };

  return {
    draft,
    setDraft,
    /** Whether it is a wish for a photo that comes in, which can't show where. */
    isWish: writing?.into === 'wish',
    /** Whether boxes are drawn on the photo, which only a change has. */
    canDraw: draft !== null && writing?.into !== 'wish',
    isSaved: (saved?.note ?? '') !== '',
    selected,
    select: setSelected,
    canUndo: past.length > 0,
    record,
    begin: () => setDraft(fresh()),
    cancel: end,
    addBox: (box: Box) => {
      record();
      setSelected(draft?.boxes.length ?? null);
      // Drawn by the owner's own hand, so it is there as it was drawn.
      withBoxes((boxes) => [...boxes, { box, since: longAgo }]);
    },
    /** Moves or resizes a box. What it was is noted with `record` before. */
    setBox: (at: number, box: Box) =>
      withBoxes((boxes) =>
        boxes.map((one, place) => (place === at ? { ...one, box } : one)),
      ),
    removeBox: (at: number) => {
      record();
      setSelected(null);
      withBoxes((boxes) => boxes.filter((_, place) => place !== at));
    },
    undoBox: () => {
      const before = past.at(-1);
      if (before !== undefined) {
        setPast(past.slice(0, -1));
        setSelected(null);
        withBoxes(() => before);
      }
    },
    save: () => {
      if (draft === null) {
        return;
      }
      const note = draft.note.trim();
      if (writing?.into === 'wish') {
        store.make({ ...wantedOf(writing.mark), note });
      } else if (writing?.into === 'change') {
        store.make({
          photo: photo.id,
          kind: 'change',
          note,
          boxes: draft.boxes.map(({ box }) => box),
          other: null,
        });
      }
      end();
    },
    remove: () => {
      if (writing?.into === 'wish') {
        // The photo still comes in, without the wish.
        store.make({ ...wantedOf(writing.mark), note: '' });
      } else if (saved !== null) {
        store.takeBack(saved).catch(() => undefined);
      }
      end();
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
    /** Sets or takes away the favorite heart, where there is an album to have it in. */
    favorite: () => {
      if (photo.standing.kind === 'album') {
        store.favorite(photo.id, !isFavorite(photo)).catch(() => undefined);
      } else {
        store.hint(favoriteHint);
      }
    },
    onKind: (kind: MarkKind) => {
      const action = actionFor(index, photo, kind);
      if (action === null) {
        store.hint(offeredFor(index, photo));
      } else if (action.does === 'compose') {
        doing.shown.now();
        doing.composing.begin();
      } else if (action.does === 'take-back') {
        store.takeBack(action.mark).catch(() => undefined);
      } else {
        store.make(action.wanted);
        lookedAt();
      }
    },
  };
};

export type Marking = ReturnType<typeof useMarking>;

const markKeys = 'cxps';

/** What every key does while a photo is looked at. */
export const keysOf = (
  around: Around,
  doing: {
    readonly photo: PhotoView;
    readonly shown: Showing | null;
    readonly marking: Marking;
    readonly hasAnswer: boolean;
    readonly onLabel: () => void;
    readonly onZoom: () => void;
  },
): Keys => {
  const { shown, marking, photo } = doing;
  const marks: Keys = [...markKeys].map((key) => {
    const kind = kindOfKey(key);
    return [key, kind === null ? undefined : () => marking.onKind(kind)];
  });
  const inPile = (step: -1 | 1) => () => {
    const next = stepInPile(around.pile, photo.id, step);
    if (next !== null) {
      around.onShow(next.id);
    }
  };
  return [
    ...marks,
    ['f', marking.favorite],
    ['ArrowLeft', () => around.onTurn(-1)],
    ['ArrowRight', () => around.onTurn(1)],
    ['ArrowUp', inPile(-1)],
    ['ArrowDown', inPile(1)],
    ['Home', () => around.onJump('first')],
    ['End', () => around.onJump('last')],
    ['Escape', around.onClose],
    ['b', shown?.toggleCamera],
    ['v', shown?.stepBack],
    ['w', shown?.toggleWipe],
    ['z', doing.onZoom],
    ['i', () => around.onInfo(!around.isInfoShown)],
    ['l', doing.onLabel],
    ['t', doing.onLabel],
    ['u', marking.undo],
    ['ctrl+z', marking.undo],
    ['Enter', doing.hasAnswer ? marking.seen : undefined],
  ];
};
