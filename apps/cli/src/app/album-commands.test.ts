import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import {
  editLisbon,
  failureOf,
  pickLisbon,
  runOk,
  setUp,
  shootFile,
  shootJson,
  tearDown,
} from './command-fixtures.ts';
import { fakeTools } from './fake-tools.ts';

const publishLisbon = async () => {
  await pickLisbon();
  await editLisbon();
  await runOk('publish', 'lisbon');
};

/** The owner takes a photo out of the album in Immich. */
const removeInImmich = (photo: string) => {
  fakeTools.album = fakeTools.album?.filter(
    ({ fileName }) => fileName !== `${photo}-keepsake.jpg`,
  );
};

const inAlbum = async () => {
  const { photos } = await shootJson('album.json');
  return photos.map(({ photo }: { readonly photo: string }) => photo);
};

beforeEach(() => setUp(spyOn));
afterEach(tearDown);

describe('keepsake publish, with an album that changed in Immich', () => {
  it('notes what the album has', async () => {
    await publishLisbon();
    expect(await shootJson('album.json')).toMatchObject({
      name: 'Lisbon, May 2026',
      server: 'https://photos.example.com',
      photos: [
        { photo: 'A1', asset: 'asset-1', favorite: false },
        { photo: 'B', asset: 'asset-3', favorite: false },
        { photo: 'C', asset: 'asset-5', favorite: false },
      ],
    });
  });

  it('puts nothing back that was taken out there', async () => {
    await publishLisbon();
    removeInImmich('B');
    const result = await runOk('publish', 'lisbon');
    expect(result).toMatchObject({ published: 0, alreadyThere: 2 });
    expect(await inAlbum()).toEqual(['A1', 'C']);
    const [removed] = await shootJson('removed.json');
    expect(removed).toMatchObject({ photo: 'B', because: null });
  });

  it('puts it back when it is named', async () => {
    await publishLisbon();
    removeInImmich('B');
    const result = await runOk('publish', 'lisbon', 'B');
    expect(result).toMatchObject({ published: 1, outdated: ['asset-3'] });
    expect(await inAlbum()).toEqual(['A1', 'C', 'B']);
    expect(await shootJson('removed.json')).toEqual([]);
  });

  it('takes the newer of two versions until the older is trashed', async () => {
    await publishLisbon();
    await Bun.write(shootFile('edits', 'B', 'B-keepsake.jpg'), 'another');
    await runOk('publish', 'lisbon');
    const { photos } = await shootJson('album.json');
    expect(photos).toContainEqual({
      photo: 'B',
      asset: 'asset-7',
      favorite: false,
    });
    expect(photos).toHaveLength(3);
  });
});

describe('keepsake take-out', () => {
  it('takes photos out of the album and says why', async () => {
    await publishLisbon();
    const result = await runOk(
      'take-out',
      'lisbon',
      'B',
      'C',
      '--because',
      'Nothing happens in it.',
    );
    expect(result).toMatchObject({
      album: { name: 'Lisbon, May 2026' },
      takenOut: [
        { photo: 'B', asset: 'asset-3' },
        { photo: 'C', asset: 'asset-5' },
      ],
      inAlbum: 1,
    });
    expect(fakeTools.album?.map(({ id }) => id)).toEqual(['asset-1']);
    const { standing } = await runOk('show', 'lisbon', 'B');
    expect(standing).toMatchObject({
      kind: 'taken-out',
      because: 'Nothing happens in it.',
    });
    expect(await runOk('publish', 'lisbon')).toMatchObject({ published: 0 });
  });

  it('only notes why when a photo was taken out before', async () => {
    await publishLisbon();
    removeInImmich('B');
    await runOk('publish', 'lisbon');
    const [{ at }] = await shootJson('removed.json');
    const runs = fakeTools.runs.length;
    const because = ['--because', 'It is blurred.'];
    const result = await runOk('take-out', 'lisbon', 'B', ...because);
    expect(result).toMatchObject({ takenOut: [{ photo: 'B', asset: null }] });
    expect(await shootJson('removed.json')).toEqual([
      { photo: 'B', at, because: 'It is blurred.' },
    ]);
    const changed = fakeTools.runs
      .slice(runs)
      .filter(({ args }) => args[0] === 'albums' && args[1] === 'remove');
    expect(changed).toEqual([]);
  });

  it('takes out nothing when one photo never was in the album', async () => {
    await publishLisbon();
    const because = ['--because', 'It is blurred.'];
    const failure = await failureOf(
      'take-out',
      'lisbon',
      'B',
      'A2',
      ...because,
    );
    expect(failure.message).toContain('A2 isn’t in the album');
    expect(await inAlbum()).toEqual(['A1', 'B', 'C']);
  });

  it('needs an album', async () => {
    await pickLisbon();
    const because = ['--because', 'It is blurred.'];
    const failure = await failureOf('take-out', 'lisbon', 'B', ...because);
    expect(failure.message).toContain('keepsake publish lisbon');
  });
});
