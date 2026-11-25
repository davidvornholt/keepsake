import { describe, expect, it } from 'bun:test';
import { advance, arrange, reveal, settleAll } from './arrange.ts';
import {
  type Content,
  fitOf,
  frameLimits,
  type Held,
  heldAt,
  inSight,
  makeTable,
  onScreen,
  restingOnScreen,
  scrollLimits,
  stopsFor,
  type Table,
} from './table.ts';
import { sampleFrame } from './table-sample.ts';
import { zoomToStop } from './zooming.ts';

const many = 120;
const sheets = 3;
const ids = Array.from({ length: many }, (_, at) => `photo-${at}`);

const contentOf = (shown: ReadonlyArray<string>): Content =>
  Array.from({ length: sheets }, (_, sheet) => ({
    key: `day-${sheet}`,
    frames: shown
      .filter((id) => ids.indexOf(id) % sheets === sheet)
      .map((id) => sampleFrame(id)),
  })).filter(({ frames }) => frames.length > 0);

const size = { width: 1200, height: 800, top: 90, pinned: 90, foot: 0 };
const large = 240;
const oneFrame = 1 / 60;
const longest = 600;

/** A table with everything on it, the frames so large that it scrolls. */
const tableWith = (shown: ReadonlyArray<string> = ids): Table => {
  const table = makeTable();
  table.size = size;
  table.content = contentOf(shown);
  table.zoom = large;
  table.frame.value = large;
  table.frame.target = large;
  arrange(table);
  settleAll(table);
  return table;
};

/** The point of a frame that is held when no pointer holds one. */
const middleOf = (table: Table): Held => {
  const held = heldAt(table, size.width / 2, size.height / 2);
  if (held === null) {
    throw new Error('Nothing lies there.');
  }
  return held;
};

/** Lets the table move until it lies still, and says how many frames it took. */
const rest = (table: Table): number => {
  let frames = 0;
  while (advance(table, oneFrame) && frames < longest) {
    frames += 1;
  }
  return frames;
};

describe('arrange', () => {
  it('puts every frame on the table, and only some of them in sight', () => {
    const table = tableWith();
    expect(table.placed.size).toBe(many);
    expect(scrollLimits(table).most).toBeGreaterThan(0);
    const seen = inSight(table);
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.length).toBeLessThan(many);
    expect(onScreen(table, 'photo-0')).toEqual(
      restingOnScreen(table, 'photo-0'),
    );
  });

  it('lets a frame that is no longer shown fade away, then forgets it', () => {
    const table = tableWith();
    table.content = contentOf(ids.slice(1));
    arrange(table);
    expect(table.placed.get('photo-0')?.isLeaving).toBe(true);
    expect(rest(table)).toBeLessThan(longest);
    expect(table.placed.has('photo-0')).toBe(false);
    expect(table.placed.size).toBe(many - 1);
  });

  it('moves the others to their new places and comes to rest there', () => {
    const table = tableWith();
    const before = onScreen(table, 'photo-9');
    table.content = contentOf(ids.filter((_, at) => at % 2 === 1));
    arrange(table);
    expect(onScreen(table, 'photo-9')).toEqual(before);
    rest(table);
    expect(onScreen(table, 'photo-9')).toEqual(
      restingOnScreen(table, 'photo-9'),
    );
    expect(onScreen(table, 'photo-9')).not.toEqual(before);
  });
});

describe('for those who asked for less motion', () => {
  it('has the frames where they belong at once, and lets the others fade', () => {
    const table = tableWith();
    rest(table);
    const before = onScreen(table, 'photo-9');
    table.content = contentOf(ids.filter((_, at) => at % 2 === 1));
    arrange(table);
    expect(advance(table, oneFrame, true)).toBe(true);
    expect(onScreen(table, 'photo-9')).toEqual(
      restingOnScreen(table, 'photo-9'),
    );
    expect(onScreen(table, 'photo-9')).not.toEqual(before);
    expect(table.placed.get('photo-0')?.alpha.value).toBeGreaterThan(0);
    zoomToStop(table, middleOf(table), 0, true);
    advance(table, oneFrame, true);
    expect(table.frame.value).toBe(fitOf(table));
    expect(table.zooming).toBeNull();
    reveal(table, 'photo-9');
    advance(table, oneFrame, true);
    expect(table.scroller.target).toBeNull();
  });
});

describe('zooming', () => {
  it('stops where everything fits, and calls that the fit', () => {
    const table = tableWith();
    const { least, most } = frameLimits(table);
    expect(least).toBe(fitOf(table));
    expect(stopsFor(table)[0]).toBe(least);
    expect(stopsFor(table).at(-1)).toBe(most);
    zoomToStop(table, middleOf(table), 0, true);
    rest(table);
    expect(table.zoom).toBe('fit');
    expect(table.frame.value).toBeCloseTo(least);
    expect(scrollLimits(table).most).toBe(0);
    expect(inSight(table)).toHaveLength(many);
  });
});

describe('reveal', () => {
  it('scrolls as little as needed to have a frame in sight', () => {
    const table = tableWith();
    const last = `photo-${many - 1}`;
    reveal(table, 'photo-0');
    expect(table.scroller.target).toBeNull();
    reveal(table, last, true);
    advance(table, oneFrame);
    const rect = onScreen(table, last);
    expect(rect).not.toBeNull();
    expect((rect?.y ?? 0) + (rect?.h ?? 0)).toBeLessThanOrEqual(size.height);
    expect(rect?.y).toBeGreaterThanOrEqual(size.top);
    expect(inSight(table).some(({ placed }) => placed.frame.id === last)).toBe(
      true,
    );
  });
});
