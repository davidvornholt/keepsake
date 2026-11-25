import { calm, settle } from '../motion/spring.ts';
import { prefersReducedMotion } from '../ui/theme.ts';
import { advance, arrange, settleAll, zoomTo } from './arrange.ts';
import type { Scene } from './draw.ts';
import { drawOverlay, makeOverlayState, noteMarks } from './overlay.ts';
import { keepScene } from './scene.ts';
import type { Zoom } from './sizes.ts';
import {
  type Anchor,
  type Content,
  fitOf,
  inSight,
  makeTable,
  type Size,
  type Table,
} from './table.ts';

// Keeps the table moving: one loop that runs only while something changes,
// and draws the pictures, what is drawn on them, and whatever follows them.

const mostScale = 3;
/** A frame that took longer than this, in seconds, is moved on by this much. */
const longestFrame = 0.05;
const millisecond = 1000;

type Following = {
  /** Called after each frame that was drawn, to move what follows the table. */
  readonly onFrame: (table: Table) => void;
};

/** The time a frame covers. Its own time can lie before the moment it was asked for. */
const secondsSince = (last: number, now: number): number =>
  Math.max(0, Math.min((now - last) / millisecond, longestFrame));

/**
 * Puts the sheet of marks away while the lights are out. Nothing lies on the
 * frames then, and put away it can't show through a photo either.
 */
const shutterOf = (overlay: HTMLCanvasElement) => {
  let wasOut = false;
  return (isOut: boolean) => {
    if (isOut !== wasOut) {
      wasOut = isOut;
      overlay.style.visibility = isOut ? 'hidden' : 'visible';
    }
  };
};

/** Asks for the pictures, the ones in sight first. */
const askFor = ({ loader }: Scene, table: Table) => {
  const seen = inSight(table).map(({ frame }) => frame);
  const all = table.content.flatMap(({ frames }) => frames);
  loader.want(
    [...seen, ...all].map(({ picture }) => ({ key: picture.src, picture })),
  );
};

/** Stands for a frame asked for while none can be drawn. */
const never = -1;

export const makeEngine = (
  canvas: HTMLCanvasElement,
  overlay: HTMLCanvasElement,
  following: Following,
) => {
  const pencil = overlay.getContext('2d');
  const table = makeTable();
  let waiting = 0;
  let last = 0;
  let isFirst = true;
  const putAway = shutterOf(overlay);
  const state = makeOverlayState();

  const request = () => {
    if (waiting === 0) {
      last = performance.now();
      waiting = requestAnimationFrame(tick);
    }
  };

  const pause = () => {
    cancelAnimationFrame(waiting);
    waiting = never;
  };

  const kept = keepScene(canvas, request, {
    lost: pause,
    restored: () => {
      waiting = 0;
      paint();
      wantPictures();
      request();
    },
  });
  if (kept === null || pencil === null) {
    return null;
  }
  const { held } = kept;

  /** Fits the pictures to the size the table has. */
  const paint = () => {
    const { painter, scale } = held.scene;
    painter.resize(table.size.width, table.size.height, scale);
  };

  const wantPictures = () => askFor(held.scene, table);

  const tick = (now: number) => {
    waiting = 0;
    const seconds = secondsSince(last, now);
    last = now;
    const { scene, drawing } = held;
    const isMoving = advance(table, seconds, prefersReducedMotion());
    scene.tiles.moves(isMoving);
    const isBlurring = scene.loader.blurSome(now, seconds);
    const isAppearing = drawing.draw(table, now, state.hidden);
    const isDrawing = drawOverlay(pencil, table, state, {
      now,
      scale: scene.scale,
    });
    following.onFrame(table);
    putAway(table.lights.value <= 0);
    if (!(isMoving || isBlurring || isAppearing || isDrawing)) {
      wantPictures();
    } else if (waiting === 0) {
      // Unless something asked for the next frame while this one was drawn.
      waiting = requestAnimationFrame(tick);
    }
  };

  return {
    table,
    state,
    request,
    setSize: (size: Size) => {
      const scale = Math.min(window.devicePixelRatio, mostScale);
      held.scene.scale = scale;
      overlay.width = Math.round(size.width * scale);
      overlay.height = Math.round(size.height * scale);
      table.size = size;
      paint();
      if (table.zoom === 'fit') {
        table.frame.value = fitOf(table);
        table.frame.target = table.frame.value;
      }
      arrange(table);
      settleAll(table);
      request();
    },
    /**
     * Lays other frames on the table; an anchor keeps its place. `opening`
     * says how large the frames of a view are that opens with them.
     */
    setContent: (
      content: Content,
      anchor: Anchor | null,
      opening: ((table: Table) => Zoom) | null,
    ) => {
      table.content = content;
      noteMarks(state, content, performance.now());
      if (opening !== null) {
        zoomTo(table, opening(table), anchor);
        // The frames of the view before travel to where they lie in this one.
        table.stiffness = calm;
      } else if (table.zoom === 'fit') {
        table.frame.target = fitOf(table);
      }
      if (isFirst || (opening === null && anchor === null)) {
        settle(table.frame);
      }
      table.anchor = anchor;
      arrange(table, anchor);
      if (isFirst) {
        settleAll(table);
      }
      isFirst = content.length === 0;
      wantPictures();
      request();
    },
    /** Gives up the copies of pictures the shoot no longer has. */
    keepOnly: (keys: ReadonlySet<string>) => {
      held.scene.atlas.keepOnly(keys);
      held.scene.loader.forget(keys);
    },
    stop: () => {
      kept.release();
      pause();
    },
  };
};

export type Engine = NonNullable<ReturnType<typeof makeEngine>>;
