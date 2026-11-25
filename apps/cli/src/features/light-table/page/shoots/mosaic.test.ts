import { describe, expect, it } from 'bun:test';
import { mosaicOf, rowHeightIn } from './mosaic.ts';

const cover = (name: string, width = 3000, height = 2000) => ({
  src: `/pictures/${name}`,
  width,
  height,
  placeholder: '',
});

const covers = (count: number) =>
  Array.from({ length: count }, (_, at) =>
    at % 4 === 0 ? cover(`c${at}`, 2000, 3000) : cover(`c${at}`),
  );

const look = { rowHeight: 170, gap: 3 };
const box = { width: 1250, height: 690 };

const rowsOf = (tiles: ReturnType<typeof mosaicOf>) => [
  ...Map.groupBy(tiles, ({ y }) => Math.round(y)).values(),
];

describe('mosaicOf', () => {
  it('fills the box from edge to edge', () => {
    const tiles = mosaicOf(covers(60), box, look);
    const rows = rowsOf(tiles);
    expect(rows).toHaveLength(4);
    for (const row of rows) {
      const last = row.at(-1);
      expect(row[0]?.x).toBe(0);
      expect((last?.x ?? 0) + (last?.w ?? 0)).toBeCloseTo(box.width);
    }
    const lowest = tiles.at(-1);
    expect((lowest?.y ?? 0) + (lowest?.h ?? 0)).toBeCloseTo(box.height);
  });

  it('shows the first covers, in their order, and only as many as fit', () => {
    const tiles = mosaicOf(covers(60), box, look);
    expect(tiles.length).toBeLessThan(40);
    expect(tiles.length).toBeGreaterThan(12);
    expect(tiles.map(({ key }) => key)).toEqual(
      covers(tiles.length).map(({ src }) => src),
    );
  });

  it('cuts little off a picture', () => {
    for (const { picture, w, h } of mosaicOf(covers(60), box, look)) {
      const aspect = (picture?.width ?? 3) / (picture?.height ?? 2);
      expect(w / h / aspect).toBeGreaterThan(0.7);
      expect(w / h / aspect).toBeLessThan(1.4);
    }
  });

  it('lays fewer and taller rows when there are few covers', () => {
    const rows = rowsOf(mosaicOf(covers(7), box, look));
    expect(rows.length).toBeLessThan(4);
    expect(rows.flat().every(({ picture }) => picture !== null)).toBe(true);
  });

  it('ends a row with blank frames when the covers run out', () => {
    const tiles = mosaicOf([cover('a')], { width: 1200, height: 150 }, look);
    expect(tiles[0]?.picture).not.toBeNull();
    expect(tiles.slice(1).every(({ picture }) => picture === null)).toBe(true);
    expect(tiles.length).toBeGreaterThan(3);
    expect(
      mosaicOf([], { width: 1200, height: 150 }, look).length,
    ).toBeGreaterThan(3);
  });

  it('shows a few covers wider before it leaves frames blank', () => {
    const tiles = mosaicOf(covers(8), { width: 1880, height: 110 }, look);
    const last = tiles.at(-1);
    expect(tiles).toHaveLength(8);
    expect(tiles.every(({ picture }) => picture !== null)).toBe(true);
    expect((last?.x ?? 0) + (last?.w ?? 0)).toBeCloseTo(1880);
    const [alone, blank] = mosaicOf(
      [cover('a')],
      { width: 1200, height: 150 },
      look,
    );
    expect(alone?.w).toBeGreaterThan(blank?.w ?? 0);
  });

  it('is one strip in a low box', () => {
    const tiles = mosaicOf(covers(60), { width: 1250, height: 100 }, look);
    expect(rowsOf(tiles)).toHaveLength(1);
  });

  it('lays nothing in a box without a size', () => {
    expect(mosaicOf(covers(5), { width: 0, height: 0 }, look)).toEqual([]);
  });
});

describe('rowHeightIn', () => {
  it('gives a window a few rows, and a narrow one two photos across', () => {
    expect(rowHeightIn({ width: 1280, height: 800 })).toBeCloseTo(800 / 4.4);
    expect(rowHeightIn({ width: 412, height: 915 })).toBeCloseTo(412 / 2.4);
    expect(rowHeightIn({ width: 2560, height: 1440 })).toBe(250);
    expect(rowHeightIn({ width: 300, height: 300 })).toBe(96);
  });
});
