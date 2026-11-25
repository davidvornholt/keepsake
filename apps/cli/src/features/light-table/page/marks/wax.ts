import { mix } from '../motion/spring.ts';
import { colorOf } from '../ui/theme.ts';
import { drawnOf, type Glyph, glyphOf, type Shape } from './glyphs.ts';
import type { Wax } from './kinds.ts';

// Wax on a canvas: strokes that are wider where the hand pressed, with the
// grain a wax pencil leaves on glossy paper, and a little shadow so they stay
// readable on any photograph.

type Pencil = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

type Place = {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
};

/** How long the hand takes to draw a mark, in milliseconds. */
export const drawingTime = 360;

/** No stroke is thinner than this, so marks stay readable on tiny frames. */
const leastWidth = 1.5;
const shadowGrow = 1.6;
const shadowDrop = 0.6;

const strokeOnce = (
  pencil: Pencil,
  glyph: Glyph,
  drawn: ReadonlyArray<number>,
  place: Place & { readonly weight: number; readonly grow: number },
) => {
  const { x, y, w, h, weight, grow } = place;
  for (const [which, stroke] of glyph.strokes.entries()) {
    const upTo = (drawn[which] ?? 0) * (stroke.length - 1);
    for (let index = 0; index < upTo; index += 1) {
      const from = stroke[index];
      const to = stroke[index + 1];
      if (from !== undefined && to !== undefined) {
        const part = Math.min(1, upTo - index);
        const width = ((from.width + to.width) / 2) * weight;
        pencil.lineWidth = Math.max(leastWidth, width) + grow;
        pencil.beginPath();
        pencil.moveTo(x + from.x * w, y + from.y * h);
        pencil.lineTo(
          x + mix(from.x, to.x, part) * w,
          y + mix(from.y, to.y, part) * h,
        );
        pencil.stroke();
      }
    }
  }
};

/**
 * Draws a mark, or the part of it the hand has got to. `weight` is the size
 * the width of the strokes follows from; it is the smaller side if left out.
 */
export const drawWax = (
  pencil: Pencil,
  glyph: Glyph,
  place: Place,
  look: {
    readonly color: string;
    readonly progress?: number;
    readonly weight?: number;
  },
): void => {
  const drawn = drawnOf(glyph, look.progress ?? 1);
  const weight = look.weight ?? Math.min(place.w, place.h);
  pencil.lineCap = 'round';
  pencil.strokeStyle = colorOf('--color-shade');
  strokeOnce(pencil, glyph, drawn, {
    ...place,
    y: place.y + shadowDrop,
    weight,
    grow: shadowGrow,
  });
  pencil.strokeStyle = look.color;
  strokeOnce(pencil, glyph, drawn, { ...place, weight, grow: 0 });
};

const grainSize = 96;
const grainShare = 0.42;
const grainDepth = 0.55;
const grainSeed = 0.618;
const grainStep = 12.9898;
const grainSpread = 43_758.5453;
const opaque = 255;
/** Red, green, blue, and how opaque. */
const channels = 4;

let grain: OffscreenCanvas | null = null;

/** Specks where the wax didn't take, the same every time. */
const grainOf = (): OffscreenCanvas => {
  if (grain !== null) {
    return grain;
  }
  const canvas = new OffscreenCanvas(grainSize, grainSize);
  const pencil = canvas.getContext('2d');
  if (pencil !== null) {
    const image = pencil.createImageData(grainSize, grainSize);
    for (let index = 0; index < grainSize * grainSize; index += 1) {
      const noise = Math.sin((index + grainSeed) * grainStep) * grainSpread;
      const share = noise - Math.floor(noise);
      const alphaAt = index * channels + channels - 1;
      image.data[alphaAt] =
        share < grainShare ? (share / grainShare) * grainDepth * opaque : 0;
    }
    pencil.putImageData(image, 0, 0);
  }
  grain = canvas;
  return canvas;
};

/**
 * Takes specks out of what was drawn, as glossy paper does. Only where
 * something was drawn, in the canvas's own pixels: going over a whole window
 * each frame is what makes a large screen slow.
 */
export const addGrain = (pencil: Pencil, places: ReadonlyArray<Place>) => {
  const pattern = pencil.createPattern(grainOf(), 'repeat');
  if (pattern === null) {
    return;
  }
  pencil.save();
  pencil.globalCompositeOperation = 'destination-out';
  pencil.fillStyle = pattern;
  for (const { x, y, w, h } of places) {
    pencil.fillRect(Math.floor(x), Math.floor(y), Math.ceil(w), Math.ceil(h));
  }
  pencil.restore();
};

/** Room around a mark for strokes that go over its edge, as a share. */
const room = 0.18;
/** From this width of stroke on, in device pixels, the grain can be seen. */
const sketchGrainFrom = 24;
/** How far a stroke may reach beyond the place of its mark, at least. */
const strokeReach = 12;
/** A sketch that was made this recently is stretched instead of made anew. */
const sketchLasts = 120;
const mostSketches = 24;

type Sketch = {
  readonly canvas: OffscreenCanvas;
  readonly w: number;
  readonly h: number;
  readonly pad: number;
  readonly madeAt: number;
};

const sketches = new Map<string, Sketch>();
let scratch: OffscreenCanvas | null = null;

/** A canvas with at least this room, the same one every time unless it is to be kept. */
const sheetFor = (width: number, height: number, isKept: boolean) => {
  if (isKept) {
    return new OffscreenCanvas(width, height);
  }
  if (scratch === null || scratch.width < width || scratch.height < height) {
    scratch = new OffscreenCanvas(
      Math.max(width, scratch?.width ?? 0),
      Math.max(height, scratch?.height ?? 0),
    );
  }
  return scratch;
};

type SketchLook = {
  readonly color: string;
  readonly progress?: number;
  readonly weight?: number;
  /** How many device pixels the canvas has for each of its own. */
  readonly scale: number;
  /** A finished mark of this name is kept, and stretched while it moves. */
  readonly keep?: { readonly key: string; readonly now: number };
};

const makeSketch = (glyph: Glyph, place: Place, look: SketchLook): Sketch => {
  const { scale, keep } = look;
  const weight = look.weight ?? Math.min(place.w, place.h);
  const pad = Math.ceil(Math.max(strokeReach, weight * room));
  const width = Math.ceil((place.w + pad * 2) * scale);
  const height = Math.ceil((place.h + pad * 2) * scale);
  const canvas = sheetFor(width, height, keep !== undefined);
  const pencil = canvas.getContext('2d');
  if (pencil !== null) {
    pencil.setTransform(1, 0, 0, 1, 0, 0);
    pencil.clearRect(0, 0, width, height);
    pencil.setTransform(scale, 0, 0, scale, 0, 0);
    drawWax(pencil, glyph, { x: pad, y: pad, w: place.w, h: place.h }, look);
    if (weight * scale >= sketchGrainFrom) {
      pencil.setTransform(1, 0, 0, 1, 0, 0);
      addGrain(pencil, [{ x: 0, y: 0, w: width, h: height }]);
    }
  }
  return {
    canvas,
    w: place.w,
    h: place.h,
    pad,
    madeAt: keep?.now ?? 0,
  };
};

/** The sketch of a mark that is kept, if it still fits or was made a moment ago. */
const keptSketch = (place: Place, look: SketchLook): Sketch | undefined => {
  const known =
    look.keep === undefined ? undefined : sketches.get(look.keep.key);
  if (known === undefined || look.keep === undefined) {
    return;
  }
  const isSame =
    Math.abs(known.w - place.w) * look.scale < 1 &&
    Math.abs(known.h - place.h) * look.scale < 1;
  return isSame || look.keep.now - known.madeAt < sketchLasts
    ? known
    : undefined;
};

/**
 * Draws a mark of any size, or the part of it the hand has got to, on a
 * canvas of its own and puts that on the given one. A canvas as large as the
 * window pays for every stroke with a late frame on a screen with many
 * pixels; for a picture put on it, it doesn't.
 */
export const sketchWax = (
  pencil: Pencil,
  glyph: Glyph,
  place: Place,
  look: SketchLook,
): void => {
  const sketch = keptSketch(place, look) ?? makeSketch(glyph, place, look);
  if (look.keep !== undefined && sketches.get(look.keep.key) !== sketch) {
    if (sketches.size >= mostSketches) {
      sketches.clear();
    }
    sketches.set(look.keep.key, sketch);
  }
  const { canvas, pad, w, h } = sketch;
  const across = place.w / w;
  const down = place.h / h;
  pencil.drawImage(
    canvas,
    0,
    0,
    Math.ceil((w + pad * 2) * look.scale),
    Math.ceil((h + pad * 2) * look.scale),
    place.x - pad * across,
    place.y - pad * down,
    (w + pad * 2) * across,
    (h + pad * 2) * down,
  );
};

/** The sizes marks are kept ready in, in device pixels. */
const smallest = 16;
const sizeStep = 1.5;
const sizeCount = 9;
const sizes = Array.from({ length: sizeCount }, (_, index) =>
  Math.round(smallest * sizeStep ** index),
);
const largest = Math.round(smallest * sizeStep ** (sizeCount - 1));
/** From this size on the grain of the wax can be seen. */
const grainFrom = 54;
const mostSprites = 900;

const sprites = new Map<string, OffscreenCanvas>();

const spriteOf = (shape: Shape, seed: number, wax: Wax, size: number) => {
  const key = `${shape}:${seed}:${wax}:${size}`;
  const known = sprites.get(key);
  if (known !== undefined) {
    return known;
  }
  const pad = Math.ceil(size * room);
  const canvas = new OffscreenCanvas(size + pad * 2, size + pad * 2);
  const pencil = canvas.getContext('2d');
  if (pencil !== null) {
    drawWax(
      pencil,
      glyphOf(shape, seed),
      { x: pad, y: pad, w: size, h: size },
      { color: colorOf(`--color-${wax}`) },
    );
    if (size >= grainFrom) {
      addGrain(pencil, [{ x: 0, y: 0, w: canvas.width, h: canvas.height }]);
    }
  }
  if (sprites.size >= mostSprites) {
    sprites.clear();
  }
  sprites.set(key, canvas);
  return canvas;
};

export type Stamp = {
  readonly shape: Shape;
  readonly seed: number;
  readonly wax: Wax;
};

/**
 * Puts a finished mark into a square, from a copy that is kept ready. `scale`
 * is how many device pixels the canvas has for each of its own.
 */
export const stampWax = (
  pencil: Pencil,
  { shape, seed, wax }: Stamp,
  square: { readonly x: number; readonly y: number; readonly size: number },
  scale: number,
): void => {
  const pixels = square.size * scale;
  const size = sizes.find((one) => one >= pixels) ?? largest;
  const sprite = spriteOf(shape, seed, wax, size);
  const pad = square.size * room;
  const side = square.size + pad * 2;
  pencil.drawImage(sprite, square.x - pad, square.y - pad, side, side);
};
