import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { createHash } from 'node:crypto';
import { copyFile, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { BunServices } from '@effect/platform-bun';
import { ConfigProvider, Effect } from 'effect';
import { unpublish } from '../features/publish/unpublish.ts';
import type { PublishedPhoto } from '../shared/domain.ts';
import { openShoot } from '../shared/store.ts';
import { publishLisbon } from './choice-fixtures.ts';
import {
  editLisbon,
  failureOf,
  fake,
  pickLisbon,
  runOk,
  setUp,
  shootFile,
  shootJson,
  tearDown,
} from './command-fixtures.ts';
import { fakeTools, fakeToolsLayer } from './fake-tools.ts';
import { editLater, inImmich, laterFinal } from './shared-album-fixtures.ts';

// Publishes from before keepsake noted every upload found the shoot's photos
// in the album by their file's name, and `album.json` kept what they found.

beforeEach(() => setUp(spyOn));
afterEach(tearDown);

const because = ['--because', 'It is blurred.'];

/** Makes the shoot's publication one from then, which notes only A1. */
const fromBefore = async () => {
  const {
    namesAdopted: _,
    made: _made,
    ...publication
  } = await shootJson('publication.json');
  await writeFile(
    shootFile('publication.json'),
    JSON.stringify({
      ...publication,
      photos: publication.photos
        .filter(({ photo }: { readonly photo: string }) => photo === 'A1')
        .map(({ added: _a, ...photo }: Record<string, unknown>) => photo),
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
    // Published again, they stay put there by keepsake, which can't tell
    // whether it made them.
    const again = await runOk('publish', 'lisbon');
    expect(again).toMatchObject({ published: 2, outdated: [] });
    const { photos, made } = await shootJson('publication.json');
    expect(photos).toContainEqual(
      expect.objectContaining({ photo: 'B', added: true }),
    );
    expect(made).toBeUndefined();
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

const finalOf = (photo: string) =>
  shootFile('edits', photo, `${photo}-keepsake.jpg`);

const assetsOf = (album: string) =>
  (fakeTools.albums.find(({ id }) => id === album)?.assets ?? []).map(
    ({ id }) => id,
  );

/** Makes every upload of the publication one from then. */
const allFromBefore = async (outdated: ReadonlyArray<string>) => {
  const {
    namesAdopted: _,
    made: _made,
    ...publication
  } = await shootJson('publication.json');
  await writeFile(
    shootFile('publication.json'),
    JSON.stringify({
      ...publication,
      photos: publication.photos.map(
        ({ added: _a, ...photo }: Record<string, unknown>) => photo,
      ),
      outdated,
    }),
  );
};

describe('keepsake publish, after publishes that noted no owner', () => {
  it('takes out, and calls nothing outdated, what may be the owner’s', async () => {
    await pickLisbon();
    await editLisbon();
    // The owner has A1's finished file in an album already.
    const own = 'asset-own';
    fakeTools.library.push({
      id: own,
      file: '/camera/IMG_0001.jpg',
      checksum: createHash('sha1')
        .update(await readFile(finalOf('A1')))
        .digest('hex'),
    });
    fakeTools.albums.push({
      id: 'album-own',
      name: 'Holidays',
      assets: [
        { id: own, fileName: 'IMG_0001.jpg', favorite: false, trashed: false },
      ],
    });
    await runOk('publish', 'lisbon', '--album', 'Holidays');
    await allFromBefore(['asset-old']);
    await Bun.write(finalOf('A1'), 'another A1');
    const edited = await runOk('publish', 'lisbon', 'A1');
    expect(edited).toMatchObject({ published: 1, outdated: [] });
    expect(assetsOf('album-own')).toContain(own);
    // The owner asked for it to be out of the shoot's album.
    await runOk('take-out', 'lisbon', 'A1', ...because);
    expect(assetsOf('album-own')).not.toContain(own);
    const again = await runOk('publish', 'lisbon');
    expect(again).toMatchObject({ outdated: [] });
  });

  it('takes on the album it leaves, also as the first thing it does', async () => {
    await publishLisbon();
    await fromBefore();
    const first = fakeTools.albums[0]?.name ?? '';
    await runOk('publish', 'lisbon', '--album', 'Second');
    const back = await runOk('publish', 'lisbon', '--album', first);
    expect(back).toMatchObject({
      album: { id: 'album-1' },
      published: 2,
      alreadyThere: 1,
    });
    expect(assetsOf('album-1')).toEqual(['asset-1', 'asset-3', 'asset-5']);
    const { photos } = await shootJson('publication.json');
    expect(photos).toContainEqual(
      expect.objectContaining({ photo: 'B', asset: 'asset-3', added: true }),
    );
    expect(await shootJson('removed.json').catch(() => [])).toEqual([]);
  });
});

/** Takes a photo that was just published back out, as the page's undo does. */
const undo = (photo: string, before: PublishedPhoto | undefined) =>
  Effect.runPromise(
    Effect.gen(function* () {
      yield* unpublish(yield* openShoot('lisbon'), photo, before);
    }).pipe(
      Effect.provide(fakeToolsLayer),
      Effect.provide(BunServices.layer),
      Effect.provide(
        ConfigProvider.layer(
          ConfigProvider.fromDotEnvContents(
            `HOME=${fake.home}\nXDG_DATA_HOME=${join(fake.home, 'data')}`,
          ),
        ),
      ),
    ),
  );

describe('the page, undoing a publish', () => {
  it('leaves an upload that a photo taken on is too', async () => {
    await publishLisbon();
    await fromBefore();
    await runOk('publish', 'lisbon', 'A1');
    const { photos } = await shootJson('publication.json');
    // A1 is published again as the same file as B, which was taken on.
    await copyFile(finalOf('B'), finalOf('A1'));
    await runOk('publish', 'lisbon', 'A1');
    await undo(
      'A1',
      photos.find((one: PublishedPhoto) => one.photo === 'A1'),
    );
    expect(assetsOf('album-1')).toContain('asset-3');
    expect((await shootJson('publication.json')).adopted).toContainEqual({
      photo: 'B',
      asset: 'asset-3',
    });
  });
});
