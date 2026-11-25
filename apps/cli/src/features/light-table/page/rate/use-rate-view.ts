import { type RefObject, useEffect, useMemo, useRef, useState } from 'react';
import type { PhotoView } from '../../contract.ts';
import { useShootContext } from '../app/shoot-context.ts';
import { seedOf } from '../marks/glyphs.ts';
import type { Ink } from '../photo/ink.ts';
import type { StageHandle } from '../photo/stage.tsx';
import { usePrepared } from '../photo/use-picture.ts';
import type { Rect } from '../sheet/layout.ts';
import type { Keys } from '../ui/keys.ts';
import { useSince } from '../ui/use-since.ts';
import { stepIn, tilesFor } from './grid.ts';
import { starNames } from './rating.ts';
import type { RatingFlow } from './use-rating.ts';

// What is seen while rating: the photos of the moment and where they lie,
// the one that is shown large, and what the keys do.

const gap = 10;
/** The strip below each photo, for keeping it too. */
const strip = 40;
const pad = 12;
const longAgo = Number.NEGATIVE_INFINITY;

type Size = { readonly width: number; readonly height: number };

const shapeOf = ({ picture }: PhotoView): number =>
  picture.width / picture.height;

/** The photos of the moment as the camera took them, without what was made of them. */
const usePhotos = (flow: RatingFlow) => {
  const { index } = useShootContext();
  const ids = flow.question?.photos;
  const photos = useMemo(
    () =>
      (ids ?? []).flatMap((id): ReadonlyArray<PhotoView> => {
        const photo = index.byId.get(id);
        return photo === undefined ? [] : [{ ...photo, edit: null }];
      }),
    [ids, index],
  );
  const next = flow.questions[flow.step.at + 1]?.photos ?? [];
  // The next moment's photos are held, so that they appear at once.
  usePrepared(
    next.flatMap((id) => index.byId.get(id)?.picture ?? []),
    globalThis.innerWidth / 2,
  );
  return photos;
};

/** The tick on a photo that is kept too, drawn when it is made. */
const useKeptInk = (photo: PhotoView | undefined, isKept: boolean) => {
  const since = useSince(isKept ? (photo?.id ?? null) : null);
  return useMemo(
    (): Omit<Ink, 'draft'> => ({
      stamps:
        isKept && photo !== undefined
          ? [
              {
                shape: 'tick',
                seed: seedOf(`${photo.id}:keep-too`),
                wax: 'wax-white',
                since: since ?? longAgo,
              },
            ]
          : [],
      boxes: [],
      nextBox: 1,
      printed: null,
    }),
    [isKept, photo, since],
  );
};

/** The photo shown large goes back to its place among the others. */
const useCompareAgain = (
  flow: RatingFlow,
  places: ReadonlyArray<Rect>,
  wanted: {
    readonly stageRef: RefObject<StageHandle | null>;
    readonly setFocused: (index: number) => void;
  },
) => {
  const [isLeaving, setIsLeaving] = useState(false);
  return {
    isLeaving,
    compareAgain: () => {
      const at = flow.step.shown;
      const to = at === null ? undefined : places[at];
      if (at === null || to === undefined || places.length < 2 || isLeaving) {
        return;
      }
      const arrived = () => {
        setIsLeaving(false);
        flow.compare();
        wanted.setFocused(at);
      };
      setIsLeaving(true);
      const stage = wanted.stageRef.current;
      if (stage === null) {
        arrived();
      } else {
        stage.leave(() => ({ rect: to, shows: 'camera' }), arrived);
      }
    },
  };
};

export const useRateView = (flow: RatingFlow, size: Size) => {
  const { step, question } = flow;
  const photos = usePhotos(flow);
  const stageRef = useRef<StageHandle | null>(null);
  const questionRef = useRef<HTMLHeadingElement | null>(null);
  const [focused, setFocused] = useState<number | null>(null);
  const tiles = useMemo(
    () => tilesFor(photos.map(shapeOf), size, { gap, strip, pad }),
    [photos, size],
  );
  const room = useMemo(
    (): Rect => ({
      x: pad,
      y: 0,
      w: Math.max(1, size.width - pad * 2),
      h: Math.max(1, size.height - pad),
    }),
    [size],
  );
  const shown = step.shown === null ? undefined : photos[step.shown];
  const isKept = shown !== undefined && step.kept.has(shown.id);
  const ink = useKeptInk(shown, isKept);
  const leaving = useCompareAgain(flow, tiles.photos, { stageRef, setFocused });
  const isComparing = step.shown === null;
  const moment = question?.moment;

  const [asked, setAsked] = useState(moment);
  if (asked !== moment) {
    setAsked(moment);
    setFocused(null);
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: the question gets the focus whenever another one is asked, unless the keyboard comes back to a photo
  useEffect(() => {
    if (!isComparing || focused === null) {
      questionRef.current?.focus({ preventScroll: true });
    }
  }, [moment, isComparing]);

  return {
    photos,
    tiles,
    room,
    shown,
    isKept,
    ink,
    focused,
    setFocused,
    stageRef,
    questionRef,
    isComparing,
    ...leaving,
    /** The place among the others that the photo shown comes from. */
    from: step.shown === null ? undefined : tiles.photos[step.shown],
  };
};

export type RateView = ReturnType<typeof useRateView>;

/** What the keys do, depending on whether one photo is shown or several. */
export const keysOf = (
  flow: RatingFlow,
  view: RateView,
  onClose: () => void,
): Keys => {
  const { photos, focused } = view;
  const { step } = flow;
  if (flow.question === undefined) {
    return [
      ['Backspace', flow.back],
      ['Escape', onClose],
      ['Enter', onClose],
    ];
  }
  const always: Keys = [
    ['Backspace', flow.back],
    ...starNames.map(
      (_, stars) => [String(stars), () => flow.rate(stars)] as const,
    ),
  ];
  const move = (right: number, down: number) => () =>
    view.setFocused(
      stepIn(photos.length, view.tiles.columns, focused, { right, down }),
    );
  const keep = (at: number | null) => () => {
    const photo = at === null ? undefined : photos[at];
    if (photo !== undefined && photos.length > 1) {
      flow.toggleKept(photo.id);
    }
  };
  return step.shown === null
    ? [
        ...always,
        ['ArrowLeft', move(-1, 0)],
        ['ArrowRight', move(1, 0)],
        ['ArrowUp', move(0, -1)],
        ['ArrowDown', move(0, 1)],
        ['k', keep(focused)],
        ['Escape', onClose],
      ]
    : [
        ...always,
        ['ArrowLeft', () => flow.turn(-1)],
        ['ArrowRight', () => flow.turn(1)],
        ['Escape', photos.length > 1 ? view.compareAgain : onClose],
        ['k', keep(step.shown)],
        ['z', () => view.stageRef.current?.toggleZoom()],
      ];
};
