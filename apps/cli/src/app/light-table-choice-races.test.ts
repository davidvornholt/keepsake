import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { writeFile } from 'node:fs/promises';
import {
  editLisbon,
  holdOutput,
  pickLisbon,
  run,
  runOk,
  setUp,
  shootFile,
  shootJson,
  tearDown,
} from './command-fixtures.ts';
import { fakeTools } from './fake-tools.ts';
import {
  eventually,
  send,
  shootOf,
  whileServing,
} from './light-table-fixtures.ts';

// What the page does at once, while commands work on the same shoot.

beforeEach(() => setUp(spyOn));
afterEach(tearDown);

const patiently = 600;

type Wanted = {
  readonly photo: string;
  readonly wants: 'in' | 'out';
  readonly because?: string | null;
  readonly instead?: string | null;
};

const choose = (address: string, wanted: Wanted) =>
  send('POST', `${address}/api/shoots/lisbon/choices`, {
    because: wanted.wants === 'out' ? 'You didn’t want it in the album.' : null,
    instead: null,
    ...wanted,
  });

const settled = (address: string) =>
  eventually(
    async () => (await shootOf(address)).choices,
    (choices) => choices.length === 0,
    patiently,
  );

const publishLisbon = async () => {
  await pickLisbon();
  await editLisbon();
  await runOk('publish', 'lisbon');
};

/** Holds the upload of a photo's finished file until `resume`. */
const pauseUploadOf = (photo: string) => {
  const reached = Promise.withResolvers<void>();
  const resumed = Promise.withResolvers<void>();
  fakeTools.pause = ({ command, args }) => {
    if (
      command === 'photos' &&
      args[0] === 'upload' &&
      args.some((arg) => arg.endsWith(`${photo}-keepsake.jpg`))
    ) {
      reached.resolve();
      return resumed.promise;
    }
  };
  return { reached: reached.promise, resume: () => resumed.resolve() };
};

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
