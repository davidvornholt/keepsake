import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { copyFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { BunServices } from '@effect/platform-bun';
import { ConfigProvider, Effect, Option } from 'effect';
import { choose as choosing, settle } from '../features/light-table/choices.ts';
import type { NewChoice } from '../features/light-table/schemas.ts';
import { judgeOf } from '../shared/judge.ts';
import { standings } from '../shared/standing.ts';
import { openShoot } from '../shared/store.ts';
import {
  choose,
  inImmich,
  outReason,
  publishLisbon,
  settled,
  standingOf,
} from './choice-fixtures.ts';
import {
  editLisbon,
  fake,
  runOk,
  setUp,
  shootFile,
  shootJson,
  tearDown,
} from './command-fixtures.ts';
import { fakeTools, fakeToolsLayer, type Run } from './fake-tools.ts';
import { change, marksOf, send, whileServing } from './light-table-fixtures.ts';
import { publishingLayer } from './publishing.ts';

// What the page does with a choice it stopped in the middle of, or that
// Immich took only part of.

beforeEach(() => setUp(spyOn));
afterEach(tearDown);

const instead = 'You chose A2 instead.';

/** The upload of A1, which publish sent to Immich first. */
const assetOfA1 = 'asset-1';

const swap = (address: string) =>
  choose(address, {
    photo: 'A2',
    wants: 'in',
    instead: 'A1',
    because: instead,
  });

/** Saves a choice as a page that stopped before it was done left it. */
const leftByPage = (photo: string, wants: 'in' | 'out') =>
  writeFile(
    shootFile('choices.json'),
    JSON.stringify([
      {
        action: 'stopped',
        photo,
        wants,
        because: wants === 'out' ? outReason : null,
        madeAt: '2026-11-27T10:00:00.000Z',
        failed: null,
      },
    ]),
  );

/**
 * Chooses as the page does, and stops where a program runs that `stopsAt`
 * picks, as a page does that is stopped then.
 */
const stoppedAt = (wanted: NewChoice, stopsAt: (run: Run) => boolean) => {
  fakeTools.pause = (run) =>
    stopsAt(run)
      ? Bun.sleep(0).then(() => {
          throw new Error('The page stopped.');
        })
      : undefined;
  return Effect.runPromise(
    Effect.gen(function* () {
      const open = yield* openShoot('lisbon');
      const known = yield* standings(open, yield* judgeOf(open, Option.none()));
      yield* choosing(open, known, wanted);
      yield* settle(open);
    }).pipe(
      Effect.provide(publishingLayer),
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
  )
    .catch(() => undefined)
    .finally(() => {
      fakeTools.pause = undefined;
    });
};

const pickedNow = async () =>
  (await shootJson('picks.json')).picks.map(
    ({ photo }: { photo: string }) => photo,
  );

describe('a photo used instead of one that is the same file in Immich', () => {
  it('leaves that one in the album', async () => {
    await publishLisbon();
    await editLisbon('A2');
    await copyFile(
      shootFile('edits', 'A1', 'A1-keepsake.jpg'),
      shootFile('edits', 'A2', 'A2-keepsake.jpg'),
    );
    const before = await standingOf('A1');
    const failed = await whileServing(async (address) => {
      await swap(address);
      return settled(address);
    });
    expect(failed).toHaveLength(2);
    expect(inImmich()).toEqual(['A1', 'B', 'C']);
    expect(await standingOf('A1')).toEqual(before);
  });
});

describe('a swap the page stopped in the middle of', () => {
  it('lets the photo that came in go back when the other stays', async () => {
    await publishLisbon();
    await editLisbon('A2');
    const before = await standingOf('A2');
    // The page stops as it takes A1 out, once A2 is in.
    await stoppedAt(
      { photo: 'A2', wants: 'in', instead: 'A1', because: instead },
      ({ args }) => args[1] === 'remove' && args.includes(assetOfA1),
    );
    const halfWay = inImmich();
    fakeTools.refused.add(assetOfA1);
    const failed = await whileServing(settled);
    expect(halfWay).toEqual(['A1', 'B', 'C', 'A2']);
    expect(failed).toHaveLength(2);
    expect(inImmich()).toEqual(['A1', 'B', 'C']);
    expect(await standingOf('A2')).toEqual(before);
  });
});

describe('a put-in the page stopped as Immich took the photo', () => {
  it('publishes all of it before it lets the choice go', async () => {
    await publishLisbon();
    await editLisbon('A2');
    await stoppedAt(
      { photo: 'A2', wants: 'in', because: null, instead: null },
      ({ args }) =>
        args[0] === 'upload' && args[1]?.endsWith('/A2/A2.jpg') === true,
    );
    // What reads the album next, as publishing one that is in it does,
    // finds the photo in it.
    await runOk('publish', 'lisbon', 'A1');
    const halfWay = await standingOf('A2');
    const left = await whileServing(settled);
    const { photos } = await shootJson('publication.json');
    const published = photos.find(
      ({ photo }: { photo: string }) => photo === 'A2',
    );
    const ran = (...args: ReadonlyArray<string>) =>
      fakeTools.runs.some((run) => args.every((arg) => run.args.includes(arg)));
    expect(halfWay).toMatchObject({ kind: 'album' });
    expect(left).toEqual([]);
    expect(published?.cameraAsset).toBeString();
    expect(ran('stacks', published?.asset, published?.cameraAsset)).toBe(true);
    expect(ran('tags', 'add', published?.asset)).toBe(true);
  });
});

describe('a choice the page stopped before it noted it', () => {
  it('chooses a photo that is in the album already', async () => {
    await publishLisbon();
    await editLisbon('A2');
    await runOk('publish', 'lisbon', 'A2');
    await leftByPage('A2', 'in');
    const left = await whileServing(settled);
    expect(left).toEqual([]);
    expect(await pickedNow()).toContain('A2');
  });

  it('lets the changes of a photo taken out already go', async () => {
    await publishLisbon();
    await whileServing((address) =>
      send('PUT', `${address}/api/shoots/lisbon/marks`, {
        ...change,
        photo: 'B',
        note: 'Warmer.',
      }),
    );
    await runOk('take-out', 'lisbon', 'B', '--because', outReason);
    await leftByPage('B', 'out');
    const [left, marks] = await whileServing(async (address) => [
      await settled(address),
      await marksOf(address),
    ]);
    expect([left, marks]).toEqual([[], []]);
  });
});

describe('a photo Immich took only part of', () => {
  it('isn’t left in the album', async () => {
    await publishLisbon();
    await editLisbon('A2');
    const before = await standingOf('A2');
    // Immich takes the finished file, and then not the camera's own one.
    const camera = '/A2/A2.jpg';
    fakeTools.pause = ({ args }) => {
      if (args[0] === 'upload' && args[1]?.endsWith(camera)) {
        fakeTools.broken.add(camera);
      }
    };
    fakeTools.late = () => {
      fakeTools.broken.delete(camera);
    };
    const failed = await whileServing(async (address) => {
      await choose(address, { photo: 'A2', wants: 'in' });
      return settled(address);
    });
    expect(failed).toMatchObject([{ photo: 'A2', wants: 'in' }]);
    expect(inImmich()).toEqual(['A1', 'B', 'C']);
    expect(await standingOf('A2')).toEqual(before);
  });
});
