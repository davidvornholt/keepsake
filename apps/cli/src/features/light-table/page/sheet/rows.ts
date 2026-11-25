// Where the rows of a sheet break. Every row is made as wide as the sheet by
// making its frames a little taller or lower, so the breaks are chosen such
// that no row has to change much, the last one included.

/** One frame as wide as it is at the height asked for. */
export type Piece = {
  readonly width: number;
  /** The gap to the frame before it, when they share a row. */
  readonly before: number;
};

/** A row may be considered until it is this much wider than the sheet. */
const widest = 1.7;
/** Beyond these a row no longer looks like its neighbours. */
const leastScale = 0.74;
const mostScale = 1.42;
const outOfBounds = 40;
const never = Number.POSITIVE_INFINITY;
/** A row that has no room at all. It is still a row. */
const hopeless = 1e9;

/** By how much the frames of a row grow so that it fills the room. */
export const scaleOf = (frames: number, gaps: number, room: number): number =>
  frames > 0 ? Math.max(0, room - gaps) / frames : 1;

/** How far a row is from lying there as it was asked for. */
const costOf = (scale: number): number => {
  if (scale <= 0) {
    return hopeless;
  }
  const off = Math.log(scale) ** 2;
  const beyond =
    Math.max(0, leastScale - scale) + Math.max(0, scale - mostScale);
  return off + beyond * outOfBounds;
};

/** What all pieces in a row take together: the frames, and the gaps between. */
export const widthOf = (
  pieces: ReadonlyArray<Piece>,
  from = 0,
  to = pieces.length,
): { readonly frames: number; readonly gaps: number } => {
  let frames = 0;
  let gaps = 0;
  for (let at = from; at < to; at += 1) {
    const piece = pieces[at];
    frames += piece?.width ?? 0;
    gaps += at > from ? (piece?.before ?? 0) : 0;
  }
  return { frames, gaps };
};

type Best = { readonly cost: number; readonly from: number };

/**
 * The cheapest row that ends before piece `to`, given what the rows before
 * it cost at best.
 */
const lastRow = (
  pieces: ReadonlyArray<Piece>,
  to: number,
  room: number,
  before: Float64Array,
): Best => {
  let best: Best = { cost: never, from: to - 1 };
  let frames = 0;
  let gaps = 0;
  for (let from = to - 1; from >= 0; from -= 1) {
    frames += pieces[from]?.width ?? 0;
    gaps += from < to - 1 ? (pieces[from + 1]?.before ?? 0) : 0;
    // One piece is a row of its own however wide it is.
    if (from < to - 1 && frames + gaps > room * widest) {
      return best;
    }
    const cost = (before[from] ?? 0) + costOf(scaleOf(frames, gaps, room));
    if (cost < best.cost) {
      best = { cost, from };
    }
  }
  return best;
};

/**
 * Where each row ends, the last piece of it not included, for rows that
 * each fill `room`.
 */
export const breaksOf = (
  pieces: ReadonlyArray<Piece>,
  room: number,
): ReadonlyArray<number> => {
  const count = pieces.length;
  const best = new Float64Array(count + 1).fill(never);
  const cameFrom = new Int32Array(count + 1);
  best[0] = 0;
  for (let to = 1; to <= count; to += 1) {
    const row = lastRow(pieces, to, room, best);
    best[to] = row.cost;
    cameFrom[to] = row.from;
  }
  const ends: Array<number> = [];
  let at = count;
  while (at > 0) {
    ends.push(at);
    at = cameFrom[at] ?? 0;
  }
  return ends.reverse();
};
