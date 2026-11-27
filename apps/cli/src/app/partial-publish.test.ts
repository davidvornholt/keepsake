import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { createHash } from 'node:crypto';
import { copyFile, readFile } from 'node:fs/promises';
import {
  choose,
  failCameraUploadOf,
  publishLisbon,
  settled,
} from './choice-fixtures.ts';
import {
  editLisbon,
  failureOf,
  pickLisbon,
  runOk,
  setUp,
  shootFile,
  tearDown,
} from './command-fixtures.ts';
import { fakeTools } from './fake-tools.ts';
import { whileServing } from './light-table-fixtures.ts';

// What stays in an album when Immich takes a photo's finished file and then
// fails at the rest of it.

beforeEach(() => setUp(spyOn));
afterEach(tearDown);

const assetsOf = (album: string) =>
  (fakeTools.albums.find(({ id }) => id === album)?.assets ?? []).map(
    ({ id }) => id,
  );

const finalOf = (photo: string) =>
  shootFile('edits', photo, `${photo}-keepsake.jpg`);

describe('a photo Immich took only part of', () => {
  it('leaves what the album had of the same file', async () => {
    await pickLisbon();
    await editLisbon();
    const bytes = await readFile(finalOf('A1'));
    const own = 'asset-own';
    fakeTools.library.push({
      id: own,
      file: '/camera/IMG_0001.jpg',
      checksum: createHash('sha1').update(bytes).digest('hex'),
    });
    fakeTools.albums.push({
      id: 'album-own',
      name: 'Holidays',
      assets: [
        { id: own, fileName: 'IMG_0001.jpg', favorite: false, trashed: false },
      ],
    });
    failCameraUploadOf('A1');
    await failureOf('publish', 'lisbon', '--album', 'Holidays');
    expect(assetsOf('album-own')).toContain(own);
    fakeTools.pause = undefined;
    fakeTools.late = undefined;
    const again = await runOk('publish', 'lisbon');
    expect(again).toMatchObject({ album: { id: 'album-own' }, published: 3 });
    const because = ['--because', 'It is blurred.'];
    await runOk('take-out', 'lisbon', 'A1', ...because);
    expect(assetsOf('album-own')).toContain(own);
    await Bun.write(finalOf('A1'), 'another A1');
    const edited = await runOk('publish', 'lisbon', 'A1');
    expect(edited).toMatchObject({ published: 1, outdated: [] });
    expect(assetsOf('album-own')).toContain(own);
  });

  it('leaves the upload of a photo published before it', async () => {
    await pickLisbon();
    await editLisbon();
    await copyFile(finalOf('A1'), finalOf('B'));
    failCameraUploadOf('B');
    await failureOf('publish', 'lisbon');
    expect(assetsOf('album-1')).toContain('asset-1');
  });

  it('says so when it can’t be taken back out', async () => {
    await publishLisbon();
    await editLisbon('A2');
    // The upload of A2, the first after those publish sent.
    const asset = 'asset-7';
    failCameraUploadOf('A2', () => fakeTools.refused.add(asset));
    const [choice] = await whileServing(async (address) => {
      await choose(address, { photo: 'A2', wants: 'in' });
      return settled(address);
    });
    expect(choice?.failed).toContain(`${asset} is still in the album`);
    expect(assetsOf('album-1')).toContain(asset);
  });
});
