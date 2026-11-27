import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { writeFile } from 'node:fs/promises';
import { publishLisbon } from './choice-fixtures.ts';
import {
  editLisbon,
  pickLisbon,
  run,
  runOk,
  setUp,
  shootFile,
  shootJson,
  tearDown,
} from './command-fixtures.ts';
import { fakeTools } from './fake-tools.ts';

// Uploads in the album that the shoot's record doesn't note: one a publish
// sent just before it stopped, and those of publishes from before keepsake
// noted every upload, which found the shoot's photos by their file's name.

beforeEach(() => setUp(spyOn));
afterEach(tearDown);

const inImmich = () => (fakeTools.albums[0]?.assets ?? []).map(({ id }) => id);

const writeJsonFile = (file: string, value: unknown) =>
  writeFile(shootFile(file), JSON.stringify(value));

const because = ['--because', 'It is blurred.'];

/** A shoot whose publication notes A1's upload, and not B's or C's. */
const publishedByName = async () => {
  await publishLisbon();
  const publication = await shootJson('publication.json');
  await writeJsonFile('publication.json', {
    ...publication,
    photos: publication.photos.filter(
      ({ photo }: { readonly photo: string }) => photo === 'A1',
    ),
  });
  // C's upload left the album, and another shoot's file of its name is in
  // it, which `album.json` called C by its name.
  const stranger = 'asset-stranger';
  fakeTools.library.push({
    id: stranger,
    file: '/elsewhere/C-keepsake.jpg',
    checksum: 'another',
    bytes: new TextEncoder().encode('another shoot’s C'),
  });
  const [album] = fakeTools.albums;
  if (album !== undefined) {
    album.assets = [
      ...album.assets.filter(({ id }) => id !== 'asset-5'),
      {
        id: stranger,
        fileName: 'C-keepsake.jpg',
        favorite: false,
        trashed: false,
      },
    ];
  }
  const read = await shootJson('album.json');
  await writeJsonFile('album.json', {
    ...read,
    photos: read.photos.map((one: { readonly photo: string }) =>
      one.photo === 'C' ? { ...one, asset: stranger } : one,
    ),
  });
};

describe('keepsake publish, after publishes that noted uploads by name', () => {
  it('keeps the uploads that have the bytes of its photos', async () => {
    await publishedByName();
    await runOk('publish', 'lisbon', 'A1');
    expect((await shootJson('publication.json')).found).toEqual([
      { photo: 'B', asset: 'asset-3' },
    ]);
    const { photos } = await shootJson('album.json');
    expect(photos).toEqual([
      { photo: 'A1', asset: 'asset-1', favorite: false },
      { photo: 'B', asset: 'asset-3', favorite: false },
    ]);
    expect(await shootJson('removed.json').catch(() => [])).toEqual([]);
  });

  it('takes out and publishes again what it found, and nothing else', async () => {
    await publishedByName();
    const result = await runOk('publish', 'lisbon');
    expect(result).toMatchObject({ published: 2, alreadyThere: 1 });
    const { photos } = await shootJson('publication.json');
    expect(
      photos.some(({ wasThere }: { wasThere?: boolean }) => wasThere),
    ).toBe(false);
    expect(inImmich()).toContain('asset-stranger');
    await runOk('take-out', 'lisbon', 'B', 'C', ...because);
    expect(inImmich()).toEqual(['asset-1', 'asset-stranger']);
  });
});

/** Publishes, and stops once Immich took A1's finished file. */
const stopAfterUpload = async () => {
  await pickLisbon();
  await editLisbon();
  fakeTools.late = ({ args }) =>
    args[0] === 'upload' && args[1]?.endsWith('A1-keepsake.jpg') === true
      ? Promise.reject(new Error('keepsake stopped.'))
      : undefined;
  await run('publish', 'lisbon').catch(() => null);
  fakeTools.late = undefined;
};

describe('keepsake publish, after one that stopped as Immich took a file', () => {
  it('noted the upload before it sent the file', async () => {
    await stopAfterUpload();
    expect(inImmich()).toEqual(['asset-1']);
    const { sending } = await shootJson('publication.json');
    expect(sending).toEqual([{ photo: 'A1', digest: expect.any(String) }]);
  });

  it('calls the upload its own and sends nothing twice', async () => {
    await stopAfterUpload();
    const result = await runOk('publish', 'lisbon');
    expect(result).toMatchObject({ published: 3 });
    expect(inImmich()).toEqual(['asset-1', 'asset-3', 'asset-5']);
    const publication = await shootJson('publication.json');
    expect(publication.sending).toBeUndefined();
    expect(publication.photos[0]).toMatchObject({
      photo: 'A1',
      asset: 'asset-1',
    });
    expect(publication.photos[0].wasThere).toBeUndefined();
  });

  it('takes the upload out when the photo is taken out', async () => {
    await stopAfterUpload();
    await runOk('take-out', 'lisbon', 'A1', ...because);
    expect(inImmich()).toEqual([]);
  });
});
