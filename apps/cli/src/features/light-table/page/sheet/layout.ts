import { clamp } from '../motion/spring.ts';
import { breaksOf, type Piece, scaleOf, widthOf } from './rows.ts';

// Where every frame lies on the table. Each group of frames is a sheet of
// paper with a heading; the frames run in rows like strips of film, and
// every row ends where its sheet does.

export type Rect = {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
};

export type Item = {
  readonly id: string;
  /** Width by height. */
  readonly aspect: number;
  /** Whether a new moment begins with it. */
  readonly isMomentStart: boolean;
};

export type Group = {
  readonly key: string;
  readonly items: ReadonlyArray<Item>;
};

export type Row = {
  readonly top: number;
  /** Each row is as tall as it has to be to fill its sheet. */
  readonly height: number;
  /** Where its frames are in the order, the last one not included. */
  readonly from: number;
  readonly to: number;
};

export type Sheet = {
  readonly key: string;
  readonly paper: Rect;
  /** The strip along the top that carries the heading. */
  readonly head: Rect;
};

/** The distances on the table, all following from the height of a frame. */
export type Measure = {
  readonly frame: number;
  /** Between the frames of one moment, and between two moments. */
  readonly gap: number;
  readonly momentGap: number;
  readonly rowGap: number;
  /** Around the frames on a sheet, and around the sheets on the table. */
  readonly inset: number;
  readonly margin: number;
  readonly head: number;
  /** Whether the frames are large enough to carry their number and time. */
  readonly hasEdgePrint: boolean;
};

export type Layout = {
  readonly measure: Measure;
  readonly order: ReadonlyArray<string>;
  readonly rects: ReadonlyMap<string, Rect>;
  readonly rows: ReadonlyArray<Row>;
  readonly sheets: ReadonlyArray<Sheet>;
  readonly height: number;
};

const gapShare = 0.045;
const momentGapShare = 0.2;
const insetShare = 0.28;
const marginShare = 0.3;
const leastInset = 5;
const mostInset = 28;
const leastMargin = 5;
const mostMargin = 22;
const headHeight = 26;
/** From this height on a frame has room for its number and time below it. */
export const edgePrintFrom = 88;
const edgePrintHeight = 18;
/** Below this height the frames of all moments lie evenly. */
const momentsFrom = 30;

/** On a narrow table the paper and its edges take less of the width. */
const insetOfWidth = 0.02;
const marginOfWidth = 0.014;
/** However large the frames, two moments are never further apart than this. */
const mostMomentGap = 22;
const leastMomentGap = 6;
const momentGapOfWidth = 0.018;

/** The distances for frames of some height, on a table of some width. */
export const measureOf = (
  frame: number,
  width = Number.POSITIVE_INFINITY,
): Measure => {
  const gap = Math.max(1, Math.round(frame * gapShare));
  const hasEdgePrint = frame >= edgePrintFrom;
  const inset = Math.min(mostInset, Math.max(leastInset, width * insetOfWidth));
  const margin = Math.min(
    mostMargin,
    Math.max(leastMargin, width * marginOfWidth),
  );
  return {
    frame,
    gap,
    momentGap:
      frame >= momentsFrom
        ? Math.round(
            Math.min(
              frame * momentGapShare,
              clamp(width * momentGapOfWidth, leastMomentGap, mostMomentGap),
            ),
          )
        : gap,
    rowGap: hasEdgePrint ? edgePrintHeight + gap * 2 : gap,
    inset: Math.round(clamp(frame * insetShare, leastInset, inset)),
    margin: Math.round(clamp(frame * marginShare, leastMargin, margin)),
    head: headHeight,
    hasEdgePrint,
  };
};

type Flow = {
  readonly rects: Map<string, Rect>;
  readonly order: Array<string>;
  readonly rows: Array<Row>;
  readonly sheets: Array<Sheet>;
};

/** The frames of one sheet, as wide as they are at the height asked for. */
type Strip = {
  readonly group: Group;
  readonly pieces: ReadonlyArray<Piece>;
  readonly frames: number;
  readonly gaps: number;
};

/** A sheet is never narrower than this, so that its heading can be read. */
const leastPaper = 330;
/**
 * A sheet with too few frames for a row lies there larger, by this much at
 * most, and its paper ends where its frames do. More would make a day with
 * few photos look like one with many.
 */
const mostAlone = 1.6;

const stripOf = (group: Group, { frame, gap, momentGap }: Measure): Strip => {
  const pieces = group.items.map(({ aspect, isMomentStart }) => ({
    width: Math.max(1, frame * aspect),
    before: isMomentStart ? momentGap : gap,
  }));
  return { group, pieces, ...widthOf(pieces) };
};

/** The paper a sheet needs when all its frames lie in one row as asked for. */
const aloneWidth = (strip: Strip, inset: number): number =>
  Math.max(leastPaper, strip.frames + strip.gaps + inset * 2);

/**
 * Which sheets lie side by side: those with too few frames for a row of
 * their own share a line with their neighbours, as long as there is room.
 */
const linesOf = (
  strips: ReadonlyArray<Strip>,
  across: number,
  { inset, margin }: Measure,
): ReadonlyArray<ReadonlyArray<Strip>> => {
  const lines: Array<Array<Strip>> = [];
  let open: Array<Strip> | null = null;
  let used = 0;
  for (const strip of strips) {
    const alone = aloneWidth(strip, inset);
    const isShort = strip.frames + strip.gaps + inset * 2 <= across;
    if (isShort && open !== null && used + margin + alone <= across) {
      open.push(strip);
      used += margin + alone;
    } else {
      open = isShort ? [strip] : null;
      used = alone;
      lines.push([strip]);
      if (open !== null) {
        lines[lines.length - 1] = open;
      }
    }
  }
  return lines;
};

/** Lays the frames of one row from `left` on. */
const layRow = (
  { rects, order, rows }: Flow,
  { group, pieces }: Strip,
  span: { readonly from: number; readonly to: number },
  at: {
    readonly left: number;
    readonly top: number;
    readonly height: number;
    /** By how much the frames grow to fill the row. */
    readonly scale: number;
  },
) => {
  let x = at.left;
  const from = order.length;
  for (let index = span.from; index < span.to; index += 1) {
    const item = group.items[index];
    const piece = pieces[index];
    if (item !== undefined && piece !== undefined) {
      x += index > span.from ? piece.before : 0;
      const w = piece.width * at.scale;
      rects.set(item.id, { x, y: at.top, w, h: at.height });
      order.push(item.id);
      x += w;
    }
  }
  rows.push({ top: at.top, height: at.height, from, to: order.length });
};

type Bounds = { readonly top?: number; readonly tallest?: number };

type Line = {
  readonly left: number;
  readonly top: number;
  readonly across: number;
  /** By how much a sheet of one row may grow. */
  readonly most: number;
};

/** A sheet with rows from edge to edge. Returns where its paper ends. */
const laySheet = (
  flow: Flow,
  strip: Strip,
  measure: Measure,
  { left, top, across }: Line,
): number => {
  const { frame, inset, head, rowGap } = measure;
  const room = Math.max(1, across - inset * 2);
  let y = top + head;
  let from = 0;
  for (const to of breaksOf(strip.pieces, room)) {
    const { frames, gaps } = widthOf(strip.pieces, from, to);
    const scale = scaleOf(frames, gaps, room);
    const height = frame * scale;
    layRow(
      flow,
      strip,
      { from, to },
      { left: left + inset, top: y, height, scale },
    );
    y += height + rowGap;
    from = to;
  }
  const bottom = y - rowGap + footOf(measure);
  flow.sheets.push({
    key: strip.group.key,
    paper: { x: left, y: top, w: across, h: bottom - top },
    head: { x: left, y: top, w: across, h: head },
  });
  return bottom;
};

const footOf = ({ hasEdgePrint, rowGap, inset }: Measure): number =>
  hasEdgePrint ? rowGap : inset;

/** By how much the frames of sheets that share a line grow to fill it. */
const lineScale = (
  line: ReadonlyArray<Strip>,
  { inset, margin }: Measure,
  across: number,
  most: number,
): number => {
  const between = margin * (line.length - 1);
  const scaleWith = (isHeld: (strip: Strip) => boolean): number => {
    let fixed = between;
    let frames = 0;
    for (const strip of line) {
      const isAtLeast = isHeld(strip);
      fixed += isAtLeast ? leastPaper : strip.gaps + inset * 2;
      frames += isAtLeast ? 0 : strip.frames;
    }
    return frames > 0 ? clamp((across - fixed) / frames, 1, most) : 1;
  };
  const first = scaleWith(() => false);
  // A sheet that is as narrow as a sheet gets takes no part in the growing.
  return scaleWith(
    (strip) => strip.gaps + inset * 2 + strip.frames * first < leastPaper,
  );
};

/** Sheets of one row each, side by side. Returns where their paper ends. */
const layLine = (
  flow: Flow,
  line: ReadonlyArray<Strip>,
  measure: Measure,
  { left, top, across, most }: Line,
): number => {
  const { frame, inset, margin, head } = measure;
  const scale = lineScale(line, measure, across, most);
  const height = frame * scale;
  const bottom = top + head + height + footOf(measure);
  let x = left;
  for (const strip of line) {
    const wanted = strip.gaps + inset * 2 + strip.frames * scale;
    const w = Math.min(across, Math.max(leastPaper, wanted));
    layRow(
      flow,
      strip,
      { from: 0, to: strip.pieces.length },
      { left: x + inset, top: top + head, height, scale },
    );
    flow.sheets.push({
      key: strip.group.key,
      paper: { x, y: top, w, h: bottom - top },
      head: { x, y: top, w, h: head },
    });
    x += w + margin;
  }
  return bottom;
};

/**
 * Lays groups of frames on a table of some width, below `top`. No frame of
 * a sheet with one row gets taller than `tallest`.
 */
export const layOut = (
  groups: ReadonlyArray<Group>,
  width: number,
  frame: number,
  { top = 0, tallest = Number.POSITIVE_INFINITY }: Bounds = {},
): Layout => {
  const measure = measureOf(frame, width);
  const { inset, margin } = measure;
  const flow: Flow = { rects: new Map(), order: [], rows: [], sheets: [] };
  const across = Math.max(1, width - margin * 2);
  const most = clamp(tallest / Math.max(1, frame), 1, mostAlone);
  const strips = groups.map((group) => stripOf(group, measure));
  let y = top;
  for (const line of linesOf(strips, across, measure)) {
    const [first] = line;
    const place = { left: margin, top: y + margin, across, most };
    const isLong =
      first !== undefined &&
      line.length === 1 &&
      first.frames + first.gaps + inset * 2 > across;
    if (isLong) {
      y = laySheet(flow, first, measure, place);
    } else {
      y = layLine(flow, line, measure, place);
    }
  }
  return { measure, ...flow, height: y + margin };
};
