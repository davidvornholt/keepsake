import { seedTextOf } from '../marks/kinds.ts';
import { mix } from '../motion/spring.ts';
import { colorOf } from '../ui/theme.ts';
import type { Measure, Rect } from './layout.ts';
import { type Drawn, drawMarks } from './overlay-marks.ts';
import { drawCount, drawCrop, drawPrint, printFont } from './overlay-print.ts';
import { pileIn } from './pile.ts';
import {
  type Content,
  type Frame,
  ghostInSight,
  inSight,
  type Seen,
  type Table,
  topOf,
} from './table.ts';

// What is drawn on the frames: the owner's wax, the agent's blue pencil, the
// crop of the finished photo, and the print along the edge of the film.

export type OverlayState = {
  /** The frame that is shown large right now, and so not here. */
  hidden: string | null;
  cursor: string | null;
  hover: string | null;
  /** The pile whose corner the pointer is on. */
  hoverPile: string | null;
  /** Whether the keyboard is in use, so the cursor is shown. */
  isCursorShown: boolean;
  /** When each mark was made, so that new ones are drawn by hand. */
  readonly madeAt: Map<string, number>;
  hasContent: boolean;
};

export const makeOverlayState = (): OverlayState => ({
  hidden: null,
  cursor: null,
  hover: null,
  hoverPile: null,
  isCursorShown: false,
  madeAt: new Map(),
  hasContent: false,
});

const longAgo = Number.NEGATIVE_INFINITY;

/** The marks on the table that can still be taken back. */
const openMarks = (content: Content): ReadonlySet<string> =>
  new Set(
    content
      .flatMap(({ frames }) => frames)
      .flatMap(({ marks }) =>
        marks
          .filter(({ state }) => state === 'open')
          .map(({ photo, pencil }) => seedTextOf(photo, pencil)),
      ),
  );

/** Remembers which marks are new, so that they are drawn stroke by stroke. */
export const noteMarks = (
  state: OverlayState,
  content: Content,
  now: number,
): void => {
  const present = openMarks(content);
  for (const key of state.madeAt.keys()) {
    if (!present.has(key)) {
      state.madeAt.delete(key);
    }
  }
  for (const key of present) {
    if (!state.madeAt.has(key)) {
      state.madeAt.set(key, state.hasContent ? now : longAgo);
    }
  }
  state.hasContent = state.hasContent || content.length > 0;
};
type Pencil = CanvasRenderingContext2D;

const outline = (pencil: Pencil, rect: Rect, grow: number) => {
  pencil.strokeRect(
    rect.x - grow,
    rect.y - grow,
    rect.w + grow * 2,
    rect.h + grow * 2,
  );
};

const pulseTime = 420;
const pulseLeast = 0.55;
const cursorGrow = 3;
const cursorEdge = 4;

/** The frame under the pointer, the one the keys act on, and those an agent works on. */
const drawOutlines = (
  { pencil, now }: Drawn,
  state: OverlayState,
  frame: Frame,
  rect: Rect,
): boolean => {
  if (frame.isWorkedOn) {
    const before = pencil.globalAlpha;
    pencil.globalAlpha =
      before * mix(pulseLeast, 1, (1 + Math.sin(now / pulseTime)) / 2);
    pencil.lineWidth = 2;
    pencil.strokeStyle = colorOf('--color-pencil-blue');
    outline(pencil, rect, 2);
    pencil.globalAlpha = before;
  }
  if (state.isCursorShown && state.cursor === frame.id) {
    pencil.lineWidth = cursorEdge;
    pencil.strokeStyle = colorOf('--color-sheet');
    outline(pencil, rect, cursorGrow);
    pencil.lineWidth = 2;
    pencil.strokeStyle = colorOf('--color-lamp');
    outline(pencil, rect, 2);
  } else if (state.hover === frame.id) {
    pencil.lineWidth = 1;
    pencil.strokeStyle = colorOf('--color-lamp');
    outline(pencil, rect, 1);
  }
  return frame.isWorkedOn;
};

/** How the frames of one layout are drawn: how clearly, how far apart, and with what on them. */
type Look = {
  readonly alpha: number;
  readonly gap: number;
  readonly measure: Measure;
};

/** How many lie in a pile, on the photo in front of it, where there is room to say so. */
const drawPile = (
  { pencil, scale }: Drawn,
  state: OverlayState,
  { frame, face }: { readonly frame: Frame; readonly face: Rect },
  { hasPiles, hasSigns }: Measure,
) => {
  const isOpen = frame.opened?.isFront === true;
  if ((frame.pile > 1 || isOpen) && hasPiles) {
    drawCount(
      pencil,
      face,
      {
        count: frame.opened?.count ?? frame.pile,
        isOpen,
        isHot: state.hoverPile === frame.id,
        isSmall: !hasSigns,
      },
      scale,
    );
  }
};

/** Draws what lies on one frame. Says whether it still changes. */
const drawFrame = (
  drawn: Drawn,
  state: OverlayState,
  { placed, ...whole }: Seen,
  look: Look,
): boolean => {
  const { pencil } = drawn;
  const { frame } = placed;
  const { measure } = look;
  const { face } = pileIn(whole, frame.pile, measure);
  if (frame.crop !== null && measure.hasSigns) {
    drawCrop(pencil, face, frame.crop);
  }
  const isDrawing = drawMarks(drawn, frame, face);
  drawPile(drawn, state, { frame, face }, measure);
  if (measure.hasEdgePrint && !placed.isLeaving) {
    drawPrint(pencil, frame, whole, look.gap);
  }
  const isPulsing = drawOutlines(drawn, state, frame, whole);
  return isDrawing || isPulsing;
};

/** Draws what lies on the frames of one layout. Says whether it still changes. */
const drawFrames = (
  drawn: Drawn,
  state: OverlayState,
  seen: ReadonlyArray<Seen>,
  look: Look,
): boolean => {
  let isChanging = false;
  for (const one of seen) {
    const alpha = one.placed.alpha.value * look.alpha;
    if (one.placed.frame.id !== state.hidden && alpha > 0) {
      drawn.pencil.globalAlpha = alpha;
      isChanging = drawFrame(drawn, state, one, look) || isChanging;
    }
  }
  return isChanging;
};

/** Draws everything that lies on the frames. Says whether it still changes. */
export const drawOverlay = (
  pencil: Pencil,
  table: Table,
  state: OverlayState,
  { now, scale }: { readonly now: number; readonly scale: number },
): boolean => {
  const { width, height } = table.size;
  const { measure } = table.layout;
  const lights = table.lights.value;
  pencil.setTransform(scale, 0, 0, scale, 0, 0);
  pencil.clearRect(0, 0, width, height);
  pencil.font = printFont;
  pencil.fontStretch = 'condensed';
  pencil.letterSpacing = '0.6px';
  const ceiling = topOf(table) + measure.head;
  const drawn: Drawn = { pencil, madeAt: state.madeAt, now, scale, ceiling };
  const { ghost, view } = table;
  if (ghost !== null) {
    drawFrames(drawn, state, ghostInSight(table), {
      alpha: lights * (1 - table.fade),
      gap: ghost.layout.measure.gap * ghost.view.k,
      measure: ghost.layout.measure,
    });
  }
  const isChanging = drawFrames(drawn, state, inSight(table), {
    alpha: lights * (ghost === null ? 1 : table.fade),
    gap: measure.gap * view.k,
    measure,
  });
  pencil.globalAlpha = 1;
  return isChanging;
};
