import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { BunServices } from '@effect/platform-bun';
import { ConfigProvider, Effect, Option } from 'effect';
import { unsettledOf } from '../features/light-table/hand-over.ts';
import { judgeOf } from '../shared/judge.ts';
import { standings } from '../shared/standing.ts';
import { openShoot } from '../shared/store.ts';
import {
  choose,
  pauseUploadOf,
  publishLisbon,
  settled,
} from './choice-fixtures.ts';
import {
  editLisbon,
  fake,
  holdOutput,
  run,
  runOk,
  setUp,
  shootFile,
  shootJson,
  tearDown,
} from './command-fixtures.ts';
import { fakeToolsLayer } from './fake-tools.ts';
import { handOver, whileServing } from './light-table-fixtures.ts';

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

/** Which file a path is, which a file written in its place isn't. */
const fileAt = (path: string) => (existsSync(path) ? statSync(path).ino : null);

/** How long an edit that isn't held up takes to begin on a photo. */
const whileEditBegins = 1500;

describe('a photo the page publishes while it is edited again', () => {
  it('is published as it was hashed, and edited after', async () => {
    await publishLisbon();
    await editLisbon('A2');
    const final = shootFile('edits', 'A2', 'A2-keepsake.jpg');
    const upload = pauseUploadOf('A2');
    const [hashed, during] = await whileServing(async (address) => {
      const choosing = choose(address, { photo: 'A2', wants: 'in' });
      await upload.reached;
      const before = { file: fileAt(final), bytes: readFileSync(final) };
      const editing = editLisbon('A2', '--again');
      await Promise.race([editing, Bun.sleep(whileEditBegins)]);
      const meanwhile = fileAt(final);
      upload.resume();
      await choosing;
      await editing;
      await settled(address);
      return [before, meanwhile];
    });
    expect(during).toBe(hashed.file);
    const publication = await shootJson('publication.json');
    expect(
      publication.photos.find(({ photo }: { photo: string }) => photo === 'A2')
        ?.digest,
    ).toBe(createHash('sha256').update(hashed.bytes).digest('hex'));
  });
});

/**
 * Goes over what was handed over with the photos as they stood before
 * `meanwhile`, as `marks` does when the page changes them in between.
 */
const withStandingsBefore = (meanwhile: () => Promise<unknown>) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const open = yield* openShoot('lisbon');
      const known = yield* standings(open, yield* judgeOf(open, Option.none()));
      yield* Effect.promise(meanwhile);
      return yield* unsettledOf(open.files, known);
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

describe('an order made while marks reads where photos stand', () => {
  it('isn’t done because of what stood before it was made', async () => {
    await publishLisbon();
    await whileServing((address) =>
      withStandingsBefore(async () => {
        await choose(address, { photo: 'A2', wants: 'in' });
        await handOver(address, { dollars: 0.75, album: ['A2'] });
      }),
    );
    expect(await runOk('marks', 'lisbon')).toMatchObject({
      agreedDollars: 0.75,
      album: { photos: ['A2'] },
    });
  });
});
