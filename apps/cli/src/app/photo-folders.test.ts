import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { mkdir, rm, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import {
  fake,
  photosFolder,
  runOk,
  setUp,
  tearDown,
} from './command-fixtures.ts';
import { fakeTools } from './fake-tools.ts';
import { whileServing } from './light-table-fixtures.ts';

beforeEach(() => setUp(spyOn));
afterEach(tearDown);

const serving = <A>(visit: (address: string) => Promise<A>) =>
  whileServing(visit, { photos: [photosFolder()] });

const foldersOf = async (address: string) => {
  const response = await fetch(`${address}/api/folders`);
  return { status: response.status, ...(await response.json()) };
};

/** A folder with a photo of its own and a link to one outside the photos. */
const withLinkOutside = async () => {
  const trip = join(photosFolder(), 'trip');
  const outside = join(fake.home, 'private', 'secret.jpg');
  await Bun.write(join(trip, 'A.jpg'), 'a photo');
  await Bun.write(outside, 'a photo from elsewhere');
  await symlink(outside, join(trip, 'B.jpg'));
  return { trip, outside };
};

const lookAt = (folder: string) => async (address: string) =>
  (
    await fetch(
      `${address}/api/folders/look?path=${encodeURIComponent(folder)}`,
    )
  ).json();

const readOf = (file: string) =>
  fakeTools.runs.filter(({ args }) => args.some((arg) => arg.endsWith(file)));

/** Scans a folder into a new shoot. */
const scanFolder = (folder: string, ...args: ReadonlyArray<string>) =>
  runOk('scan', folder, '--title', 'Trip', ...args);

describe('the folders of photos on the page', () => {
  it('are listed when one has a photo that is gone', async () => {
    await Bun.write(join(photosFolder(), 'lisbon', 'A.jpg'), 'a photo');
    await mkdir(join(photosFolder(), 'porto'));
    await symlink(
      join(fake.home, 'nowhere.jpg'),
      join(photosFolder(), 'porto', 'A.jpg'),
    );
    const { status, folders } = await serving(foldersOf);
    expect(status).toBe(200);
    expect(folders.map(({ name }: { name: string }) => name)).toEqual([
      'lisbon',
    ]);
  });

  it('show no photo that a link takes from outside them', async () => {
    const { trip } = await withLinkOutside();
    const [{ folders }, look] = await serving(async (address) => [
      await foldersOf(address),
      await (
        await fetch(
          `${address}/api/folders/look?path=${encodeURIComponent(trip)}`,
        )
      ).json(),
    ]);
    expect(folders).toMatchObject([{ name: 'trip', photos: 1 }]);
    expect(look).toMatchObject({ photos: 1 });
    expect(look.samples).toHaveLength(1);
    expect(readOf('B.jpg')).toEqual([]);
  });

  it('show none of another folder that a link takes into one', async () => {
    const trip = join(photosFolder(), 'trip');
    await Bun.write(join(trip, 'A.jpg'), 'a photo');
    await Bun.write(join(photosFolder(), 'sibling', 'S.jpg'), 'a photo');
    await symlink(join(photosFolder(), 'sibling'), join(trip, 'other'));
    const look = await serving(lookAt(trip));
    expect(look.samples).toHaveLength(1);
    expect(readOf('S.jpg')).toEqual([]);
  });

  it('show no photo that became a link outside them since they were listed', async () => {
    const trip = join(photosFolder(), 'trip');
    const outside = join(fake.home, 'private', 'secret.jpg');
    await Bun.write(join(trip, 'A.jpg'), 'a photo');
    await Bun.write(join(trip, 'B.jpg'), 'a photo');
    await Bun.write(outside, 'a photo from elsewhere');
    const look = await serving(async (address) => {
      await foldersOf(address);
      await rm(join(trip, 'B.jpg'));
      await symlink(outside, join(trip, 'B.jpg'));
      return lookAt(trip)(address);
    });
    expect(look.samples).toHaveLength(1);
    expect(readOf('B.jpg')).toEqual([]);
  });

  it('get no photo into a shoot that a link takes from outside them', async () => {
    const { trip } = await withLinkOutside();
    await Bun.write(join(trip, '.hidden', 'C.jpg'), 'a photo');
    await Bun.write(join(trip, 'notes.txt'), 'notes');
    const scanned = await scanFolder(trip, '--name', 'trip');
    expect(scanned).toMatchObject({ photos: 1, moments: 1 });
    const [exiftool] = fakeTools.runs.filter(
      ({ command }) => command === 'exiftool',
    );
    // No other file or folder, each after the end of the options.
    expect(exiftool?.args.slice(exiftool.args.indexOf('--'))).toEqual([
      '--',
      join(trip, 'A.jpg'),
    ]);
    expect(exiftool?.args.filter((arg) => arg.startsWith('/'))).toEqual([
      join(trip, 'A.jpg'),
    ]);
    expect(readOf('B.jpg')).toEqual([]);
  });

  it('hands exiftool any name a photo can have', async () => {
    const odd = join(photosFolder(), 'o@dd', 'a\\b\nc$d@e.jpg');
    await Bun.write(odd, 'a photo');
    const scanned = await scanFolder(join(photosFolder(), 'o@dd'));
    expect(scanned).toMatchObject({ photos: 1 });
    const [exiftool] = fakeTools.runs.filter(
      ({ command }) => command === 'exiftool',
    );
    expect(exiftool?.args.at(-1)).toBe(odd);
  });

  it('hands exiftool very many photos in runs it can be given', async () => {
    // Names near the longest a file system allows fill a run with few photos,
    // since each photo also costs the scan a few runs of other programs.
    const count = 1200;
    const long = 'a-long-name-of-a-trip-to-fill-the-arguments-'.repeat(5);
    await Promise.all(
      Array.from({ length: count }, (_, index) =>
        Bun.write(join(photosFolder(), 'many', `${long}${index}.jpg`), ''),
      ),
    );
    const scanned = await scanFolder(join(photosFolder(), 'many'));
    expect(scanned).toMatchObject({ photos: count });
    const runs = fakeTools.runs.filter(
      ({ command, args }) => command === 'exiftool' && args.includes('--'),
    );
    const named = runs.map(({ args }) => args.slice(args.indexOf('--') + 1));
    expect(runs.length).toBeGreaterThan(1);
    expect(named.flat()).toHaveLength(count);
    for (const files of named) {
      expect(Buffer.byteLength(files.join('\0'))).toBeLessThan(256 * 1024);
    }
  }, 30_000); // Writing 3000 files takes a while on a slow machine.
});
