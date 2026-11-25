// Folders of made-up photos, of which the page makes new albums.
import { utimes } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { drawn } from './pictures.ts';

type Folder = {
  /** Where it is below the folder with all photos. */
  readonly path: string;
  /** The day its photos were taken. */
  readonly day: string;
  readonly photos: number;
  readonly seed: number;
};

export const folders: ReadonlyArray<Folder> = [
  { path: '2026/2026-10-03 Coimbra', day: '2026-10-03', photos: 8, seed: 21 },
  { path: '2026/2026-10-18 Tavira', day: '2026-10-18', photos: 5, seed: 34 },
  { path: '2025/2025-09-06 Sintra', day: '2025-09-06', photos: 6, seed: 47 },
];

const size = { width: 480, height: 320 };
const firstHour = 9;
const minutesApart = 7;
const pad = (value: number) => String(value).padStart(2, '0');

/** A photo's file: the day and the time it was taken, as its name. */
const fileOf = (day: string, index: number) => {
  const minutes = index * minutesApart;
  const hour = firstHour + Math.floor(minutes / 60);
  return `${day} ${pad(hour)}.${pad(minutes % 60)}.jpg`;
};

const namePattern =
  /^(?<year>\d{4})-(?<month>\d\d)-(?<day>\d\d) (?<hour>\d\d)\.(?<minute>\d\d)\.jpg$/u;

/** When a photo written here was taken, the way exiftool says it. */
export const takenAt = (file: string): string => {
  const found = namePattern.exec(basename(file))?.groups;
  return found === undefined
    ? '2026:01:01 00:00:00.000'
    : `${found.year}:${found.month}:${found.day} ${found.hour}:${found.minute}:00.000`;
};

/** Writes the folders below one folder, each photo as old as it says. */
export const writeFolders = (root: string) =>
  Promise.all(
    folders.flatMap(({ path, day, photos, seed }) =>
      Array.from({ length: photos }, async (_, index) => {
        const file = join(root, path, fileOf(day, index));
        await Bun.write(
          file,
          new Uint8Array(
            drawn({ ...size, seed: seed + index, look: 'camera' }),
          ),
        );
        const taken = new Date(`${day}T${pad(firstHour)}:00:00Z`);
        await utimes(file, taken, taken);
      }),
    ),
  );
