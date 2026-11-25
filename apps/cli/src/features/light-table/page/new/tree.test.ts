import { describe, expect, it } from 'bun:test';
import { type Folder, rowsOf, yearsOf } from './tree.ts';

const folder = (
  path: string,
  from: string,
  to: string,
  photos = 10,
): Folder => {
  const parts = path.split('/');
  return {
    path,
    name: parts.at(-1) ?? path,
    within: parts.slice(0, -1),
    photos,
    from: `${from}T08:00:00.000Z`,
    to: `${to}T18:00:00.000Z`,
    shoot: null,
  };
};

const folders = [
  folder('2025', '2025-08-12', '2025-10-06', 52),
  folder('2025/2025-08-12 Alps', '2025-08-12', '2025-08-14', 40),
  folder('2025/2025-10-06 Old town', '2025-10-06', '2025-10-06', 12),
  folder('2025/2025-10-06 Old town/raw', '2025-10-06', '2025-10-06', 12),
  folder('2026/2026-03-31 Gardens', '2026-03-31', '2026-04-01', 80),
  folder('Camera', '2025-12-30', '2026-01-02', 12),
];

const names = (rows: ReturnType<typeof rowsOf>) =>
  rows.map(({ folder: { name }, depth }) => `${'  '.repeat(depth)}${name}`);

describe('rowsOf', () => {
  it('lists the newest first, each folder followed by those below it', () => {
    expect(names(rowsOf(folders, { search: '', year: null }))).toEqual([
      '2026-03-31 Gardens',
      'Camera',
      '2025',
      '  2025-10-06 Old town',
      '    raw',
      '  2025-08-12 Alps',
    ]);
  });

  it('says how many folders with photos lie below one', () => {
    const rows = rowsOf(folders, { search: '', year: null });
    const below = new Map(rows.map((row) => [row.folder.path, row.below]));
    expect(below.get('2025')).toBe(3);
    expect(below.get('2025/2025-10-06 Old town')).toBe(1);
    expect(below.get('Camera')).toBe(0);
  });

  it('lists what a search found without the folders around it', () => {
    expect(
      names(rowsOf(folders, { search: ' old  TOWN ', year: null })),
    ).toEqual(['2025-10-06 Old town', 'raw']);
    // Every word has to be there, in the name or in what it lies in.
    expect(names(rowsOf(folders, { search: '2025 alps', year: null }))).toEqual(
      ['2025-08-12 Alps'],
    );
    expect(rowsOf(folders, { search: 'harbor', year: null })).toEqual([]);
  });

  it('lists the folders with photos of one year', () => {
    expect(names(rowsOf(folders, { search: '', year: 2026 }))).toEqual([
      '2026-03-31 Gardens',
      'Camera',
    ]);
    expect(names(rowsOf(folders, { search: 'camera', year: 2025 }))).toEqual([
      'Camera',
    ]);
  });
});

describe('yearsOf', () => {
  it('lists the years there are photos of, the latest first', () => {
    expect(yearsOf(folders)).toEqual([2026, 2025]);
    expect(yearsOf([])).toEqual([]);
  });
});
