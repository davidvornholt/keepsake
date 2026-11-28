import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import {
  editLisbon,
  failureOf,
  holdOutput,
  judge,
  photosFolder,
  pickLisbon,
  printed,
  run,
  runOk,
  scanLisbon,
  setUp,
  shootFile,
  shootJson,
  tearDown,
} from './command-fixtures.ts';
import { fakeModels } from './fake-models.ts';
import { fakeTools } from './fake-tools.ts';
import { send, statusOf, whileServing } from './light-table-fixtures.ts';
import { mark } from './mark-fixtures.ts';

const first = 'Lisbon';

const publishLisbon = async (...args: ReadonlyArray<string>) => {
  await pickLisbon();
  await editLisbon();
  return await runOk('publish', 'lisbon', ...args);
};

const finalOf = (photo: string) =>
  shootFile('edits', photo, `${photo}-keepsake.jpg`);

const editAgain = (photo: string) =>
  writeFile(finalOf(photo), `another ${photo}`);

const albumWithId = (id: string) =>
  fakeTools.albums.find((album) => album.id === id);

const assetsOf = (id: string) =>
  albumWithId(id)?.assets.map((asset) => asset.id) ?? [];

/** Someone shares an album with the owner under a name keepsake knows. */
const shareAlbum = (name: string) => {
  fakeTools.albums.push({ id: 'shared', name, owner: 'Friend', assets: [] });
};

/** What keepsake wrote before it kept the album's id. */
const makeLegacy = async (named?: string) => {
  const { album, photos } = await shootJson('publication.json');
  await Bun.write(
    shootFile('publication.json'),
    JSON.stringify({
      album: named ?? album,
      photos: photos.map(
        ({ replaced: _, ...photo }: Record<string, unknown>) => photo,
      ),
    }),
  );
};

beforeEach(() => setUp(spyOn));
afterEach(tearDown);

describe('keepsake publish, of an upload another album shows too', () => {
  it('doesn’t call it outdated when it stays in another album', async () => {
    await publishLisbon();
    await runOk('publish', 'lisbon', '--album', 'Second');
    await editAgain('B');
    const result = await runOk('publish', 'lisbon');
    expect(result).toMatchObject({ published: 1, outdated: [] });
    expect(assetsOf('album-1')).toContain('asset-3');
  });

  it('doesn’t call it outdated when another photo is it too', async () => {
    await pickLisbon();
    await editLisbon();
    await writeFile(finalOf('A1'), 'the same picture');
    await writeFile(finalOf('C'), 'the same picture');
    await runOk('publish', 'lisbon');
    const [shared] = assetsOf('album-1');
    await editAgain('C');
    const result = await runOk('publish', 'lisbon');
    expect(result).toMatchObject({ published: 1, outdated: [] });
    const { photos } = await shootJson('album.json');
    expect(photos).toContainEqual({
      photo: 'A1',
      asset: shared,
      favorite: false,
    });
  });
});

describe('keepsake publish, to a slow reader', () => {
  it('forgets a replaced upload only once the reader took the output', async () => {
    await publishLisbon();
    await editAgain('B');
    const { written, release } = holdOutput();
    const publishing = run('publish', 'lisbon');
    await written;
    // Long enough for anything that wouldn't wait for the reader.
    await Bun.sleep(50);
    const { outdated } = printed();
    expect(outdated).toHaveLength(1);
    expect((await shootJson('publication.json')).outdated).toEqual(outdated);
    release();
    await publishing;
    expect((await shootJson('publication.json')).outdated).toEqual([]);
  });
});

describe('keepsake take-out, of an upload another photo is too', () => {
  it('takes it out only together with the other photo', async () => {
    await pickLisbon();
    await editLisbon();
    await writeFile(finalOf('A1'), 'the same picture');
    await writeFile(finalOf('C'), 'the same picture');
    await runOk('publish', 'lisbon');
    const because = ['--because', 'It is blurred.'];
    const failure = await failureOf('take-out', 'lisbon', 'C', ...because);
    expect(failure.message).toContain('C is the same file in Immich as A1');
    expect(assetsOf('album-1')).toHaveLength(2);
    await runOk('take-out', 'lisbon', 'C', 'A1', ...because);
    expect(assetsOf('album-1')).toHaveLength(1);
  });
});

describe('keepsake publish, after the album changed in Immich', () => {
  it('makes a new album when its own is gone', async () => {
    await publishLisbon();
    const [, b] = assetsOf('album-1');
    fakeTools.albums = [];
    shareAlbum(first);
    const result = await runOk('publish', 'lisbon');
    expect(result).toMatchObject({ album: { name: first }, published: 3 });
    expect(result.album.id).not.toBe('shared');
    expect(assetsOf('shared')).toEqual([]);
    await editAgain('B');
    const again = await runOk('publish', 'lisbon');
    expect(again).toMatchObject({ published: 1, outdated: [b] });
  });

  it('stops when an album shared with the owner is gone', async () => {
    await pickLisbon();
    await editLisbon();
    shareAlbum('Shared');
    await runOk('publish', 'lisbon', '--album', 'Shared');
    // Its owner stopped sharing it, which looks the same as deleting it.
    fakeTools.albums = [];
    const uploads = fakeTools.uploads.length;
    await editAgain('B');
    const failure = await failureOf('publish', 'lisbon');
    expect(failure.message).toContain('Shared is no longer in Immich');
    expect(fakeTools.albums).toEqual([]);
    expect(fakeTools.uploads).toHaveLength(uploads);
  });

  it('stops when an album of a record from before ids were kept is gone', async () => {
    await publishLisbon();
    await makeLegacy();
    await rm(shootFile('album.json'));
    fakeTools.albums = [];
    const failure = await failureOf('publish', 'lisbon');
    expect(failure.message).toContain(`${first} is no longer in Immich`);
    expect(fakeTools.albums).toEqual([]);
  });

  it('knows the album of a record from before ids were kept', async () => {
    await publishLisbon();
    await makeLegacy();
    shareAlbum(first);
    await editAgain('B');
    const result = await runOk('publish', 'lisbon');
    expect(result).toMatchObject({ album: { id: 'album-1' }, published: 1 });
    expect(assetsOf('shared')).toEqual([]);
  });

  it('doesn’t take the id of another album from before ids were kept', async () => {
    await pickLisbon();
    await editLisbon();
    shareAlbum('Shared');
    await runOk('publish', 'lisbon', '--album', 'Shared');
    // A switch to a private album failed half-way before ids were kept.
    const assets = albumWithId('shared')?.assets ?? [];
    fakeTools.albums.push({ id: 'private', name: 'Private', assets });
    await makeLegacy('Private');
    const before = assetsOf('shared');
    await editAgain('B');
    const result = await runOk('publish', 'lisbon');
    expect(result).toMatchObject({ album: { id: 'private' }, published: 1 });
    expect(assetsOf('shared')).toEqual(before);
  });

  it('remembers each album it published to', async () => {
    await pickLisbon();
    await editLisbon();
    await runOk('publish', 'lisbon', 'B');
    await runOk('publish', 'lisbon', '--album', 'Second');
    const firstAlbum = albumWithId('album-1');
    if (firstAlbum !== undefined) {
      firstAlbum.assets = [];
    }
    const result = await runOk('publish', 'lisbon', '--album', first);
    expect(result).toMatchObject({ album: { id: 'album-1' }, published: 2 });
    const names = albumWithId('album-1')?.assets.map((one) => one.fileName);
    expect(names).toEqual(['A1-keepsake.jpg', 'C-keepsake.jpg']);
    const removed = await shootJson('removed.json');
    expect(removed).toContainEqual(
      expect.objectContaining({ photo: 'B', album: 'album-1' }),
    );
  });

  it('keeps only the owner’s reasons from before ids were kept for another album', async () => {
    await publishLisbon();
    await makeLegacy();
    const at = '2026-05-01T10:00:00.000Z';
    await Bun.write(
      shootFile('removed.json'),
      JSON.stringify([
        { photo: 'B', at, because: null },
        { photo: 'C', at, because: 'It is blurred.' },
      ]),
    );
    const result = await runOk('publish', 'lisbon', '--album', 'Second');
    expect(result).toMatchObject({ album: { id: 'album-2' }, published: 2 });
    expect(assetsOf('album-2')).toEqual(['asset-1', 'asset-3']);
  });
});

describe('keepsake publish, to several albums, of a photo taken out for a reason', () => {
  it('keeps a photo taken out for a reason out when it is still in an earlier album', async () => {
    await publishLisbon('--album', first);
    await runOk('publish', 'lisbon', '--album', 'Second');
    await runOk('take-out', 'lisbon', 'B', '--because', 'Keep private');
    await runOk('publish', 'lisbon', '--album', first);
    expect(await shootJson('removed.json')).toEqual([
      expect.objectContaining({ photo: 'B', because: 'Keep private' }),
    ]);
    const third = await runOk('publish', 'lisbon', '--album', 'Third');
    expect(third).toMatchObject({ published: 2 });
    const names = albumWithId('album-3')?.assets.map((one) => one.fileName);
    expect(names).toEqual(['A1-keepsake.jpg', 'C-keepsake.jpg']);
  });

  it('does nothing for a mark on it while it is still in an earlier album', async () => {
    await publishLisbon('--album', first);
    await runOk('publish', 'lisbon', '--album', 'Second');
    await mark('one');
    await runOk('take-out', 'lisbon', 'B', '--because', 'Keep private');
    await runOk('publish', 'lisbon', '--album', first);
    const failed = await failureOf('publish', 'lisbon', '--mark', 'one');
    expect(failed.message).toContain('B was taken out meanwhile');
    await runOk('publish', 'lisbon', '--album', 'Third');
    const names = albumWithId('album-3')?.assets.map((one) => one.fileName);
    expect(names).toEqual(['A1-keepsake.jpg', 'C-keepsake.jpg']);
  });

  it('lets a photo taken out for a reason into another album when it is named', async () => {
    await publishLisbon('--album', first);
    await runOk('take-out', 'lisbon', 'B', '--because', 'It is blurred.');
    await runOk('publish', 'lisbon', 'B', '--album', 'Second');
    expect(await shootJson('removed.json')).toEqual([]);
  });
});

describe('keepsake publish, to another album, stopped half-way', () => {
  it('forgets what it read of the album before', async () => {
    await publishLisbon();
    fakeTools.broken.add('A1-keepsake.jpg');
    await failureOf('publish', 'lisbon', '--album', 'Second');
    expect(assetsOf('album-2')).toEqual([]);
    expect((await runOk('show', 'lisbon', 'A1')).standing).toEqual({
      kind: 'picked',
    });
    const favored = await whileServing((address) =>
      statusOf(
        send('PUT', `${address}/api/shoots/lisbon/favorites`, {
          photo: 'A1',
          favorite: true,
        }),
      ),
    );
    expect(favored).toBe(400);
    expect(albumWithId('album-1')?.assets).not.toContainEqual(
      expect.objectContaining({ favorite: true }),
    );
    fakeTools.broken.clear();
    const result = await runOk('publish', 'lisbon');
    expect(result).toMatchObject({ album: { id: 'album-2' }, published: 3 });
    const { elsewhere } = await shootJson('publication.json');
    expect(elsewhere).toMatchObject([{ albumId: 'album-1' }]);
  });
});

describe('keepsake run --publish', () => {
  const runLisbon = () => [
    'run',
    photosFolder(),
    '--name',
    'lisbon',
    '--review-model',
    judge,
    '--publish',
  ];

  it('doesn’t name an upload another publish brought back meanwhile', async () => {
    await scanLisbon();
    await runOk(...runLisbon());
    const original = await Bun.file(finalOf('B')).bytes();
    const { photos } = await shootJson('publication.json');
    const earlier = photos.find(
      ({ photo }: { photo: string }) => photo === 'B',
    );
    await editAgain('B');
    // While the run explains, after it published, the owner goes back to the
    // first edit and publishes it, which brings its upload back.
    fakeModels.answers.reasons = async () => {
      await writeFile(finalOf('B'), original);
      const now = await shootJson('publication.json');
      const replacing = now.photos.find(
        ({ photo }: { photo: string }) => photo === 'B',
      ).asset;
      await Bun.write(
        shootFile('publication.json'),
        JSON.stringify({
          ...now,
          photos: [
            ...now.photos.filter(
              ({ photo }: { photo: string }) => photo !== 'B',
            ),
            earlier,
          ],
          outdated: [replacing],
        }),
      );
      return { reasons: [] };
    };
    const result = await runOk(...runLisbon());
    expect(result.published).toMatchObject({ published: 1, outdated: [] });
    const after = await shootJson('publication.json');
    expect(after.outdated).toHaveLength(1);
    expect(after.outdated).not.toContain(earlier.asset);
  });

  it('names a replaced upload again when a later step failed', async () => {
    await scanLisbon();
    await runOk(...runLisbon());
    await editAgain('B');
    // The reasons can't be saved, so explaining fails after publishing.
    await rm(shootFile('reasons.json'), { force: true });
    await mkdir(shootFile('reasons.json', 'in-the-way'), { recursive: true });
    const uploads = fakeTools.uploads.length;
    const failure = await failureOf(...runLisbon());
    expect(failure._tag).toBe('StoreFailed');
    expect(fakeTools.uploads.length).toBeGreaterThan(uploads);
    await rm(shootFile('reasons.json'), { recursive: true });
    const result = await runOk('publish', 'lisbon');
    expect(result).toMatchObject({ outdated: ['asset-3'] });
  });
});
