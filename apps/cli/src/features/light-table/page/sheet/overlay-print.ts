import type { Box } from '../../contract.ts';
import { frameNumber } from '../data/format.ts';
import { printCorners } from '../marks/print.ts';
import { clamp } from '../motion/spring.ts';
import { colorOf } from '../ui/theme.ts';
import type { Rect } from './layout.ts';
import { stampSign } from './overlay-signs.ts';
import type { Frame } from './table.ts';

// What is printed on a frame and along the edge of the film: how many lie
// in its pile, the crop of the finished photo, its number, time and score.

type Pencil = CanvasRenderingContext2D;

const countSize = 11;
const countPad = 5;
const countHeight = 18;
/** A frame lower than this has no room to say how many lie in its pile. */
export const countFrom = 46;

/** The sign beside the number: two sheets, one behind the other, or a cross to close. */
const signSize = 9;
/** The room the sign and the number take beside the number itself, in paddings. */
const countPads = 3;

/**
 * How many photos lie in a pile, printed in the lower right corner of the
 * one in front. Pressing it opens the pile, or closes it.
 */
export const drawCount = (
  pencil: Pencil,
  rect: Rect,
  { count, isOpen, isHot }: { count: number; isOpen: boolean; isHot: boolean },
  scale: number,
) => {
  const text = String(count);
  pencil.font = `600 ${countSize}px "Archivo Variable", sans-serif`;
  const width =
    pencil.measureText(text).width + signSize + countPad * countPads;
  const x = rect.x + rect.w - width;
  const y = rect.y + rect.h - countHeight;
  pencil.fillStyle = colorOf(isHot ? '--color-rule' : '--color-ground');
  pencil.fillRect(x, y, width, countHeight);
  stampSign(
    pencil,
    isOpen ? 'close' : 'pile',
    { x: x + countPad, y: y + (countHeight - signSize) / 2, size: signSize },
    scale,
  );
  pencil.fillStyle = colorOf('--color-lamp');
  pencil.textAlign = 'left';
  pencil.textBaseline = 'middle';
  pencil.fillText(text, x + signSize + countPad * 2, y + countHeight / 2 + 1);
  pencil.font = printFont;
};

/** From this height on a frame shows what the finished photo keeps of it. */
export const cropFrom = 52;
const cornerShare = 0.16;
const leastCorner = 3;
const mostCorner = 13;
const cropLine = 1.25;
const cropEdge = 3;

/** Crop marks at the corners of what the finished photo shows. */
export const drawCrop = (pencil: Pencil, rect: Rect, crop: Box) => {
  const left = rect.x + crop.left * rect.w;
  const right = rect.x + crop.right * rect.w;
  const top = rect.y + crop.top * rect.h;
  const bottom = rect.y + crop.bottom * rect.h;
  const arm = clamp(
    Math.min(right - left, bottom - top) * cornerShare,
    leastCorner,
    mostCorner,
  );
  printCorners(
    pencil,
    { x: left, y: top, w: right - left, h: bottom - top },
    { arm, line: cropLine, edge: cropEdge },
  );
};

const printSize = 10;
/** The letters of everything printed on the table. */
export const printFont = `600 ${printSize}px "Archivo Variable", sans-serif`;
const printDrop = 8;
const printSpace = 7;
/** A frame narrower than this has room for its number only. */
const timeFrom = 78;
const scoreFrom = 120;

/** How far a frame is in an album that was ordered, as it is printed below it. */
const stageOf = ({
  order,
  isWorkedOn,
}: Frame): { readonly says: string; readonly color: string } | null => {
  if (order === null) {
    return null;
  }
  if (order === 'edited') {
    return { says: 'EDITED', color: '--color-print' };
  }
  return isWorkedOn
    ? { says: 'EDITING', color: '--color-pencil-blue' }
    : { says: 'WAITS', color: '--color-quiet' };
};

/** The number, time and score of a frame, or how far it is, printed below it. */
export const drawPrint = (
  pencil: Pencil,
  frame: Frame,
  rect: Rect,
  gap: number,
) => {
  const y = rect.y + rect.h + gap + printDrop;
  pencil.textBaseline = 'middle';
  pencil.textAlign = 'left';
  pencil.fillStyle = colorOf(frame.isLit ? '--color-print' : '--color-quiet');
  const number = frameNumber(frame.number);
  pencil.fillText(number, rect.x, y);
  pencil.fillStyle = colorOf('--color-quiet');
  if (rect.w >= timeFrom) {
    const after = pencil.measureText(number).width + printSpace;
    pencil.fillText(frame.time, rect.x + after, y);
  }
  if (rect.w < scoreFrom) {
    return;
  }
  pencil.textAlign = 'right';
  const stage = stageOf(frame);
  if (stage !== null) {
    pencil.fillStyle = colorOf(stage.color);
    pencil.fillText(stage.says, rect.x + rect.w, y);
  } else if (frame.score !== null) {
    pencil.fillText(`${frame.score}/10`, rect.x + rect.w, y);
  }
};
