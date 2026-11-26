import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import {
  editLisbon,
  failureOf,
  judge,
  photosFolder,
  pickLisbon,
  runOk,
  scanLisbon,
  setUp,
  shootFile,
  shootJson,
  tearDown,
} from './command-fixtures.ts';
import { fakeTools } from './fake-tools.ts';

const first = 'Lisbon, May 2026';

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
  fakeTools.albums.push({ id: 'shared', name, assets: [] });
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
    fakeTools.albums = [];
    shareAlbum(first);
    const result = await runOk('publish', 'lisbon');
    expect(result).toMatchObject({ album: { name: first }, published: 3 });
    expect(result.album.id).not.toBe('shared');
    expect(assetsOf('shared')).toEqual([]);
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
    await makeLegacy('Private');
    const before = assetsOf('shared');
    await editAgain('B');
    const result = await runOk('publish', 'lisbon');
    expect(result).toMatchObject({ album: { name: 'Private' } });
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
