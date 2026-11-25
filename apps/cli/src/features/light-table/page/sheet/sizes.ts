import type { Show } from '../app/route.ts';
import { clamp } from '../motion/spring.ts';

// How large the frames are when a view opens. Everything opens with the
// whole shoot at once; the album and what was left out open at a size at
// which a photo can be judged. Each view remembers the size it was given.

/** The height of the frames, or `fit` for everything at once. */
export type Zoom = number | 'fit';

type Room = {
  readonly width: number;
  readonly height: number;
  /** What the bars keep of the top once the table is scrolled. */
  readonly pinned: number;
};

/** About this many rows are in sight, and this many photos across at least. */
const rowsInSight = 3.3;
const acrossAtLeast = 3.4;
/** What a row takes below its frames, for their print. */
const belowRow = 26;

/** The height of frame at which photos are a pleasure to look at. */
export const pleasantFrame = ({ width, height, pinned }: Room): number =>
  Math.round(
    Math.min((height - pinned) / rowsInSight - belowRow, width / acrossAtLeast),
  );

/** The size a view opens with: the one it was given last, or its own. */
export const openingZoom = (
  show: Show,
  kept: Zoom | null,
  room: Room,
  limits: { readonly least: number; readonly most: number },
): Zoom => {
  const wanted = kept ?? (show === 'all' ? 'fit' : pleasantFrame(room));
  return wanted === 'fit' || wanted <= limits.least
    ? 'fit'
    : clamp(wanted, limits.least, limits.most);
};

const fit = 'fit';

/** A size as it is kept, and read again. Anything else is no size. */
export const textOf = (zoom: Zoom): string =>
  zoom === 'fit' ? fit : String(Math.round(zoom));

export const zoomOf = (text: string | null): Zoom | null => {
  if (text === fit) {
    return 'fit';
  }
  const frame = text === null || text === '' ? Number.NaN : Number(text);
  return Number.isFinite(frame) && frame > 0 ? frame : null;
};

const keyOf = (show: Show): string => `keepsake:size:${show}`;

/** The size a view was given on this device, if it was given one. */
export const keptZoom = (show: Show): Zoom | null => {
  try {
    return zoomOf(globalThis.localStorage.getItem(keyOf(show)));
  } catch {
    // A browser that keeps nothing opens every view at its own size.
    return null;
  }
};

export const keepZoom = (show: Show, zoom: Zoom): void => {
  try {
    globalThis.localStorage.setItem(keyOf(show), textOf(zoom));
  } catch {
    // Then the size lasts as long as the page does.
  }
};
