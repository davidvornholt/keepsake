import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { writeFile } from 'node:fs/promises';
import { withChoice } from '../shared/lock.ts';
import {
  choicesOf,
  choose,
  inImmich,
  outReason,
  publishLisbon,
  settled,
  standingOf,
} from './choice-fixtures.ts';
import {
  editLisbon,
  pickLisbon,
  setUp,
  shootFile,
  shootJson,
  tearDown,
} from './command-fixtures.ts';
import { fakeTools } from './fake-tools.ts';
import { send, statusOf, whileServing } from './light-table-fixtures.ts';
import { whileHeld } from './lock-fixtures.ts';

// What the page does when Immich refuses part of a choice, or when the page
// stopped half-way through one.

beforeEach(() => setUp(spyOn));
afterEach(tearDown);

const dismiss = (address: string, action: string) =>
  send('DELETE', `${address}/api/shoots/lisbon/choices/${action}`);

const instead = 'You chose A2 instead.';

/** The upload of A1, which publish sent to Immich first. */
const assetOfA1 = 'asset-1';

/** The upload of B, which publish sent after A1 and its RAW file. */
const assetOfB = 'asset-3';

/** The upload of A2, the first after those publish sent. */
const assetOfA2 = 'asset-7';

describe('a finished photo that Immich doesn’t take', () => {
  it('stays where it stood, and can be put in again', async () => {
    await publishLisbon();
    await editLisbon('A2');
    const before = await standingOf('A2');
    fakeTools.refused.add(assetOfA2);
    const [failed, standing, again] = await whileServing(async (address) => {
      await choose(address, { photo: 'A2', wants: 'in' });
      const [choice] = await settled(address);
      const after = await standingOf('A2');
      await dismiss(address, choice?.action ?? '');
      fakeTools.refused.clear();
      const status = await statusOf(
        choose(address, { photo: 'A2', wants: 'in' }),
      );
      await settled(address);
      return [choice, after, status];
    });
    expect(failed).toMatchObject({ photo: 'A2', wants: 'in' });
    expect(failed?.failed).not.toBeNull();
    expect(standing).toEqual(before);
    expect(again).toBe(200);
    expect(inImmich()).toEqual(['A1', 'B', 'C', 'A2']);
  });

  it('keeps one that was taken out out, with its reason', async () => {
    await publishLisbon();
    await whileServing(async (address) => {
      await choose(address, { photo: 'B', wants: 'out' });
      fakeTools.refused.add(assetOfB);
      await choose(address, { photo: 'B', wants: 'in' });
      await settled(address);
    });
    expect(await standingOf('B')).toMatchObject({
      kind: 'taken-out',
      because: outReason,
    });
    expect(inImmich()).toEqual(['A1', 'C']);
  });
});

describe('a choice the page stopped half-way through', () => {
  it('goes on until the photo is in Immich', async () => {
    await publishLisbon();
    await editLisbon('A2');
    // Chosen, as an earlier page did before it published the photo.
    const list = await shootJson('picks.json');
    const [first] = list.picks;
    await writeFile(
      shootFile('picks.json'),
      JSON.stringify({
        ...list,
        picks: [...list.picks, { ...first, photo: 'A2' }],
      }),
    );
    const part = {
      action: 'swapping',
      because: null,
      madeAt: '2026-11-27T10:00:00.000Z',
      failed: null,
    };
    await writeFile(
      shootFile('choices.json'),
      JSON.stringify([
        { ...part, photo: 'A2', wants: 'in' },
        { ...part, photo: 'A1', wants: 'out', because: instead },
      ]),
    );
    const left = await whileServing(settled);
    expect(left).toEqual([]);
    expect(inImmich()).toEqual(['B', 'C', 'A2']);
    expect(await standingOf('A1')).toMatchObject({
      kind: 'taken-out',
      because: instead,
    });
  });

  it('takes a photo out that a pick left out meanwhile', async () => {
    await pickLisbon();
    await whileServing((address) =>
      whileHeld(
        async () => {
          await choose(address, { photo: 'B', wants: 'out' });
          const list = await shootJson('picks.json');
          await writeFile(
            shootFile('picks.json'),
            JSON.stringify({
              ...list,
              picks: list.picks.filter(
                ({ photo }: { photo: string }) => photo !== 'B',
              ),
            }),
          );
        },
        'lisbon',
        withChoice,
      ).then(() => settled(address)),
    );
    expect(await standingOf('B')).toMatchObject({
      kind: 'taken-out',
      because: outReason,
    });
  });
});

describe('a photo used instead of one Immich keeps in the album', () => {
  const swap = (address: string) =>
    choose(address, {
      photo: 'A2',
      wants: 'in',
      instead: 'A1',
      because: instead,
    });

  it('stays out too, and says why', async () => {
    await publishLisbon();
    await editLisbon('A2');
    const before = await standingOf('A2');
    fakeTools.refused.add(assetOfA1);
    const [failed, again] = await whileServing(async (address) => {
      await swap(address);
      const choices = await settled(address);
      await dismiss(address, choices[0]?.action ?? '');
      fakeTools.refused.clear();
      await swap(address);
      return [choices, await settled(address)];
    });
    expect(failed).toMatchObject([
      { photo: 'A2', wants: 'in' },
      { photo: 'A1', wants: 'out' },
    ]);
    expect(failed[0]?.failed).toContain('did not take A1 out');
    expect(again).toEqual([]);
    expect(inImmich()).toEqual(['B', 'C', 'A2']);
    expect(before.kind).not.toBe('album');
  });

  it('is in the album as it was before, after it went in for a moment', async () => {
    await publishLisbon();
    await editLisbon('A2');
    const before = await standingOf('A2');
    fakeTools.refused.add(assetOfA1);
    const [failed, standing] = await whileServing(async (address) => {
      await swap(address);
      return [await settled(address), await standingOf('A2')];
    });
    expect(failed).toHaveLength(2);
    expect(inImmich()).toEqual(['A1', 'B', 'C']);
    expect(standing).toEqual(before);
  });

  it('stays to be seen to when it can’t be taken back out', async () => {
    await publishLisbon();
    await editLisbon('A2');
    fakeTools.refused.add(assetOfA1);
    fakeTools.pause = ({ args }) => {
      if (args[1] === 'remove' && args.includes(assetOfA1)) {
        fakeTools.refused.add(assetOfA2);
      }
    };
    const failed = await whileServing(async (address) => {
      await swap(address);
      await settled(address);
      return choicesOf(address);
    });
    expect(failed).toMatchObject([
      { photo: 'A2', wants: 'in' },
      { photo: 'A1', wants: 'out' },
    ]);
    expect(failed[0]?.failed).toContain('couldn’t be taken back out');
    expect(inImmich()).toEqual(['A1', 'B', 'C', 'A2']);
  });
});
