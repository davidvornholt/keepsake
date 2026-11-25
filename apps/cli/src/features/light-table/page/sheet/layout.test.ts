import { describe, expect, it } from 'bun:test';
import { type Group, layOut, measureOf } from './layout.ts';

const landscape = 3 / 2;
const upright = 2 / 3;

const group = (key: string, count: number, aspect = landscape): Group => ({
  key,
  items: Array.from({ length: count }, (_, index) => ({
    id: `${key}${index}`,
    aspect,
    isMomentStart: index % 3 === 0,
  })),
});

const endOf = (layout: ReturnType<typeof layOut>, at: number): number => {
  const rect = layout.rects.get(layout.order[at] ?? '');
  return rect === undefined ? 0 : rect.x + rect.w;
};

describe('layOut', () => {
  it('runs the frames in rows that stay on the sheet', () => {
    const layout = layOut([group('a', 40)], 600, 40);
    const { margin, inset } = layout.measure;
    expect(layout.order).toHaveLength(40);
    expect(layout.rows.length).toBeGreaterThan(1);
    for (const rect of layout.rects.values()) {
      expect(rect.w / rect.h).toBeCloseTo(1.5);
      expect(rect.x).toBeGreaterThanOrEqual(margin + inset);
      expect(rect.x + rect.w).toBeLessThanOrEqual(600 - margin - inset + 0.001);
    }
    const last = layout.rows.at(-1);
    expect(last?.to).toBe(40);
    expect(layout.height).toBeGreaterThan((last?.top ?? 0) + 40);
  });

  it('makes every row as wide as the sheet, the last one too', () => {
    for (const count of [23, 40, 41]) {
      const layout = layOut([group('a', count)], 600, 40);
      const { margin, inset } = layout.measure;
      for (const row of layout.rows) {
        expect(endOf(layout, row.to - 1)).toBeCloseTo(600 - margin - inset);
        expect(row.height).toBeGreaterThan(40 * 0.74);
        expect(row.height).toBeLessThan(40 * 1.42);
      }
    }
  });

  it('lays each row below the one before', () => {
    const layout = layOut([group('a', 40)], 600, 40);
    for (const [at, row] of layout.rows.slice(1).entries()) {
      const above = layout.rows[at];
      expect(row.top).toBeGreaterThanOrEqual(
        (above?.top ?? 0) + (above?.height ?? 0),
      );
    }
  });

  it('leaves more room between two moments than within one', () => {
    const layout = layOut([group('a', 5)], 2000, 100);
    const rect = (id: string) => layout.rects.get(id) ?? { x: 0, w: 0 };
    const within = rect('a1').x - rect('a0').x - rect('a0').w;
    const between = rect('a3').x - rect('a2').x - rect('a2').w;
    expect(between).toBeGreaterThan(within);
    expect(layout.measure.hasEdgePrint).toBe(true);
    expect(measureOf(20).momentGap).toBe(measureOf(20).gap);
  });

  it('gives every long group its own sheet below the one before', () => {
    const layout = layOut([group('a', 30), group('b', 30, upright)], 800, 60, {
      top: 50,
    });
    const [first, second] = layout.sheets;
    expect(first?.paper.y).toBeGreaterThanOrEqual(50);
    expect(second?.paper.y).toBeGreaterThanOrEqual(
      (first?.paper.y ?? 0) + (first?.paper.h ?? 0),
    );
    expect(first?.paper.w).toBe(second?.paper.w ?? 0);
    expect(layout.rects.get('b0')?.y).toBe(
      (second?.head.y ?? 0) + (second?.head.h ?? 0),
    );
  });

  it('lays out nothing at all', () => {
    const layout = layOut([], 800, 60);
    expect(layout.order).toEqual([]);
    expect(layout.sheets).toEqual([]);
  });
});

describe('a sheet with too few frames for a row', () => {
  it('lies there larger, and its paper ends where its frames do', () => {
    const layout = layOut([group('a', 2)], 1200, 100);
    const { margin, inset } = layout.measure;
    const [sheet] = layout.sheets;
    const tall = layout.rects.get('a0')?.h ?? 0;
    expect(tall).toBeGreaterThan(100);
    expect(tall).toBeLessThanOrEqual(160);
    expect(sheet?.paper.x).toBe(margin);
    expect((sheet?.paper.x ?? 0) + (sheet?.paper.w ?? 0)).toBeCloseTo(
      endOf(layout, 1) + inset,
    );
    expect(sheet?.paper.w).toBeLessThan(1200 - margin * 2);
  });

  it('fills the table when it nearly does', () => {
    const layout = layOut([group('a', 6)], 1200, 100);
    const { margin, inset } = layout.measure;
    expect(layout.rows).toHaveLength(1);
    expect(endOf(layout, 5)).toBeCloseTo(1200 - margin - inset);
  });

  it('gets no taller than the table allows', () => {
    const layout = layOut([group('a', 1)], 1200, 300, { tallest: 320 });
    expect(layout.rects.get('a0')?.h).toBeCloseTo(320);
  });

  it('shares a line with its neighbours, all at one height', () => {
    const layout = layOut(
      [group('a', 2), group('b', 3), group('c', 40)],
      1200,
      100,
    );
    const { margin } = layout.measure;
    const [first, second, third] = layout.sheets;
    expect(second?.paper.y).toBe(first?.paper.y ?? -1);
    expect(second?.paper.h).toBe(first?.paper.h ?? -1);
    expect(second?.paper.x).toBeCloseTo(
      (first?.paper.x ?? 0) + (first?.paper.w ?? 0) + margin,
    );
    expect((second?.paper.x ?? 0) + (second?.paper.w ?? 0)).toBeCloseTo(
      1200 - margin,
    );
    expect(layout.rects.get('b0')?.h).toBe(layout.rects.get('a0')?.h ?? 0);
    expect(third?.paper.y).toBeGreaterThan(
      (first?.paper.y ?? 0) + (first?.paper.h ?? 0),
    );
  });

  it('is never narrower than its heading needs', () => {
    const layout = layOut([group('a', 1, upright), group('b', 40)], 1200, 30);
    expect(layout.sheets[0]?.paper.w).toBeGreaterThanOrEqual(150);
  });

  it('stays on a table narrower than a sheet gets', () => {
    const layout = layOut([group('a', 1), group('b', 1)], 120, 30);
    for (const { paper } of layout.sheets) {
      expect(paper.x + paper.w).toBeLessThanOrEqual(120);
    }
    expect(layout.sheets[1]?.paper.y).toBeGreaterThan(
      layout.sheets[0]?.paper.y ?? 0,
    );
  });
});
