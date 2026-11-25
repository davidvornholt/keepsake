import { describe, expect, it } from 'bun:test';
import { advance } from './arrange.ts';
import {
  type Held,
  heldAt,
  onScreen,
  scrollLimits,
  stopsFor,
  type Table,
} from './table.ts';
import { sampleContent, sampleIds, sampleTable } from './table-sample.ts';
import { letGo, zoomByHand, zoomToStop } from './zooming.ts';

const ids = sampleIds(600);
const oneFrame = 1 / 60;
const longest = 600;
/** How long the frames may take to lie still once the hand has let go. */
const settledWithin = 0.25;
/** How far the held point may be from where it is held, in pixels. */
const heldWithin = 0.5;
const steps = 50;

/** A table scrolled to its middle, with frames at one of its stops. */
const tableAt = (stop: number): Table => {
  const fit = sampleTable(sampleContent(ids), 'fit');
  const table = sampleTable(
    sampleContent(ids),
    stop === 0 ? 'fit' : (stopsFor(fit)[stop] ?? 'fit'),
  );
  table.scroller.value = scrollLimits(table).most / 2;
  advance(table, oneFrame);
  return table;
};

const pointOf = (table: Table, held: Held) => {
  const rect = onScreen(table, held.id);
  return rect === null
    ? { x: Number.NaN, y: Number.NaN }
    : { x: rect.x + rect.w * held.share, y: rect.y + rect.h * held.within };
};

/**
 * Lets the table move until it lies still. Says how many seconds the frames
 * took to have their size; the bars may take longer to come back.
 */
const rest = (table: Table): number => {
  let frames = 0;
  let sized = 0;
  while (advance(table, oneFrame) && frames < longest) {
    frames += 1;
    sized += table.zooming === null ? 0 : 1;
  }
  return sized * oneFrame;
};

const holdAt = (table: Table, x: number, y: number): Held => {
  const held = heldAt(table, x, y);
  if (held === null) {
    throw new Error('Nothing lies there.');
  }
  return held;
};

/** How far the held frame is from where it is held in the layout shown. */
const forcedAside = (table: Table, held: Held): number => {
  const rect = table.layout.rects.get(held.id);
  return rect === undefined
    ? Number.NaN
    : Math.abs(rect.x + rect.w * held.share - held.x);
};

/** How much of the window the table leaves empty at its sides, beyond being smaller. */
const emptyAside = ({ view, size }: Table): number => {
  const spare = size.width * (1 - view.k);
  return Math.max(0, Math.min(0, spare) - view.x, view.x - Math.max(0, spare));
};

/**
 * Changes the size by hand, a little each frame. Says how far the held
 * point strayed up or down, how much further aside than its rows forced it,
 * and how much of the window was left empty.
 */
const pinch = (table: Table, held: Held, to: number) => {
  const from = table.frame.value;
  let height = 0;
  let aside = 0;
  let empty = 0;
  for (let at = 1; at <= steps; at += 1) {
    zoomByHand(table, held, from * (to / from) ** (at / steps));
    advance(table, oneFrame);
    const point = pointOf(table, held);
    height = Math.max(height, Math.abs(point.y - held.y));
    aside = Math.max(
      aside,
      Math.abs(point.x - held.x) - forcedAside(table, held),
    );
    empty = Math.max(empty, emptyAside(table));
  }
  return { height, aside, empty };
};

const places: ReadonlyArray<readonly [number, number]> = [
  [720, 500],
  [200, 300],
  [1300, 700],
  [50, 450],
];
const ways: ReadonlyArray<readonly [number, number]> = [
  [1, 5],
  [5, 1],
  [2, 3],
  [6, 9],
];

describe('changing the size of the frames by hand', () => {
  it('keeps the held point at its height, and aside no further than its rows force it', () => {
    for (const [x, y] of places) {
      for (const [from, to] of ways) {
        const table = tableAt(from);
        const held = holdAt(table, x, y);
        const goal = (stopsFor(table)[to] ?? 1) * 1.07;
        const strayed = pinch(table, held, goal);
        expect(strayed.height).toBeLessThan(heldWithin);
        expect(strayed.aside).toBeLessThan(heldWithin);
        expect(strayed.empty).toBe(0);
      }
    }
  });

  it('holds the point exactly halfway between two stops, where the layouts change', () => {
    const table = tableAt(4);
    const held = holdAt(table, 720, 500);
    const stops = stopsFor(table);
    zoomByHand(table, held, Math.sqrt((stops[4] ?? 1) * (stops[5] ?? 1)));
    advance(table, oneFrame);
    const point = pointOf(table, held);
    expect(Math.abs(point.x - held.x)).toBeLessThan(heldWithin);
    expect(Math.abs(point.y - held.y)).toBeLessThan(heldWithin);
  });

  it('comes to rest at a stop a quarter of a second after it was let go', () => {
    for (const [x, y] of places) {
      for (const [from, to] of ways) {
        const table = tableAt(from);
        const stops = stopsFor(table);
        pinch(table, holdAt(table, x, y), (stops[to] ?? 1) * 1.07);
        letGo(table);
        expect(rest(table)).toBeLessThanOrEqual(settledWithin);
        expect(table.zooming).toBeNull();
        expect(table.frame.value).toBe(stops[to] ?? 0);
        expect(table.view).toEqual({ k: 1, x: 0, y: -table.scroller.value });
      }
    }
  });

  it('never shows the frames larger or smaller than the hand has them', () => {
    const table = tableAt(2);
    const held = holdAt(table, 720, 500);
    const stops = stopsFor(table);
    const goal = (stops[5] ?? 1) * 0.95;
    pinch(table, held, goal);
    letGo(table);
    const target = stops[5] ?? 0;
    let most = table.frame.value;
    let frames = 0;
    while (advance(table, oneFrame) && frames < longest) {
      frames += 1;
      // On the way to the stop, and never past it.
      expect(table.frame.value).toBeGreaterThanOrEqual(most);
      expect(table.frame.value).toBeLessThanOrEqual(target);
      most = table.frame.value;
    }
  });

  it('shows one layout, or two while one comes in over the other', () => {
    const table = tableAt(1);
    const held = holdAt(table, 720, 500);
    const from = table.frame.value;
    const to = stopsFor(table)[6] ?? from;
    let fades = 0;
    for (let at = 1; at <= steps; at += 1) {
      zoomByHand(table, held, from * (to / from) ** (at / steps));
      advance(table, oneFrame);
      fades += table.ghost === null ? 0 : 1;
      // Every frame lies exactly where the one layout shown has it.
      for (const [id, placed] of table.placed) {
        const rect = table.layout.rects.get(id);
        expect(placed.x.value).toBe(rect?.x ?? Number.NaN);
        expect(placed.h.value).toBe(rect?.h ?? Number.NaN);
      }
      expect(table.fade).toBeGreaterThan(0);
    }
    expect(fades).toBeGreaterThan(0);
    letGo(table);
    rest(table);
    expect(table.ghost).toBeNull();
    expect(table.fade).toBe(1);
  });
});

describe('going from stop to stop, as the keys do', () => {
  it('is back where it began after going out and in again', () => {
    for (const start of [2, 4, 7]) {
      const table = tableAt(start);
      const before = {
        scroll: table.scroller.value,
        rect: onScreen(table, 'photo-300'),
      };
      const middle = () => holdAt(table, 720, 500);
      for (const stop of [start - 2, start + 2, start + 4, start]) {
        zoomToStop(table, middle(), stop, true);
        expect(rest(table)).toBeLessThanOrEqual(settledWithin);
      }
      expect(table.stop).toBe(start);
      expect(table.scroller.value).toBeCloseTo(before.scroll, 6);
      expect(onScreen(table, 'photo-300')).toEqual(before.rect);
    }
  });

  it('keeps the middle of what is seen at its height the whole way', () => {
    const table = tableAt(3);
    const held = holdAt(table, 720, 500);
    zoomToStop(table, held, 5, true);
    let strayed = 0;
    let frames = 0;
    while (advance(table, oneFrame) && frames < longest) {
      frames += 1;
      strayed = Math.max(strayed, Math.abs(pointOf(table, held).y - held.y));
    }
    expect(strayed).toBeLessThan(heldWithin);
  });

  it('is there at once for those who asked for less motion', () => {
    const table = tableAt(3);
    zoomToStop(table, holdAt(table, 720, 500), 6, true);
    advance(table, oneFrame, true);
    expect(table.zooming).toBeNull();
    expect(table.stop).toBe(6);
    expect(table.frame.value).toBe(stopsFor(table)[6] ?? 0);
  });

  it('stops at the smallest and the largest size', () => {
    const table = tableAt(1);
    const stops = stopsFor(table);
    zoomToStop(table, holdAt(table, 720, 500), -3, true);
    rest(table);
    expect(table.stop).toBe(0);
    expect(table.zoom).toBe('fit');
    zoomToStop(table, holdAt(table, 720, 500), stops.length + 3, true);
    rest(table);
    expect(table.stop).toBe(stops.length - 1);
  });
});

describe('the smallest size', () => {
  it('shows everything at once, whichever frame was held on the way there', () => {
    // Few enough that all of them fit the window.
    const few = sampleIds(120);
    for (const [x, y] of places) {
      const fit = sampleTable(sampleContent(few), 'fit');
      expect(scrollLimits(fit).most).toBe(0);
      const table = sampleTable(sampleContent(few), stopsFor(fit)[4] ?? 'fit');
      zoomToStop(table, holdAt(table, x, y), 0);
      rest(table);
      expect(table.zoom).toBe('fit');
      // Rows that break for the held frame would make the table longer.
      expect(scrollLimits(table).most).toBe(0);
    }
  });
});
