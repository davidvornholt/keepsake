import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { rm, writeFile } from 'node:fs/promises';
import process from 'node:process';
import { withChoice } from '../shared/lock.ts';
import {
  editLisbon,
  pickLisbon,
  runOk,
  setUp,
  shootFile,
  shootJson,
  tearDown,
} from './command-fixtures.ts';
import { fakeTools, firstAlbum } from './fake-tools.ts';
import {
  eventually,
  handOver,
  marksOf,
  pickedOf,
  send,
  shootOf,
  statusOf,
  whileServing,
} from './light-table-fixtures.ts';
import { whileHeld } from './lock-fixtures.ts';

beforeEach(() => setUp(spyOn));
afterEach(tearDown);

const because = 'You didn’t want it in the album.';

type Wanted = {
  readonly photo: string;
  readonly wants: 'in' | 'out';
  readonly because?: string | null;
  readonly instead?: string | null;
};

/** What the page sends when the owner puts a photo in or takes one out. */
const choose = (address: string, wanted: Wanted) =>
  send('POST', `${address}/api/shoots/lisbon/choices`, {
    because: wanted.wants === 'out' ? because : null,
    instead: null,
    ...wanted,
  });

/** The photos in the album in Immich, by their file. */
const inImmich = () =>
  (firstAlbum() ?? []).map(({ fileName }) => fileName.split('-')[0]);

const standingOf = async (photo: string) =>
  (await runOk('show', 'lisbon', photo)).standing;

const publishLisbon = async () => {
  await pickLisbon();
  await editLisbon();
  await runOk('publish', 'lisbon');
};

const serving = <A>(visit: (address: string) => Promise<A>) =>
  whileServing(visit);

/** What the page ran keepsake for, which a choice alone never needs. */
const keepsakeRuns = () =>
  fakeTools.runs.filter(({ command }) => command === 'keepsake');

const choicesOf = async (address: string) => (await shootOf(address)).choices;

describe('taking a photo out on the page', () => {
  it('takes it out of the album at once', async () => {
    await publishLisbon();
    const [status, marks, choices] = await serving(async (address) => [
      await statusOf(choose(address, { photo: 'B', wants: 'out' })),
      await marksOf(address),
      await choicesOf(address),
    ]);
    expect([status, marks, choices]).toEqual([200, [], []]);
    expect(inImmich()).toEqual(['A1', 'C']);
    expect(await standingOf('B')).toMatchObject({ kind: 'taken-out', because });
    expect(keepsakeRuns()).toEqual([]);
  });

  it('takes it out of the choice when there is no album yet', async () => {
    await pickLisbon();
    const picked = await serving(async (address) => {
      await choose(address, { photo: 'B', wants: 'out' });
      return pickedOf(address);
    });
    expect(picked).toEqual(['A1', 'C']);
    expect(await standingOf('B')).toMatchObject({ kind: 'taken-out', because });
    expect(fakeTools.uploads).toEqual([]);
    expect(keepsakeRuns()).toEqual([]);
  });

  it('says so when Immich refuses, and the photo stays in', async () => {
    await publishLisbon();
    fakeTools.refused.add('asset-3');
    const [chosen, refused, dismissed] = await serving(async (address) => {
      const answer = await choose(address, { photo: 'B', wants: 'out' });
      const [choice] = await choicesOf(address);
      await send(
        'DELETE',
        `${address}/api/shoots/lisbon/choices/${choice.action}`,
      );
      return [await answer.json(), choice, await choicesOf(address)];
    });
    expect(chosen).toEqual({ action: refused.action });
    expect(refused).toMatchObject({ photo: 'B', wants: 'out' });
    expect(refused.failed).toContain('did not take B out');
    expect(dismissed).toEqual([]);
    expect(inImmich()).toEqual(['A1', 'B', 'C']);
    expect(await standingOf('B')).toMatchObject({ kind: 'album' });
  });
});

describe('putting a photo in on the page', () => {
  it('chooses it at once', async () => {
    await pickLisbon();
    const picked = await serving(async (address) => {
      await choose(address, { photo: 'A2', wants: 'in' });
      return pickedOf(address);
    });
    expect(picked).toEqual(['A1', 'A2', 'B', 'C']);
    const { picks } = await shootJson('picks.json');
    expect(picks.at(-1)).toMatchObject({ photo: 'A2', moment: 'A1' });
    expect(fakeTools.uploads).toEqual([]);
    expect(keepsakeRuns()).toEqual([]);
  });

  it('puts a finished photo straight into the album', async () => {
    await publishLisbon();
    await editLisbon('A2');
    await serving((address) => choose(address, { photo: 'A2', wants: 'in' }));
    expect(inImmich()).toEqual(['A1', 'B', 'C', 'A2']);
    expect(await standingOf('A2')).toMatchObject({ kind: 'album' });
    expect(keepsakeRuns()).toEqual([]);
  });

  it('publishes nothing while there is no album', async () => {
    await pickLisbon();
    await editLisbon('A2');
    const picked = await serving(async (address) => {
      await choose(address, { photo: 'A2', wants: 'in' });
      return pickedOf(address);
    });
    expect(picked).toEqual(['A1', 'A2', 'B', 'C']);
    expect(fakeTools.uploads).toEqual([]);
    expect(fakeTools.albums).toEqual([]);
  });

  it('makes no album in place of one deleted in Immich', async () => {
    await publishLisbon();
    await editLisbon('A2');
    fakeTools.albums = [];
    const uploads = fakeTools.uploads.length;
    const picked = await serving(async (address) => {
      await choose(address, { photo: 'A2', wants: 'in' });
      return pickedOf(address);
    });
    expect(picked).toContain('A2');
    expect(await standingOf('A2')).toMatchObject({ kind: 'picked' });
    expect(fakeTools.albums).toEqual([]);
    expect(fakeTools.uploads).toHaveLength(uploads);
  });

  it('can be ordered edited when it isn’t finished', async () => {
    await publishLisbon();
    await serving(async (address) => {
      await choose(address, { photo: 'A2', wants: 'in' });
      await handOver(address, { dollars: 0.75, album: ['A2'] });
    });
    expect(inImmich()).toEqual(['A1', 'B', 'C']);
    expect(await runOk('marks', 'lisbon')).toMatchObject({
      agreedDollars: 0.75,
      album: { photos: ['A2'] },
      marks: [],
    });
  });

  it('puts back a photo that was taken out', async () => {
    await publishLisbon();
    await serving(async (address) => {
      await choose(address, { photo: 'B', wants: 'out' });
      await choose(address, { photo: 'B', wants: 'in' });
    });
    expect(inImmich()).toEqual(['A1', 'C', 'B']);
    expect(await standingOf('B')).toMatchObject({ kind: 'album' });
  });

  it('uses it instead of another, as one', async () => {
    await publishLisbon();
    await editLisbon('A2');
    const instead = 'You chose A2 instead.';
    await serving((address) =>
      choose(address, {
        photo: 'A2',
        wants: 'in',
        instead: 'A1',
        because: instead,
      }),
    );
    expect(inImmich()).toEqual(['B', 'C', 'A2']);
    expect(await standingOf('A1')).toMatchObject({
      kind: 'taken-out',
      because: instead,
    });
  });

  it.each<Wanted>([
    { photo: 'D', wants: 'in' },
    { photo: 'B', wants: 'in' },
    { photo: 'A2', wants: 'out' },
    { photo: 'B', wants: 'out', because: ' ' },
    { photo: 'A2', wants: 'in', instead: 'A2', because },
    { photo: 'A2', wants: 'in', instead: 'B', because: null },
    { photo: 'B', wants: 'out', instead: 'A1' },
  ])('refuses what makes no sense: %p', async (wanted) => {
    await pickLisbon();
    const [status, picked] = await serving(async (address) => [
      await statusOf(choose(address, wanted)),
      await pickedOf(address),
    ]);
    expect([status, picked]).toEqual([400, ['A1', 'B', 'C']]);
  });
});

/** How many times to look for a choice that waited to be done. */
const patiently = 600;

describe('a choice while a command works on the shoot', () => {
  it('isn’t held up by an edit of other photos', async () => {
    await publishLisbon();
    await whileHeld(() =>
      serving((address) => choose(address, { photo: 'B', wants: 'out' })),
    );
    expect(inImmich()).toEqual(['A1', 'C']);
  });

  it('tells the page while another command changes the choice', async () => {
    await publishLisbon();
    const busy = await serving(async (address) => {
      const isBusy = async () => (await shootOf(address)).isChoiceBusy;
      const before = await isBusy();
      const during = await whileHeld(isBusy, 'lisbon', withChoice);
      return [before, during, await isBusy()];
    });
    expect(busy).toEqual([false, true, false]);
  });

  it('is on its way while the choice changes, and done after', async () => {
    await publishLisbon();
    const [waiting, after] = await serving(async (address) => {
      const before = await whileHeld(
        async () => {
          await choose(address, { photo: 'B', wants: 'out' });
          return [await choicesOf(address), inImmich()];
        },
        'lisbon',
        withChoice,
      );
      const done = await eventually(
        () => choicesOf(address),
        (choices) => choices.length === 0,
        patiently,
      );
      return [before, done];
    });
    expect(waiting).toMatchObject([
      [{ photo: 'B', wants: 'out', because, failed: null }],
      ['A1', 'B', 'C'],
    ]);
    expect(after).toEqual([]);
    expect(inImmich()).toEqual(['A1', 'C']);
  });

  it('is still done when the shoot couldn’t be forgotten meanwhile', async () => {
    await publishLisbon();
    const [forgot, after] = await serving(async (address) => {
      const status = await whileHeld(
        async () => {
          await choose(address, { photo: 'B', wants: 'out' });
          return statusOf(send('DELETE', `${address}/api/shoots/lisbon`));
        },
        'lisbon',
        withChoice,
      );
      const done = await eventually(
        () => choicesOf(address),
        (choices) => choices.length === 0,
        patiently,
      );
      return [status, done];
    });
    expect([forgot, after]).toEqual([400, []]);
    expect(inImmich()).toEqual(['A1', 'C']);
  });
});

describe('a choice that waited', () => {
  it('goes on as a whole when its cancellation is undone', async () => {
    await publishLisbon();
    await editLisbon('A2');
    const instead = 'You chose A2 instead.';
    const swap: Wanted = {
      photo: 'A2',
      wants: 'in',
      instead: 'A1',
      because: instead,
    };
    const after = await serving(async (address) => {
      await whileHeld(
        async () => {
          await choose(address, swap);
          // The owner presses the swap again, then Undo.
          await choose(address, { photo: 'A2', wants: 'out' });
          await choose(address, swap);
        },
        'lisbon',
        withChoice,
      );
      return eventually(
        () => choicesOf(address),
        (choices) => choices.length === 0,
        patiently,
      );
    });
    expect(after).toEqual([]);
    expect(inImmich()).toEqual(['B', 'C', 'A2']);
    expect(await standingOf('A1')).toMatchObject({
      kind: 'taken-out',
      because: instead,
    });
  });

  it('leaves a photo as it was when its put-in is taken back', async () => {
    await publishLisbon();
    const before = await standingOf('A2');
    const [waiting, after] = await serving(async (address) => {
      const held = await whileHeld(
        async () => {
          const putIn = await choose(address, { photo: 'A2', wants: 'in' });
          const waits = await choicesOf(address);
          const takeBack = await choose(address, { photo: 'A2', wants: 'out' });
          return [
            putIn.status,
            waits,
            takeBack.status,
            await choicesOf(address),
          ];
        },
        'lisbon',
        withChoice,
      );
      const done = await eventually(
        () => choicesOf(address),
        (choices) => choices.length === 0,
        patiently,
      );
      return [held, done];
    });
    expect(waiting).toMatchObject([
      200,
      [{ photo: 'A2', wants: 'in', failed: null }],
      200,
      [],
    ]);
    expect(after).toEqual([]);
    expect(inImmich()).toEqual(['A1', 'B', 'C']);
    expect(await standingOf('A2')).toEqual(before);
  });

  it('waits to publish a photo while it is edited', async () => {
    await publishLisbon();
    await editLisbon('A2');
    const activity = shootFile('activity.json');
    const record = { process: process.pid, step: 'edit', done: 0, total: 1 };
    await writeFile(activity, JSON.stringify({ ...record, photos: ['A2'] }));
    const [waiting, after] = await serving(async (address) => {
      await choose(address, { photo: 'A2', wants: 'in' });
      const before = await choicesOf(address);
      await rm(activity);
      const done = await eventually(
        () => choicesOf(address),
        (choices) => choices.length === 0,
        patiently,
      );
      return [before, done];
    });
    expect(waiting).toMatchObject([{ photo: 'A2', wants: 'in', failed: null }]);
    expect(after).toEqual([]);
    expect(inImmich()).toEqual(['A1', 'B', 'C', 'A2']);
  });
});
