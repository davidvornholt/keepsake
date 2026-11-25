import type { FolderList } from '../../contract.ts';

// The folders an album can be made of, as a list to choose from: the newest
// first, each folder with those below it, or only those that were searched
// for.

export type Folder = FolderList['folders'][number];

export type Row = {
  readonly folder: Folder;
  /** How many folders it lies in that are in the list above it. */
  readonly depth: number;
  /** How many folders with photos lie below it. */
  readonly below: number;
};

const yearOf = (iso: string): number => new Date(iso).getFullYear();

/** The years the photos of the folders are from, the latest first. */
export const yearsOf = (
  folders: ReadonlyArray<Folder>,
): ReadonlyArray<number> =>
  [...new Set(folders.flatMap(({ from, to }) => [yearOf(to), yearOf(from)]))]
    .filter((year) => !Number.isNaN(year))
    .toSorted((one, other) => other - one);

const isFrom = ({ from, to }: Folder, year: number): boolean =>
  yearOf(from) <= year && year <= yearOf(to);

const newestFirst = (folders: ReadonlyArray<Folder>): ReadonlyArray<Folder> =>
  folders.toSorted((one, other) => other.to.localeCompare(one.to));

/** The path of the folder a folder lies in. */
const outerOf = ({ path, name }: Folder): string =>
  path.slice(0, Math.max(0, path.length - name.length - 1));

/** Every word that was typed is somewhere in the name or in what it lies in. */
const matches = ({ name, within }: Folder, words: ReadonlyArray<string>) => {
  const whole = [...within, name].join(' ').toLowerCase();
  return words.every((word) => whole.includes(word));
};

export type Wanted = {
  /** What was typed to find a folder. */
  readonly search: string;
  readonly year: number | null;
};

/** How many folders with photos lie below a folder. */
const belowOf = (all: ReadonlyArray<Folder>, { path }: Folder): number =>
  all.filter((other) => other.path.startsWith(`${path}/`)).length;

const nested = (
  folders: ReadonlyArray<Folder>,
  all: ReadonlyArray<Folder>,
): ReadonlyArray<Row> => {
  const paths = new Set(folders.map(({ path }) => path));
  const sorted = newestFirst(folders);
  const inside = Map.groupBy(sorted, outerOf);
  const rowsOf = (
    level: ReadonlyArray<Folder>,
    depth: number,
  ): ReadonlyArray<Row> =>
    level.flatMap((folder) => [
      { folder, depth, below: belowOf(all, folder) },
      ...rowsOf(inside.get(folder.path) ?? [], depth + 1),
    ]);
  return rowsOf(
    sorted.filter((folder) => !paths.has(outerOf(folder))),
    0,
  );
};

const space = /\s+/u;

/**
 * The folders as they are listed. Without a search each folder is followed
 * by those below it; a search lists what it found, the newest first.
 */
export const rowsOf = (
  all: ReadonlyArray<Folder>,
  { search, year }: Wanted,
): ReadonlyArray<Row> => {
  const ofYear = year === null ? all : all.filter((one) => isFrom(one, year));
  const words = search.toLowerCase().split(space).filter(Boolean);
  if (words.length === 0) {
    return nested(ofYear, all);
  }
  return newestFirst(ofYear.filter((folder) => matches(folder, words))).map(
    (folder) => ({ folder, depth: 0, below: 0 }),
  );
};
