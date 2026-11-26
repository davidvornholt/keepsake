import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { mkdir, symlink } from 'node:fs/promises';
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

const readOf = (file: string) =>
  fakeTools.runs.filter(({ args }) => args.some((arg) => arg.endsWith(file)));

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

  it('get no photo into a shoot that a link takes from outside them', async () => {
    const { trip } = await withLinkOutside();
    await Bun.write(join(trip, '.hidden', 'C.jpg'), 'a photo');
    await Bun.write(join(trip, 'notes.txt'), 'notes');
    const lists: Array<string> = [];
    fakeTools.pause = async ({ command, args }) => {
      if (command === 'exiftool' && args.includes('-@')) {
        lists.push(await Bun.file(args[args.indexOf('-@') + 1] ?? '').text());
      }
    };
    const scanned = await runOk('scan', trip, '--name', 'trip');
    expect(scanned).toMatchObject({ photos: 1, moments: 1 });
    const [exiftool] = fakeTools.runs.filter(
      ({ command }) => command === 'exiftool',
    );
    const [option, list] = exiftool?.args.slice(-2) ?? [];
    expect(option).toBe('-@');
    // No other file or folder than its list of files.
    expect(exiftool?.args.filter((arg) => arg.startsWith('/'))).toEqual([
      list ?? '',
    ]);
    expect(lists).toEqual([`#[CSTR]${join(trip, 'A.jpg')}\n`]);
    expect(readOf('B.jpg')).toEqual([]);
  });

  it('hands exiftool any name a photo can have', async () => {
    const odd = join(photosFolder(), 'odd', 'a\\b\nc.jpg');
    await Bun.write(odd, 'a photo');
    const lists: Array<string> = [];
    fakeTools.pause = async ({ command, args }) => {
      if (command === 'exiftool' && args.includes('-@')) {
        lists.push(await Bun.file(args[args.indexOf('-@') + 1] ?? '').text());
      }
    };
    const scanned = await runOk('scan', join(photosFolder(), 'odd'));
    expect(scanned).toMatchObject({ photos: 1 });
    expect(lists).toEqual([
      `#[CSTR]${join(photosFolder(), 'odd')}/a\\\\b\\nc.jpg\n`,
    ]);
  });
});
