import { samplePicture } from '../data/sample.ts';
import { arrange, settleAll } from './arrange.ts';
import {
  type Content,
  type Frame,
  makeTable,
  type Size,
  type Table,
} from './table.ts';

// A made-up table for the tests of what lies on it and how it moves.

/** The shapes photos come in: across, upright, wide and square. */
const shapes = [
  { width: 3000, height: 2000 },
  { width: 3000, height: 2000 },
  { width: 2000, height: 3000 },
  { width: 3200, height: 1800 },
  { width: 3000, height: 2000 },
  { width: 2400, height: 2400 },
  { width: 2800, height: 2100 },
] as const;

export const sampleFrame = (id: string, at = 0): Frame => ({
  id,
  picture: samplePicture(id, shapes[at % shapes.length]),
  isLit: true,
  number: at + 1,
  time: '10:00',
  score: null,
  crop: null,
  isFavorite: false,
  marks: [],
  isWorkedOn: false,
  order: null,
  pile: 1,
  opened: null,
  isApart: false,
});

export const sampleIds = (many: number): ReadonlyArray<string> =>
  Array.from({ length: many }, (_, at) => `photo-${at}`);

/** Frames dealt out over a few sheets, in their order. */
export const sampleContent = (
  ids: ReadonlyArray<string>,
  shown: ReadonlyArray<string> = ids,
  sheets = 3,
): Content => {
  const perSheet = Math.ceil(ids.length / sheets);
  return Array.from({ length: sheets }, (_, sheet) => ({
    key: `day-${sheet}`,
    frames: shown
      .filter((id) => Math.floor(ids.indexOf(id) / perSheet) === sheet)
      .map((id) => sampleFrame(id, ids.indexOf(id))),
  })).filter(({ frames }) => frames.length > 0);
};

export const sampleSize: Size = {
  width: 1440,
  height: 900,
  top: 96,
  pinned: 44,
  foot: 0,
};

/** A table with frames of some height on it, lying still. */
export const sampleTable = (
  content: Content,
  zoom: number | 'fit',
  size: Size = sampleSize,
): Table => {
  const table = makeTable();
  table.size = size;
  table.content = content;
  table.zoom = zoom;
  arrange(table);
  settleAll(table);
  return table;
};
