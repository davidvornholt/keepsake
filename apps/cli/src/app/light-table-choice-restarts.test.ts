import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { copyFile, writeFile } from 'node:fs/promises';
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
  runOk,
  setUp,
  shootFile,
  shootJson,
  tearDown,
} from './command-fixtures.ts';
import { fakeTools } from './fake-tools.ts';
import { change, marksOf, send, whileServing } from './light-table-fixtures.ts';

// What the page does with a choice it stopped in the middle of, or that
// Immich took only part of.

beforeEach(() => setUp(spyOn));
afterEach(tearDown);

const instead = 'You chose A2 instead.';

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
