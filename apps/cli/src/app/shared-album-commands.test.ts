import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { copyFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  editLisbon,
  fake,
  judge,
  pickLisbon,
  putPhotos,
  run,
  runOk,
  setUp,
  shootFile,
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

const finished = ['A1', 'B', 'C'];

const laterFinal = (photo: string) =>
  laterFile('edits', photo, `${photo}-keepsake.jpg`);

/**
 * A second shoot of the same place, with the same file names, finished as
 * `finish` has it.
 */
const editLater = async (finish: (photo: string) => Promise<unknown>) => {
  const folder = join(fake.home, 'later-photos');
  await putPhotos(folder);
  await runOk('scan', folder, '--name', 'later', '--title', 'Lisbon');
  await Bun.write(laterFile('judge.json'), JSON.stringify({ model: judge }));
  await runOk('cull', 'later');
  await runOk('pick', 'later');
  await runOk('edit', 'later', '--review-model', judge);
  await Promise.all(finished.map(finish));
};

/** The second shoot, published with other photos than the first shoot's. */
const publishLater = async () => {
  await editLater((photo) => Bun.write(laterFinal(photo), `later ${photo}`));
  return await runOk('publish', 'later');
};

const laterAlbum = async () =>
  JSON.parse(await readFile(laterFile('album.json'), 'utf8'));

const inImmich = () => (fakeTools.albums[0]?.assets ?? []).map(({ id }) => id);

const assetsOf = (photos: ReadonlyArray<{ readonly asset: string }>) =>
  photos.map(({ asset }) => asset);

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
    const { photos } = await laterAlbum();
    expect(assetsOf(photos)).not.toContain('asset-3');
    expect(photos).toHaveLength(3);
  });

  it('leaves an upload in the album that the other shoot’s photo is too', async () => {
    await pickLisbon();
    await editLisbon();
    await runOk('publish', 'lisbon');
    // The same finished files, which Immich has once.
    await editLater((photo) =>
      copyFile(
        shootFile('edits', photo, `${photo}-keepsake.jpg`),
        laterFinal(photo),
      ),
    );
    await runOk('publish', 'later');
    const because = ['--because', 'It is blurred.'];
    await runOk('take-out', 'lisbon', 'B', ...because);
    expect(inImmich()).toContain('asset-3');
    expect(assetsOf((await laterAlbum()).photos)).toContain('asset-3');
    await runOk('take-out', 'later', 'C', ...because);
    expect(inImmich()).toContain('asset-5');
    await Bun.write(shootFile('edits', 'A1', 'A1-keepsake.jpg'), 'another A1');
    const again = await runOk('publish', 'lisbon');
    expect(again).toMatchObject({ published: 1, outdated: [] });
  });

  it('makes one album for two shoots that publish at once', async () => {
    await pickLisbon();
    await editLisbon();
    await editLater((photo) => Bun.write(laterFinal(photo), `later ${photo}`));
    const results = await Promise.all([
      run('publish', 'lisbon'),
      run('publish', 'later'),
    ]);
    expect(results.map(({ _tag }) => _tag)).toEqual(['Success', 'Success']);
    expect(fakeTools.albums).toHaveLength(1);
    expect(fakeTools.albums[0]?.assets).toHaveLength(6);
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
      { id: 'friends', name: 'Porto', owner: 'Friend', assets: [] },
    ];
    const listed = await whileServing(async (address) =>
      (await fetch(`${address}/api/albums`)).json(),
    );
    expect(listed).toEqual({
      albums: [
        {
          name: 'Lisbon',
          first: '2025-04-01',
          last: '2025-04-03',
          sharedBy: null,
        },
        { name: 'Porto', first: null, last: null, sharedBy: null },
        { name: 'Porto', first: null, last: null, sharedBy: 'Friend' },
      ],
    });
  });
});
