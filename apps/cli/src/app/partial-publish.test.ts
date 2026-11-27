import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { createHash } from 'node:crypto';
import { copyFile, readFile } from 'node:fs/promises';
import { failCameraUploadOf } from './choice-fixtures.ts';
import {
  editLisbon,
  failureOf,
  pickLisbon,
  setUp,
  shootFile,
  tearDown,
} from './command-fixtures.ts';
import { fakeTools } from './fake-tools.ts';

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
  });

  it('leaves the upload of a photo published before it', async () => {
    await pickLisbon();
    await editLisbon();
    await copyFile(finalOf('A1'), finalOf('B'));
    failCameraUploadOf('B');
    await failureOf('publish', 'lisbon');
    expect(assetsOf('album-1')).toContain('asset-1');
  });
});
