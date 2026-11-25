import { describe, expect, it } from 'bun:test';
import { samplePicture } from '../data/sample.ts';
import {
  advance,
  arrange,
  reveal,
  settleAll,
  zoomNow,
  zoomTo,
} from './arrange.ts';
import {
  anchorAt,
  type Content,
  type Frame,
  fitOf,
  frameLimits,
  inSight,
  makeTable,
  onScreen,
  restingOnScreen,
  scrollLimits,
  type Table,
} from './table.ts';

const frameOf = (id: string): Frame => ({
  id,
  picture: samplePicture(id),
  isLit: true,
  isMomentStart: true,
  number: 1,
  time: '10:00',
  score: null,
  crop: null,
  isFavorite: false,
  marks: [],
  isWorkedOn: false,
});

const many = 120;
const sheets = 3;
const ids = Array.from({ length: many }, (_, at) => `photo-${at}`);

const contentOf = (shown: ReadonlyArray<string>): Content =>
  Array.from({ length: sheets }, (_, sheet) => ({
    key: `day-${sheet}`,
    frames: shown
      .filter((id) => ids.indexOf(id) % sheets === sheet)
      .map(frameOf),
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
    zoomTo(table, 1, null);
    advance(table, oneFrame, true);
    expect(table.frame.value).toBe(fitOf(table));
    reveal(table, 'photo-9');
    advance(table, oneFrame, true);
    expect(table.scroller.target).toBeNull();
  });
});

describe('zooming', () => {
  it('keeps the frame under the pointer where it is', () => {
    const table = tableWith();
    // Far enough down that the top of the table doesn't hold it back.
    table.scroller.value = size.height;
    const anchor = anchorAt(table, size.width / 2, size.height / 2);
    expect(anchor).not.toBeNull();
    if (anchor === null) {
      return;
    }
    const pointAt = () => {
      const rect = onScreen(table, anchor.id);
      return rect === null ? null : rect.y + rect.h * anchor.within;
    };
    const smaller = 0.8;
    zoomNow(table, smaller, anchor);
    expect(table.frame.value).toBeCloseTo(large * smaller);
    rest(table);
    expect(pointAt()).toBeCloseTo(anchor.screenY, 0);
  });

  it('stops where everything fits, and calls that the fit', () => {
    const table = tableWith();
    const { least, most } = frameLimits(table);
    expect(least).toBe(fitOf(table));
    zoomTo(table, 1, null);
    expect(table.zoom).toBe('fit');
    rest(table);
    expect(table.frame.value).toBeCloseTo(least);
    expect(scrollLimits(table).most).toBe(0);
    expect(inSight(table)).toHaveLength(many);
    zoomTo(table, most * 2, null);
    expect(table.frame.target).toBe(most);
  });
});

describe('reveal', () => {
  it('scrolls as little as needed to have a frame in sight', () => {
    const table = tableWith();
    const last = `photo-${many - 1}`;
    reveal(table, 'photo-0');
    expect(table.scroller.target).toBeNull();
    reveal(table, last, true);
    const rect = onScreen(table, last);
    expect(rect).not.toBeNull();
    expect((rect?.y ?? 0) + (rect?.h ?? 0)).toBeLessThanOrEqual(size.height);
    expect(rect?.y).toBeGreaterThanOrEqual(size.top);
    expect(inSight(table).some((placed) => placed.frame.id === last)).toBe(
      true,
    );
  });
});
