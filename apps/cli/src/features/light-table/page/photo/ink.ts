import type { Box } from '../../contract.ts';
import { glyphOf, type Shape } from '../marks/glyphs.ts';
import type { Wax } from '../marks/kinds.ts';
import {
  printCorners,
  printDashes,
  printEdge,
  printHatch,
} from '../marks/print.ts';
import { sketchWax, stampWax } from '../marks/wax.ts';
import { clamp } from '../motion/spring.ts';
import type { Rect } from '../sheet/layout.ts';
import { colorOf } from '../ui/theme.ts';
import type { Shown } from './gliding.ts';
import { onScreen, type Plane, rectOf, type View } from './plane.ts';

// What is drawn over a photo that is looked at: the owner's marks and boxes
// in wax, and in thin print what the machine did: its crop, what it took
// out, and where it went on painting beyond the camera's picture.

export type Stamp = {
  readonly shape: Shape;
  readonly seed: number;
  readonly wax: Wax;
  /** When it was made, in milliseconds, so that it is drawn by hand. */
  readonly since: number;
};

export type Ink = {
  readonly stamps: ReadonlyArray<Stamp>;
  /** What a change is about, in fractions of the finished photo. */
  readonly boxes: ReadonlyArray<{
    readonly box: Box;
    readonly seed: number;
    readonly since: number;
  }>;
  /** The hand that the next box is drawn in, so that it stays as it was drawn. */
  readonly nextBox: number;
  /** Something the machine took out, shown while it is pointed at. */
  readonly printed: Box | null;
  /** A box that is being drawn right now, on the screen. */
  readonly draft: Rect | null;
};

export const noInk: Ink = {
  stamps: [],
  boxes: [],
  nextBox: 1,
  printed: null,
  draft: null,
};

type Pencil = CanvasRenderingContext2D;

export type Scene = {
  readonly ink: Ink;
  readonly plane: Plane;
  readonly view: View;
  readonly shown: Shown;
  readonly now: number;
};

/** How long the hand takes to draw a mark or a box, in milliseconds. */
const drawingTime = 360;
const stampShare = 0.2;
const leastStamp = 44;
const mostStamp = 104;
const stampInset = 0.045;

/** Where the mark of a photo is drawn: in its lower left corner. */
const stampPlace = (part: Rect): Rect => {
  const side = Math.min(part.w, part.h);
  const size = clamp(side * stampShare, leastStamp, mostStamp);
  const inset = side * stampInset;
  return {
    x: part.x + inset,
    y: part.y + part.h - size - inset,
    w: size,
    h: size,
  };
};

const boxWeightShare = 0.5;
const leastBoxWeight = 26;
const mostBoxWeight = 44;

const boxWeight = ({ w, h }: Rect): number =>
  clamp(Math.min(w, h) * boxWeightShare, leastBoxWeight, mostBoxWeight);

/** Draws the owner's wax. Says whether the hand is still drawing. */
const drawWaxOn = (pencil: Pencil, scene: Scene, part: Rect, scale: number) => {
  const { ink, now } = scene;
  const color = colorOf('--color-wax-yellow');
  let isDrawing = false;
  for (const { box, seed, since } of ink.boxes) {
    const progress = (now - since) / drawingTime;
    isDrawing = isDrawing || progress < 1;
    const place = rectOf(box, part);
    sketchWax(pencil, glyphOf('frame', seed), place, {
      color,
      progress,
      weight: boxWeight(place),
      scale,
      ...(progress < 1 ? {} : { keep: { key: `box ${seed}`, now } }),
    });
  }
  if (ink.draft !== null) {
    const weight = boxWeight(ink.draft);
    sketchWax(pencil, glyphOf('frame', ink.nextBox), ink.draft, {
      color,
      weight,
      scale,
    });
  }
  for (const stamp of ink.stamps) {
    const progress = (now - stamp.since) / drawingTime;
    isDrawing = isDrawing || progress < 1;
    const place = stampPlace(part);
    if (progress < 1) {
      sketchWax(pencil, glyphOf(stamp.shape, stamp.seed), place, {
        color: colorOf(`--color-${stamp.wax}`),
        progress,
        scale,
      });
    } else {
      stampWax(pencil, stamp, { x: place.x, y: place.y, size: place.w }, scale);
    }
  }
  return isDrawing;
};

const corners = { arm: 18, line: 1.25, edge: 3 };
const hatchStep = 9;
const hatchAlpha = 0.5;
const dashes = { dash: 5, line: 1.25 };

/** A strip the image model painted beyond the camera's picture. */
const drawBeyond = (pencil: Pencil, strip: Rect, scale: number) => {
  const before = pencil.globalAlpha;
  pencil.globalAlpha = before * hatchAlpha;
  printHatch(pencil, strip, { step: hatchStep, scale });
  pencil.globalAlpha = before;
  printDashes(pencil, strip, dashes);
};

/** Draws what the machine did, as far as the camera's picture is shown. */
const drawPrinted = (
  pencil: Pencil,
  scene: Scene,
  part: Rect,
  scale: number,
) => {
  const { plane, view, shown, ink } = scene;
  if (plane.edit !== null && shown.camera > 0) {
    pencil.globalAlpha = shown.camera * shown.all;
    for (const strip of plane.beyond) {
      drawBeyond(pencil, onScreen(strip, view), scale);
    }
    printCorners(pencil, onScreen(plane.edit, view), corners);
  }
  if (ink.printed !== null) {
    pencil.globalAlpha = shown.all;
    printEdge(pencil, rectOf(ink.printed, part), corners);
  }
};

/**
 * Draws everything on a photo. `size` is the canvas in its own pixels, and
 * `scale` how many device pixels each of them has. Says whether it changes.
 */
export const drawInk = (
  pencil: Pencil,
  scene: Scene,
  size: {
    readonly width: number;
    readonly height: number;
    readonly scale: number;
  },
): boolean => {
  const { plane, view, shown } = scene;
  pencil.setTransform(size.scale, 0, 0, size.scale, 0, 0);
  pencil.clearRect(0, 0, size.width, size.height);
  const part = onScreen(plane.edit ?? plane.camera, view);
  pencil.globalAlpha = shown.all;
  const isDrawing = drawWaxOn(pencil, scene, part, size.scale);
  drawPrinted(pencil, scene, part, size.scale);
  pencil.globalAlpha = 1;
  return isDrawing;
};
