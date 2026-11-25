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
/** On small frames the number stands alone. */
const smallSize = 9;
const smallPad = 3;
const smallHeight = 12;

/** The sign beside the number: two sheets, one behind the other, or a cross to close. */
const signSize = 9;
/** The room the sign and the number take beside the number itself, in paddings. */
const countPads = 3;

type Count = {
  readonly count: number;
  readonly isOpen: boolean;
  readonly isHot: boolean;
  readonly isSmall: boolean;
};

/** The number alone, or the cross that closes the pile. */
const drawSmallCount = (
  pencil: Pencil,
  rect: Rect,
  { count, isOpen, isHot }: Count,
  scale: number,
) => {
  const text = String(count);
  pencil.font = `600 ${smallSize}px "Archivo Variable", sans-serif`;
  const inner = isOpen ? smallSize - 2 : pencil.measureText(text).width;
  const width = inner + smallPad * 2;
  const x = rect.x + rect.w - width;
  const y = rect.y + rect.h - smallHeight;
  pencil.fillStyle = colorOf(isHot ? '--color-rule' : '--color-ground');
  pencil.fillRect(x, y, width, smallHeight);
  if (isOpen) {
    const at = { x: x + smallPad, y: y + (smallHeight - inner) / 2 };
    stampSign(pencil, 'close', { ...at, size: inner }, scale);
  } else {
    pencil.fillStyle = colorOf('--color-lamp');
    pencil.textAlign = 'left';
    pencil.textBaseline = 'middle';
    pencil.fillText(text, x + smallPad, y + smallHeight / 2 + 1);
  }
  pencil.font = printFont;
};

/**
 * How many photos lie in a pile, printed in the lower right corner of the
 * one in front. Pressing it opens the pile, or closes it.
 */
export const drawCount = (
  pencil: Pencil,
  rect: Rect,
  shown: Count,
  scale: number,
) => {
  if (shown.isSmall) {
    drawSmallCount(pencil, rect, shown, scale);
    return;
  }
  const { count, isOpen, isHot } = shown;
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

const cornerShare = 0.16;
const leastCorner = 3;
const mostCorner = 13;
const cropLine = 1.25;
const cropEdge = 3;

/**
 * Crop marks at the corners of what the finished photo shows. Where it goes
 * on beyond the frame, the marks stay on the frame.
 */
export const drawCrop = (pencil: Pencil, rect: Rect, crop: Box) => {
  const left = rect.x + Math.max(0, crop.left) * rect.w;
  const right = rect.x + Math.min(1, crop.right) * rect.w;
  const top = rect.y + Math.max(0, crop.top) * rect.h;
  const bottom = rect.y + Math.min(1, crop.bottom) * rect.h;
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
/** The print of two frames that lie next to each other is at least this far apart. */
const printApart = 12;
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
  const end = rect.x + rect.w - Math.max(0, printApart - gap);
  const stage = stageOf(frame);
  if (stage !== null) {
    pencil.fillStyle = colorOf(stage.color);
    pencil.fillText(stage.says, end, y);
  } else if (frame.score !== null) {
    pencil.fillText(`${frame.score}/10`, end, y);
  }
};
