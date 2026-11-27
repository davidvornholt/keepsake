import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  editLisbon,
  fake,
  judge,
  pickLisbon,
  putPhotos,
  runOk,
  setUp,
  shootJson,
  tearDown,
} from './command-fixtures.ts';
import { fakeTools } from './fake-tools.ts';
import { whileServing } from './light-table-fixtures.ts';

// Two shoots of one place publish to one album, and their camera files have
// the same names, as camera counters start again.

beforeEach(() => setUp(spyOn));
afterEach(tearDown);

const laterFile = (...parts: ReadonlyArray<string>) =>
  join(fake.home, 'data', 'keepsake', 'shoots', 'later', ...parts);

/** A second shoot of the same place, with the same file names. */
const publishLater = async () => {
  const folder = join(fake.home, 'later-photos');
  await putPhotos(folder);
  await runOk('scan', folder, '--name', 'later', '--title', 'Lisbon');
  await Bun.write(laterFile('judge.json'), JSON.stringify({ model: judge }));
  await runOk('cull', 'later');
  await runOk('pick', 'later');
  await runOk('edit', 'later', '--review-model', judge);
  // Other photos than the first shoot's, which Immich tells apart.
  await Promise.all(
    ['A1', 'B', 'C'].map((photo) =>
      Bun.write(
        laterFile('edits', photo, `${photo}-keepsake.jpg`),
        `later ${photo}`,
      ),
    ),
  );
  return await runOk('publish', 'later');
};

const albumOf = async (read: Promise<{ photos: unknown }>) =>
  (await read).photos;

describe('keepsake publish, of two shoots into one album', () => {
  it('counts only its own uploads, also of photos with the same name', async () => {
    await pickLisbon();
    await editLisbon();
    await runOk('publish', 'lisbon');
    // The owner takes the first shoot's B out of the album in Immich.
    const [album] = fakeTools.albums;
    if (album !== undefined) {
      album.assets = album.assets.filter(({ id }) => id !== 'asset-3');
    }
    const later = await publishLater();
    expect(later).toMatchObject({ album: { id: 'album-1' }, published: 3 });
    expect(fakeTools.albums).toHaveLength(1);
    const again = await runOk('publish', 'lisbon');
    expect(again).toMatchObject({ published: 0, alreadyThere: 2 });
    expect(await albumOf(shootJson('album.json'))).toEqual([
      { photo: 'A1', asset: 'asset-1', favorite: false },
      { photo: 'C', asset: 'asset-5', favorite: false },
    ]);
    const [removed] = await shootJson('removed.json');
    expect(removed).toMatchObject({ photo: 'B', because: null });
    const laterAlbum = JSON.parse(
      await readFile(laterFile('album.json'), 'utf8'),
    );
    expect(
      laterAlbum.photos.map(({ asset }: { asset: string }) => asset),
    ).not.toContain('asset-3');
    expect(laterAlbum.photos).toHaveLength(3);
  });
});

describe('the page, before an album is made', () => {
  it('lists the albums in Immich, with the days of their photos', async () => {
    fakeTools.albums = [
      {
        id: 'spring',
        name: 'Lisbon',
        taken: { first: '2025-04-01', last: '2025-04-03' },
        assets: [],
      },
      { id: 'empty', name: 'Porto', assets: [] },
    ];
    const listed = await whileServing(async (address) =>
      (await fetch(`${address}/api/albums`)).json(),
    );
    expect(listed).toEqual({
      albums: [
        { name: 'Lisbon', first: '2025-04-01', last: '2025-04-03' },
        { name: 'Porto', first: null, last: null },
      ],
    });
  });
});
