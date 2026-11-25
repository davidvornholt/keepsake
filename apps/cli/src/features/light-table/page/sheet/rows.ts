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

/** The cheapest way to break the first pieces into rows, for every count of them. */
type Plan = { readonly best: Float64Array; readonly cameFrom: Int32Array };

const planOf = (pieces: ReadonlyArray<Piece>, room: number): Plan => {
  const count = pieces.length;
  const best = new Float64Array(count + 1).fill(never);
  const cameFrom = new Int32Array(count + 1);
  best[0] = 0;
  for (let to = 1; to <= count; to += 1) {
    const row = lastRow(pieces, to, room, best);
    best[to] = row.cost;
    cameFrom[to] = row.from;
  }
  return { best, cameFrom };
};

/** Where the rows of the first `count` pieces end. */
const endsOf = ({ cameFrom }: Plan, count: number): Array<number> => {
  const ends: Array<number> = [];
  let at = count;
  while (at > 0) {
    ends.push(at);
    at = cameFrom[at] ?? 0;
  }
  return ends.reverse();
};

/**
 * Where each row ends, the last piece of it not included, for rows that
 * each fill `room`.
 */
export const breaksOf = (
  pieces: ReadonlyArray<Piece>,
  room: number,
): ReadonlyArray<number> => endsOf(planOf(pieces, room), pieces.length);

/** A piece that is to stay where it is across the sheet. */
export type Held = {
  readonly at: number;
  /** The point of it that is held, from 0 at its left to 1 at its right. */
  readonly share: number;
  /** Where that point is wanted, from the left of the room. */
  readonly x: number;
};

/** The same pieces from the last to the first. */
const backwards = (pieces: ReadonlyArray<Piece>): ReadonlyArray<Piece> =>
  pieces
    .map(({ width }, at) => ({ width, before: pieces[at + 1]?.before ?? 0 }))
    .reverse();

/** What the held row costs when it is much taller or lower than it was asked for. */
const oddRow = 1e6;
/** What a piece being off its place costs, against a row being off its height. */
const heldWeight = 600;
/** The row of the held piece stays this close to the height asked for. */
const heldLeast = 0.8;
const heldMost = 1.25;

/** The widths and gaps of all pieces before each one, summed up. */
const sumsOf = (pieces: ReadonlyArray<Piece>) => {
  const widths = new Float64Array(pieces.length + 1);
  const gaps = new Float64Array(pieces.length + 1);
  for (const [at, piece] of pieces.entries()) {
    widths[at + 1] = (widths[at] ?? 0) + piece.width;
    gaps[at + 1] = (gaps[at] ?? 0) + piece.before;
  }
  const between = (from: number, to: number) => ({
    frames: (widths[to] ?? 0) - (widths[from] ?? 0),
    // The gap before the first piece of a row isn't part of it.
    gaps: to > from + 1 ? (gaps[to] ?? 0) - (gaps[from + 1] ?? 0) : 0,
  });
  return { between };
};

/** What the rows around a held piece are chosen by. */
type Holding = {
  readonly pieces: ReadonlyArray<Piece>;
  readonly room: number;
  readonly held: Held;
  /** How wide the held piece is. */
  readonly width: number;
  readonly between: ReturnType<typeof sumsOf>['between'];
  /** The best rows before any piece, and, from the end, after it. */
  readonly before: Plan;
  readonly after: Plan;
};

type HeldRow = {
  readonly cost: number;
  readonly from: number;
  readonly to: number;
};

/** The best row that holds the piece and begins at one piece. */
const heldRowFrom = (
  from: number,
  lead: ReturnType<Holding['between']>,
  { pieces, room, held, width, between, before, after }: Holding,
): HeldRow => {
  const count = pieces.length;
  let best: HeldRow = { cost: never, from, to: held.at + 1 };
  for (let to = held.at + 1; to <= count; to += 1) {
    const row = between(from, to);
    if (to > from + 1 && row.frames + row.gaps > room * widest) {
      break;
    }
    const scale = scaleOf(row.frames, row.gaps, room);
    const x = scale * (lead.frames - width * (1 - held.share)) + lead.gaps;
    const off = (x - held.x) / room;
    // A row that no longer looks like its neighbours is the last resort.
    const isOdd = scale < heldLeast || scale > heldMost;
    const cost =
      (before.best[from] ?? 0) +
      costOf(scale) +
      (after.best[count - to] ?? 0) +
      heldWeight * off * off +
      (isOdd ? oddRow : 0);
    if (cost < best.cost) {
      best = { cost, from, to };
    }
  }
  return best;
};

/**
 * Where each row ends when one piece is to keep its place across the sheet:
 * its row is chosen so that it moves as little as it can, and the rows
 * before and after are broken as well as they can be around it.
 */
export const breaksHolding = (
  pieces: ReadonlyArray<Piece>,
  room: number,
  held: Held,
): ReadonlyArray<number> => {
  const count = pieces.length;
  const piece = pieces[held.at];
  if (piece === undefined) {
    return breaksOf(pieces, room);
  }
  const holding: Holding = {
    pieces,
    room,
    held,
    width: piece.width,
    between: sumsOf(pieces).between,
    before: planOf(pieces, room),
    after: planOf(backwards(pieces), room),
  };
  let best: HeldRow = { cost: never, from: held.at, to: held.at + 1 };
  for (let from = held.at; from >= 0; from -= 1) {
    const lead = holding.between(from, held.at + 1);
    if (from < held.at && lead.frames + lead.gaps > room * widest) {
      break;
    }
    const row = heldRowFrom(from, lead, holding);
    if (row.cost < best.cost) {
      best = row;
    }
  }
  const behind = endsOf(holding.after, count - best.to)
    .slice(0, -1)
    .map((end) => count - end)
    .reverse();
  return [
    ...endsOf(holding.before, best.from),
    best.to,
    ...behind,
    ...(best.to < count ? [count] : []),
  ];
};
