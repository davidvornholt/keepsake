import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { writeFile } from 'node:fs/promises';
import {
  choose,
  pauseUploadOf,
  publishLisbon,
  settled,
} from './choice-fixtures.ts';
import {
  editLisbon,
  holdOutput,
  run,
  setUp,
  shootFile,
  shootJson,
  tearDown,
} from './command-fixtures.ts';
import { whileServing } from './light-table-fixtures.ts';

// What the page does at once, while commands work on the same shoot.

beforeEach(() => setUp(spyOn));
afterEach(tearDown);

describe('a photo put in while publish tells of replaced uploads', () => {
  it('keeps what publish forgot, and what the page published', async () => {
    await publishLisbon();
    await editLisbon('A2');
    await writeFile(shootFile('edits', 'B', 'B-keepsake.jpg'), 'another');
    const upload = pauseUploadOf('A2');
    await whileServing(async (address) => {
      const { written, release } = holdOutput();
      const publishing = run('publish', 'lisbon');
      await written;
      const choosing = choose(address, { photo: 'A2', wants: 'in' });
      await Promise.race([upload.reached, choosing]);
      release();
      await publishing;
      upload.resume();
      await choosing;
      await settled(address);
    });
    const publication = await shootJson('publication.json');
    expect(publication.outdated).toEqual([]);
    expect(
      publication.photos.map(({ photo }: { photo: string }) => photo),
    ).toContain('A2');
  });
});
