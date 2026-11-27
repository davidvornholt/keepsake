import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { writeFile } from 'node:fs/promises';
import { publishLisbon } from './choice-fixtures.ts';
import {
  failureOf,
  runOk,
  setUp,
  shootFile,
  shootJson,
  tearDown,
} from './command-fixtures.ts';
import { fakeTools } from './fake-tools.ts';
import { editLater, inImmich, laterFinal } from './shared-album-fixtures.ts';

// Publishes from before keepsake noted every upload found the shoot's photos
// in the album by their file's name, and `album.json` kept what they found.

beforeEach(() => setUp(spyOn));
afterEach(tearDown);

const because = ['--because', 'It is blurred.'];

/** Makes the shoot's publication one from then, which notes only A1. */
const fromBefore = async () => {
  const { namesAdopted: _, ...publication } =
    await shootJson('publication.json');
  await writeFile(
    shootFile('publication.json'),
    JSON.stringify({
      ...publication,
      photos: publication.photos
        .filter(({ photo }: { readonly photo: string }) => photo === 'A1')
        .map(
          ({ created: _c, added: _a, ...photo }: Record<string, unknown>) =>
            photo,
        ),
    }),
  );
};

const photoNames = (photos: ReadonlyArray<{ readonly photo: string }>) =>
  photos.map(({ photo }) => photo);

describe('keepsake publish, after publishes that named uploads by file', () => {
  it('takes on the uploads album.json named, once', async () => {
    await publishLisbon();
    await fromBefore();
    const result = await runOk('publish', 'lisbon', 'A1');
    expect(result).toMatchObject({ published: 0, alreadyThere: 1 });
    const publication = await shootJson('publication.json');
    expect(publication.adopted).toEqual([
      { photo: 'B', asset: 'asset-3' },
      { photo: 'C', asset: 'asset-5' },
    ]);
    expect(publication.namesAdopted).toBe(true);
    expect(photoNames((await shootJson('album.json')).photos)).toEqual([
      'A1',
      'B',
      'C',
    ]);
    expect(await shootJson('removed.json').catch(() => [])).toEqual([]);
    // Published again, they stay keepsake's own.
    const again = await runOk('publish', 'lisbon');
    expect(again).toMatchObject({ published: 2, outdated: [] });
    const { photos } = await shootJson('publication.json');
    expect(photos).toContainEqual(
      expect.objectContaining({ photo: 'B', created: true, added: true }),
    );
  });

  it('takes on no name another shoot published to the album', async () => {
    await publishLisbon();
    await editLater((photo) => Bun.write(laterFinal(photo), `later ${photo}`));
    await runOk('publish', 'later', 'C');
    await fromBefore();
    await runOk('publish', 'lisbon', 'A1');
    expect((await shootJson('publication.json')).adopted).toEqual([
      { photo: 'B', asset: 'asset-3' },
    ]);
    expect(photoNames((await shootJson('album.json')).photos)).toEqual([
      'A1',
      'B',
    ]);
    expect(await shootJson('removed.json').catch(() => [])).toEqual([]);
  });

  it('keeps a photo out that was taken out after it was taken on', async () => {
    await publishLisbon();
    await fromBefore();
    await runOk('take-out', 'lisbon', 'B', ...because);
    expect(inImmich()).not.toContain('asset-3');
    // C, which was taken on, is sent once more to be noted whole.
    const result = await runOk('publish', 'lisbon');
    expect(result).toMatchObject({ published: 1, alreadyThere: 1 });
    expect(inImmich()).not.toContain('asset-3');
    expect(photoNames((await shootJson('album.json')).photos)).toEqual([
      'A1',
      'C',
    ]);
    const [removed] = await shootJson('removed.json');
    expect(removed).toMatchObject({ photo: 'B', because: 'It is blurred.' });
  });

  it('takes on nothing, and notes nothing removed, while Immich is away', async () => {
    await publishLisbon();
    await fromBefore();
    fakeTools.broken.add('album-1');
    await failureOf('publish', 'lisbon', 'A1');
    const publication = await shootJson('publication.json');
    expect(publication.adopted).toBeUndefined();
    expect(publication.namesAdopted).toBeUndefined();
    expect(await shootJson('removed.json').catch(() => [])).toEqual([]);
    fakeTools.broken.clear();
    await runOk('publish', 'lisbon', 'A1');
    expect((await shootJson('publication.json')).adopted).toHaveLength(2);
  });
});
