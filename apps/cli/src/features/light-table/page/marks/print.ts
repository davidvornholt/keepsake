import { colorOf } from '../ui/theme.ts';

// What the machine prints on a photo: crop marks at corners, a dashed edge,
// hatching. All of it out of rectangles and one pattern, because a canvas as
// large as the window pays for each stroked path with a late frame on a
// screen with many pixels, and for these it doesn't.

type Pencil = CanvasRenderingContext2D;

type Rect = {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
};

type Arm = { readonly dx: number; readonly dy: number };

/** One corner: an arm along the edge and one down it, without painting the corner twice. */
const corner = (pencil: Pencil, at: Rect, arm: Arm, width: number) => {
  const half = width / 2;
  const { x, y } = at;
  const { dx, dy } = arm;
  pencil.fillRect(
    dx > 0 ? x - half : x + dx,
    y - half,
    Math.abs(dx) + half,
    width,
  );
  pencil.fillRect(
    x - half,
    dy > 0 ? y + half : y + dy,
    width,
    Math.abs(dy) - half,
  );
};

const cornersOnce = (
  pencil: Pencil,
  rect: Rect,
  arm: number,
  width: number,
) => {
  for (const [x, dx] of [
    [rect.x, arm],
    [rect.x + rect.w, -arm],
  ] as const) {
    for (const [y, dy] of [
      [rect.y, arm],
      [rect.y + rect.h, -arm],
    ] as const) {
      corner(pencil, { x, y, w: 0, h: 0 }, { dx, dy }, width);
    }
  }
};

/** Crop marks at the four corners of a rectangle, light on a dark edge. */
export const printCorners = (
  pencil: Pencil,
  rect: Rect,
  look: {
    readonly arm: number;
    readonly line: number;
    readonly edge: number;
  },
): void => {
  pencil.fillStyle = colorOf('--color-shade');
  cornersOnce(pencil, rect, look.arm, look.edge);
  pencil.fillStyle = colorOf('--color-lamp');
  cornersOnce(pencil, rect, look.arm, look.line);
};

/** The edge of a rectangle, light on a dark edge. */
export const printEdge = (
  pencil: Pencil,
  { x, y, w, h }: Rect,
  look: { readonly line: number; readonly edge: number },
): void => {
  pencil.lineWidth = look.edge;
  pencil.strokeStyle = colorOf('--color-shade');
  pencil.strokeRect(x, y, w, h);
  pencil.lineWidth = look.line;
  pencil.strokeStyle = colorOf('--color-lamp');
  pencil.strokeRect(x, y, w, h);
};

/** The edge of a rectangle in dashes. */
export const printDashes = (
  pencil: Pencil,
  { x, y, w, h }: Rect,
  look: { readonly dash: number; readonly line: number },
): void => {
  const { dash, line } = look;
  const half = line / 2;
  pencil.fillStyle = colorOf('--color-lamp');
  for (let at = 0; at < w; at += dash * 2) {
    const length = Math.min(dash, w - at);
    pencil.fillRect(x + at, y - half, length, line);
    pencil.fillRect(x + at, y + h - half, length, line);
  }
  for (let at = 0; at < h; at += dash * 2) {
    const length = Math.min(dash, h - at);
    pencil.fillRect(x - half, y + at, line, length);
    pencil.fillRect(x + w - half, y + at, line, length);
  }
};

const tiles = new Map<number, OffscreenCanvas>();

/** One square of hatching that repeats without a seam, in device pixels. */
const hatchTile = (side: number, line: number): OffscreenCanvas => {
  const known = tiles.get(side);
  if (known !== undefined) {
    return known;
  }
  const tile = new OffscreenCanvas(side, side);
  const pencil = tile.getContext('2d');
  if (pencil !== null) {
    pencil.strokeStyle = colorOf('--color-lamp');
    pencil.lineWidth = line;
    pencil.beginPath();
    // The line through the square and its neighbours through two corners.
    for (const shift of [-side, 0, side]) {
      pencil.moveTo(shift - line, side + line);
      pencil.lineTo(shift + side + line, -line);
    }
    pencil.stroke();
  }
  tiles.set(side, tile);
  return tile;
};

/**
 * Hatches a rectangle with lines rising to the right, `step` apart along its
 * lower edge. `scale` is how many device pixels the canvas has for each of
 * its own; the lines are made in those, so that they stay sharp.
 */
export const printHatch = (
  pencil: Pencil,
  { x, y, w, h }: Rect,
  look: { readonly step: number; readonly scale: number },
): void => {
  const { step, scale } = look;
  const side = Math.max(2, Math.round(step * scale));
  const pattern = pencil.createPattern(hatchTile(side, scale), 'repeat');
  if (pattern === null) {
    return;
  }
  // The lines start at the lower left corner and move with the rectangle.
  pattern.setTransform(new DOMMatrix().translate(x * scale, (y + h) * scale));
  pencil.save();
  pencil.setTransform(1, 0, 0, 1, 0, 0);
  pencil.fillStyle = pattern;
  pencil.fillRect(x * scale, y * scale, w * scale, h * scale);
  pencil.restore();
};
