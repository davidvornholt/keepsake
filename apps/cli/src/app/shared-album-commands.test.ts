import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { copyFile, readFile, rm, writeFile } from 'node:fs/promises';
import {
  editLisbon,
  failureOf,
  pickLisbon,
  run,
  runOk,
  setUp,
  shootFile,
  shootJson,
  tearDown,
} from './command-fixtures.ts';
import { fakeTools } from './fake-tools.ts';
import { whileServing } from './light-table-fixtures.ts';
import {
  editLater,
  inImmich,
  laterAlbum,
  laterFile,
  laterFinal,
  publishLater,
} from './shared-album-fixtures.ts';

// Two shoots of one place publish to one album, and their camera files have
// the same names, as camera counters start again.

beforeEach(() => setUp(spyOn));
afterEach(tearDown);

const assetsOf = (photos: ReadonlyArray<{ readonly asset: string }>) =>
  photos.map(({ asset }) => asset);

const albumOf = async (read: Promise<{ photos: unknown }>) =>
  (await read).photos;

/** Finishes the other shoot's photos as the first shoot's are. */
const sameAsLisbon = (photo: string) =>
  copyFile(
    shootFile('edits', photo, `${photo}-keepsake.jpg`),
    laterFinal(photo),
  );

const because = ['--because', 'It is blurred.'];

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
    await editLater(sameAsLisbon);
    await runOk('publish', 'later');
    await runOk('take-out', 'lisbon', 'B', ...because);
    expect(inImmich()).toContain('asset-3');
    expect(assetsOf((await laterAlbum()).photos)).toContain('asset-3');
    await runOk('take-out', 'later', 'C', ...because);
    expect(inImmich()).toContain('asset-5');
    await Bun.write(shootFile('edits', 'A1', 'A1-keepsake.jpg'), 'another A1');
    const again = await runOk('publish', 'lisbon');
    expect(again).toMatchObject({ published: 1, outdated: [] });
  });

  it('leaves an upload that an older record of the other shoot names', async () => {
    await pickLisbon();
    await editLisbon();
    await runOk('publish', 'lisbon');
    await editLater(sameAsLisbon);
    await runOk('publish', 'later');
    // From before keepsake kept album ids: `album.json` has the id.
    const { albumId: _, ...older } = JSON.parse(
      await readFile(laterFile('publication.json'), 'utf8'),
    );
    await writeFile(laterFile('publication.json'), JSON.stringify(older));
    await runOk('take-out', 'lisbon', 'B', ...because);
    expect(inImmich()).toContain('asset-3');
    // Nor does the album count when keepsake can't tell which it is.
    await rm(laterFile('album.json'));
    await runOk('take-out', 'lisbon', 'C', ...because);
    expect(inImmich()).toContain('asset-5');
  });

  it('leaves the other shoot’s upload when its own of that file fails', async () => {
    await pickLisbon();
    await editLisbon();
    await editLater(sameAsLisbon);
    // The first shoot waits once Immich put its A1 into the album, and the
    // other publishes the same file meanwhile, whose camera's file fails.
    const waiting = Promise.withResolvers<void>();
    const going = Promise.withResolvers<void>();
    const laterCamera = laterFile('edits', 'A1', 'A1.jpg');
    const camera = shootFile('edits', 'A1', 'A1.jpg');
    fakeTools.pause = ({ args }) => {
      if (args[0] !== 'upload') {
        return;
      }
      if (args[1] === laterCamera) {
        fakeTools.broken.add(laterCamera);
        return;
      }
      if (args[1] === camera) {
        waiting.resolve();
        return going.promise;
      }
    };
    const first = run('publish', 'lisbon');
    await waiting.promise;
    expect((await run('publish', 'later'))._tag).toBe('Failure');
    expect(inImmich()).toContain('asset-1');
    going.resolve();
    expect((await first)._tag).toBe('Success');
    expect(inImmich()).toEqual(['asset-1', 'asset-3', 'asset-5']);
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

describe('keepsake publish, of a file another shoot has too', () => {
  it('leaves the other shoot’s upload when its retry fails again', async () => {
    await pickLisbon();
    await editLisbon();
    await editLater(sameAsLisbon);
    // The first shoot's camera file of A1 fails each time.
    fakeTools.broken.add(shootFile('edits', 'A1', 'A1.jpg'));
    await failureOf('publish', 'lisbon', 'A1');
    const { sending } = await shootJson('publication.json');
    expect(sending).toEqual([{ photo: 'A1', asset: 'asset-1', added: false }]);
    await runOk('publish', 'later', 'A1');
    expect(inImmich()).toEqual(['asset-1']);
    await failureOf('publish', 'lisbon', 'A1');
    expect(inImmich()).toEqual(['asset-1']);
  });

  it('calls no upload outdated that is another shoot’s camera file', async () => {
    await pickLisbon();
    await editLisbon();
    // The other shoot's A1 is finished as the camera took the first's.
    await editLater((photo) =>
      photo === 'A1'
        ? copyFile(shootFile('edits', 'A1', 'A1.jpg'), laterFinal(photo))
        : Bun.write(laterFinal(photo), `later ${photo}`),
    );
    await runOk('publish', 'later');
    const [made] = (await laterAlbum()).photos;
    await runOk('publish', 'lisbon');
    const { photos } = await shootJson('publication.json');
    expect(photos).toContainEqual(
      expect.objectContaining({ photo: 'A1', cameraAsset: made.asset }),
    );
    await Bun.write(laterFinal('A1'), 'another A1');
    const again = await runOk('publish', 'later', 'A1');
    expect(again).toMatchObject({ published: 1, outdated: [] });
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
