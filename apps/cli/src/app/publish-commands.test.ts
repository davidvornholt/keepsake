import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { writeFile } from 'node:fs/promises';
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

beforeEach(() => setUp(spyOn));
afterEach(tearDown);

describe('keepsake publish', () => {
  it('uploads each finished photo on top of the camera’s, once', async () => {
    await pickLisbon();
    await editLisbon();
    const result = await runOk('publish', 'lisbon');
    expect(result).toMatchObject({
      album: { name: 'Lisbon' },
      published: 3,
      alreadyThere: 0,
      outdated: [],
    });
    expect(fakeTools.uploads).toHaveLength(6);
    const stacks = fakeTools.runs.filter(
      ({ command, args }) => command === 'photos' && args[0] === 'stacks',
    );
    expect(stacks[0]?.args).toEqual(['stacks', 'create', 'asset-1', 'asset-2']);
    const again = await runOk('publish', 'lisbon');
    expect(again).toMatchObject({ published: 0, alreadyThere: 3 });
    expect(fakeTools.uploads).toHaveLength(6);
  });

  it('uploads a photo that was edited again, and names the old one', async () => {
    await pickLisbon();
    await editLisbon();
    await runOk('publish', 'lisbon');
    await writeFile(shootFile('edits', 'B', 'B-keepsake.jpg'), 'another');
    const result = await runOk('publish', 'lisbon');
    expect(result).toMatchObject({ published: 1, outdated: ['asset-3'] });
  });

  it('uploads a photo that wasn’t picked when it is named', async () => {
    await pickLisbon();
    await editLisbon('A2');
    const result = await runOk('publish', 'lisbon', 'A2');
    expect(result).toMatchObject({ published: 1, outdated: [] });
    expect(fakeTools.uploads[0]).toEndWith('A2-keepsake.jpg');
  });

  it('needs finished photos', async () => {
    await pickLisbon();
    const failure = await failureOf('publish', 'lisbon');
    expect(failure.message).toContain('keepsake edit lisbon');
    const named = await failureOf('publish', 'lisbon', 'B');
    expect(named.message).toContain('keepsake edit lisbon B');
  });

  it('names every photo that isn’t finished and publishes none', async () => {
    await pickLisbon();
    await editLisbon('A1');
    const failure = await failureOf('publish', 'lisbon', 'A1', 'B');
    expect(failure.message).toContain('B isn’t finished');
    expect(failure.message).toContain('keepsake edit lisbon B');
    expect(fakeTools.uploads).toEqual([]);
  });
});

const editAgain = (photo: string) =>
  writeFile(
    shootFile('edits', photo, `${photo}-keepsake.jpg`),
    `another ${photo}`,
  );

const publishLisbon = async () => {
  await pickLisbon();
  await editLisbon();
  return await runOk('publish', 'lisbon');
};

describe('keepsake publish, to a new album', () => {
  /** An album of an earlier trip, which has the shoot's title. */
  const lastYear = () => {
    fakeTools.albums.push({ id: 'last-year', name: 'Lisbon', assets: [] });
  };

  it('joins the album that has the title', async () => {
    lastYear();
    const result = await publishLisbon();
    expect(result).toMatchObject({
      album: { id: 'last-year', name: 'Lisbon' },
      published: 3,
    });
    expect(fakeTools.albums).toHaveLength(1);
    expect(fakeTools.albums[0]?.assets).toHaveLength(3);
  });

  it('joins an album of the title written otherwise', async () => {
    fakeTools.albums.push({ id: 'last-year', name: ' lisbon ', assets: [] });
    const result = await publishLisbon();
    expect(result).toMatchObject({ album: { id: 'last-year' }, published: 3 });
    expect(fakeTools.albums).toHaveLength(1);
  });

  it('joins a shared album of the title only when it is named', async () => {
    const shared = {
      id: 'friends',
      name: 'Lisbon',
      owner: 'Friend',
      assets: [],
    };
    fakeTools.albums.push(shared);
    const result = await publishLisbon();
    expect(result).toMatchObject({ album: { name: 'Lisbon' }, published: 3 });
    expect(result.album.id).not.toBe('friends');
    expect(shared.assets).toEqual([]);
    const named = await failureOf('publish', 'lisbon', '--album', 'Lisbon');
    expect(named.message).toContain('2 albums called Lisbon');
    fakeTools.albums = [shared];
    const joined = await runOk('publish', 'lisbon', '--album', 'lisbon');
    expect(joined).toMatchObject({ album: { id: 'friends' }, published: 3 });
  });

  it('makes a new album when only another name is like the title', async () => {
    fakeTools.albums.push({ id: 'other', name: 'Lisbon 2025', assets: [] });
    const result = await publishLisbon();
    expect(result).toMatchObject({ album: { id: 'album-2', name: 'Lisbon' } });
  });

  it('publishes nothing when several albums have the title', async () => {
    fakeTools.albums = [
      { id: 'spring', taken: { first: '2025-04-01', last: '2025-04-03' } },
      { id: 'one-day', taken: { first: '2025-09-14', last: '2025-09-14' } },
      { id: 'empty' },
    ].map((album) => ({ ...album, name: 'Lisbon', assets: [] }));
    await pickLisbon();
    await editLisbon();
    const failure = await failureOf('publish', 'lisbon');
    expect(failure._tag).toBe('InvalidInput');
    expect(failure.message).toContain(
      'Immich has 3 albums called Lisbon: one with photos from 2025-04-01 to 2025-04-03, one with photos of 2025-09-14, one without photos.',
    );
    expect(failure.message).toContain('--title');
    expect(fakeTools.uploads).toEqual([]);
    expect(fakeTools.albums).toHaveLength(3);
  });

  it('joins an album named with --album', async () => {
    fakeTools.albums.push({ id: 'porto', name: 'Porto', assets: [] });
    await pickLisbon();
    await editLisbon();
    const result = await runOk('publish', 'lisbon', '--album', 'Porto');
    expect(result).toMatchObject({ album: { id: 'porto' }, published: 3 });
    expect(fakeTools.albums).toHaveLength(1);
  });

  it('publishes to no album named when two have that name', async () => {
    fakeTools.albums = ['album-1', 'album-2'].map((id) => ({
      id,
      name: 'Porto',
      assets: [],
    }));
    await pickLisbon();
    await editLisbon();
    const failure = await failureOf('publish', 'lisbon', '--album', 'Porto');
    expect(failure.message).toContain('2 albums called Porto');
    expect(failure.message).toContain('give another name with --album');
    expect(fakeTools.uploads).toEqual([]);
  });

  it('publishes to no album named when it published to one of them', async () => {
    await publishLisbon();
    fakeTools.albums.push({ id: 'last-year', name: 'Lisbon', assets: [] });
    const failure = await failureOf('publish', 'lisbon', '--album', 'Lisbon');
    expect(failure.message).toContain('2 albums called Lisbon');
    await editAgain('B');
    const again = await runOk('publish', 'lisbon');
    expect(again).toMatchObject({ album: { id: 'album-1' }, published: 1 });
  });

  it('finds the album it made when it stopped before the first upload', async () => {
    await pickLisbon();
    await editLisbon();
    fakeTools.broken.add('A1-keepsake.jpg');
    await failureOf('publish', 'lisbon');
    expect(fakeTools.albums).toMatchObject([{ id: 'album-1', assets: [] }]);
    fakeTools.broken.clear();
    const result = await runOk('publish', 'lisbon');
    expect(result).toMatchObject({ album: { id: 'album-1' }, published: 3 });
    expect(fakeTools.albums).toHaveLength(1);
  });
});

describe('keepsake publish, when photos can’t tell whose an album is', () => {
  beforeEach(() => {
    fakeTools.user = null;
  });

  it('takes no album of the title whose owner photos can’t tell', async () => {
    const shared = {
      id: 'friends',
      name: 'Lisbon',
      owner: 'Friend',
      assets: [],
    };
    fakeTools.albums.push(shared);
    await pickLisbon();
    await editLisbon();
    const failed = await failureOf('publish', 'lisbon');
    expect(failed.message).toContain(
      "keepsake can't tell whether it is this account's own",
    );
    expect(failed.message).toContain('`photos status`');
    expect(fakeTools.albums).toEqual([shared]);
    expect(fakeTools.uploads).toEqual([]);
    const joined = await runOk('publish', 'lisbon', '--album', 'Lisbon');
    expect(joined).toMatchObject({ album: { id: 'friends' }, published: 3 });
  });

  it('says to rename several albums of the title when it can’t tell whose they are', async () => {
    fakeTools.albums = ['mine', 'friends'].map((id) => ({
      id,
      name: 'Lisbon',
      assets: [],
    }));
    await pickLisbon();
    await editLisbon();
    const failed = await failureOf('publish', 'lisbon');
    expect(failed.message).toContain('2 albums called Lisbon');
    expect(fakeTools.uploads).toEqual([]);
  });

  it('makes a new album of the title when photos can’t tell whose one is', async () => {
    const result = await publishLisbon();
    expect(result).toMatchObject({ album: { id: 'album-1' }, published: 3 });
  });
});

describe('keepsake publish, to the album it published to', () => {
  it('stays with an album that was renamed in Immich', async () => {
    await publishLisbon();
    const [album] = fakeTools.albums;
    if (album !== undefined) {
      album.name = 'Lisboa';
    }
    await editAgain('B');
    const result = await runOk('publish', 'lisbon');
    expect(result).toMatchObject({
      album: { id: 'album-1', name: 'Lisboa' },
      published: 1,
    });
    expect(fakeTools.albums).toHaveLength(1);
    expect(album?.assets.map(({ id }) => id)).toContain('asset-7');
  });

  it('calls nothing published that Immich kept out of the album', async () => {
    await pickLisbon();
    await editLisbon();
    fakeTools.refused.add('asset-1');
    const failure = await failureOf('publish', 'lisbon');
    expect(failure.message).toContain('did not put it into the album');
    fakeTools.refused.clear();
    const result = await runOk('publish', 'lisbon');
    expect(result).toMatchObject({ published: 3 });
    const { photos } = await shootJson('album.json');
    expect(
      photos.map(({ photo }: { readonly photo: string }) => photo),
    ).toEqual(['A1', 'B', 'C']);
  });

  it('keeps the favorite of the upload it replaces', async () => {
    await publishLisbon();
    for (const album of fakeTools.albums) {
      album.assets = album.assets.map((asset) =>
        asset.id === 'asset-3' ? { ...asset, favorite: true } : asset,
      );
    }
    await editAgain('B');
    await runOk('publish', 'lisbon');
    const { photos } = await shootJson('album.json');
    expect(photos).toContainEqual({
      photo: 'B',
      asset: 'asset-7',
      favorite: true,
    });
  });

  it('names a replaced upload after a publish that failed half-way', async () => {
    await publishLisbon();
    await editAgain('A1');
    await editAgain('B');
    fakeTools.broken.add('B-keepsake.jpg');
    await failureOf('publish', 'lisbon');
    fakeTools.broken.clear();
    const result = await runOk('publish', 'lisbon');
    expect(result).toMatchObject({
      published: 1,
      outdated: ['asset-1', 'asset-3'],
    });
    const again = await runOk('publish', 'lisbon');
    expect(again).toMatchObject({ published: 0, outdated: [] });
  });
});
