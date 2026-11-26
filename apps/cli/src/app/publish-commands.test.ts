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
      album: { name: 'Lisbon, May 2026' },
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
});

const editAgain = (photo: string) =>
  writeFile(shootFile('edits', photo, `${photo}-keepsake.jpg`), 'another');

const publishLisbon = async () => {
  await pickLisbon();
  await editLisbon();
  return await runOk('publish', 'lisbon');
};

describe('keepsake publish, to the album it published to', () => {
  it('publishes to no album when two have its name', async () => {
    fakeTools.albums = ['album-1', 'album-2'].map((id) => ({
      id,
      name: 'Lisbon, May 2026',
      assets: [],
    }));
    await pickLisbon();
    await editLisbon();
    const failure = await failureOf('publish', 'lisbon');
    expect(failure.message).toContain('2 albums called Lisbon, May 2026');
    expect(fakeTools.uploads).toEqual([]);
  });

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
