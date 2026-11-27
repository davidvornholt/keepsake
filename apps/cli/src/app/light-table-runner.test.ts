import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { appendFileSync, existsSync } from 'node:fs';
import { noMoney } from '../features/light-table/mark-answers.ts';
import { choose, inImmich, publishLisbon } from './choice-fixtures.ts';
import {
  runOk,
  setUp,
  shootFile,
  shootJson,
  tearDown,
} from './command-fixtures.ts';
import { fakeModels } from './fake-models.ts';
import { fakeTools } from './fake-tools.ts';
import {
  change,
  eventually,
  handOver,
  marksOf,
  send,
  shootOf,
  whileServing,
} from './light-table-fixtures.ts';
import { whileHeld } from './lock-fixtures.ts';
import { busy, keepsakeInProcess, keepsakeRuns } from './runner-fixtures.ts';

// The test's reviewing model is a paid one, which the page's usual one isn't,
// so the hand-overs agree to more than the page would ask.
beforeEach(() => setUp(spyOn));
afterEach(tearDown);

type Shown = {
  readonly id: string;
  readonly answer: {
    readonly outcome: string;
    readonly note: string;
    readonly at: string;
  } | null;
};

/** The marks once each of them is answered, of which there is at least one. */
const answeredOf = (address: string) =>
  eventually(
    () => marksOf(address) as Promise<readonly [Shown, ...Array<Shown>]>,
    (marks) => marks.length > 0 && marks.every(({ answer }) => answer !== null),
  );

/** What the page shows of how the hand-overs go, once nothing works on them. */
const restingOf = (address: string) =>
  eventually(
    async () => (await shootOf(address)).carrying,
    ({ since }) => since === null,
  );

const markB = (address: string, note = change.note) =>
  send('PUT', `${address}/api/shoots/lisbon/marks`, {
    ...change,
    note,
    boxes: [],
  });

describe('a change mark that is handed over', () => {
  it('is carried out, published and answered with what changed', async () => {
    await publishLisbon();
    // The fake image model's pictures are all alike, and a change isn't.
    keepsakeInProcess(undefined, ([command]) => {
      if (command === 'edit') {
        appendFileSync(shootFile('edits', 'B', 'B-keepsake.jpg'), 'changed');
      }
    });
    const [marks, carrying] = await whileServing(async (address) => {
      await markB(address);
      await handOver(address, { dollars: 5 });
      return [await answeredOf(address), await restingOf(address)];
    });
    const [{ id, answer }] = marks;
    expect(answer).toMatchObject({ outcome: 'done' });
    expect(answer?.note).toStartWith('Changed: Remove the chair.');
    expect(keepsakeRuns()).toEqual([
      `edit lisbon --mark ${id} --budget 5`,
      `publish lisbon --mark ${id}`,
      'explain lisbon',
    ]);
    expect(carrying).toEqual({ since: null, stopped: null });
    // The upload it replaced is in the trash, and the new one in the album.
    expect(fakeTools.trashed).toEqual(['asset-3']);
    expect(inImmich()).toContain('B');
    expect(existsSync(shootFile('carrying-out.json'))).toBe(false);
  });

  it('is answered with why when nothing changed', async () => {
    await publishLisbon();
    keepsakeInProcess();
    fakeModels.answers.places = { everywhere: false, places: [] };
    const [{ answer }] = await whileServing(async (address) => {
      await markB(address);
      await handOver(address, { dollars: 5 });
      return answeredOf(address);
    });
    expect(answer).toEqual({
      outcome: 'not-done',
      note: 'The photo shows nothing that the wish is about.',
      at: expect.any(String),
    });
    expect(keepsakeRuns().filter((args) => args.startsWith('publish'))).toEqual(
      [],
    );
  });

  it('is answered as not done when nothing was agreed for it', async () => {
    await publishLisbon();
    keepsakeInProcess();
    const [{ answer }] = await whileServing(async (address) => {
      await markB(address);
      await handOver(address, { dollars: 0 });
      return answeredOf(address);
    });
    expect(answer).toMatchObject({ outcome: 'not-done', note: noMoney });
    expect(keepsakeRuns()).toEqual([]);
  });

  it('waits while another command works on the shoot', async () => {
    await publishLisbon();
    keepsakeInProcess();
    const [{ answer }] = await whileServing(async (address) => {
      await whileHeld(async () => {
        await markB(address);
        await handOver(address, { dollars: 5 });
        await eventually(
          async () => keepsakeRuns().length,
          (count) => count > 0,
        );
      });
      return answeredOf(address);
    });
    expect(answer).toMatchObject({ outcome: 'done' });
    expect(keepsakeRuns()[0]).toStartWith('edit lisbon --mark');
    expect(
      keepsakeRuns().filter((args) => args.startsWith('edit')).length,
    ).toBeGreaterThan(1);
  });

  it('goes on after a restart without paying for its edit again', async () => {
    await publishLisbon();
    // The first server stops as soon as the edit ended and was noted.
    let isEdited = false;
    keepsakeInProcess((args) => {
      if (isEdited) {
        return busy;
      }
      isEdited = args[0] === 'edit';
    });
    const id = await whileServing(async (address) => {
      await markB(address);
      await handOver(address, { dollars: 5 });
      await eventually(
        async () =>
          existsSync(shootFile('carrying-out.json'))
            ? Object.values((await shootJson('carrying-out.json')).marks)
            : [],
        (marks) =>
          marks.some((mark) => (mark as { edited: unknown }).edited !== null),
      );
      return (await marksOf(address))[0].id;
    });
    const before = keepsakeRuns().length;
    keepsakeInProcess();
    const [{ answer }] = await whileServing(answeredOf);
    expect(answer).toMatchObject({ outcome: 'done' });
    expect(keepsakeRuns().slice(before)).toEqual([
      `publish lisbon --mark ${id}`,
      'explain lisbon',
    ]);
  });
});

describe('an order that is handed over', () => {
  it('is edited, put into the album, and new until it was looked at', async () => {
    await publishLisbon();
    keepsakeInProcess();
    const [list, seen] = await whileServing(async (address) => {
      await choose(address, { photo: 'A2', wants: 'in' });
      await handOver(address, { dollars: 5, album: ['A2'] });
      await eventually(
        async () => (await shootOf(address)).ordered,
        (ordered) => ordered === null,
      );
      const listed = await (await fetch(`${address}/api/shoots`)).json();
      await send('POST', `${address}/api/shoots/lisbon/seen`, { photo: 'A2' });
      const after = await (await fetch(`${address}/api/shoots`)).json();
      return [listed.shoots[0], after.shoots[0]];
    });
    expect(inImmich()).toContain('A2');
    expect(keepsakeRuns()).toEqual([
      'edit lisbon A2 --budget 5',
      'publish lisbon A2',
      'explain lisbon',
    ]);
    expect(list).toMatchObject({ news: 1, newSince: expect.any(String) });
    expect(seen).toMatchObject({ news: 0, newSince: null });
    expect(await shootJson('added.json')).toEqual([
      { photo: 'A2', at: expect.any(String), seenAt: expect.any(String) },
    ]);
  });

  it('stops for more money, says so, and goes on when the owner agrees', async () => {
    await publishLisbon();
    keepsakeInProcess();
    const [stopped, after] = await whileServing(async (address) => {
      await choose(address, { photo: 'A2', wants: 'in' });
      await handOver(address, { dollars: 0.01, album: ['A2'] });
      const { stopped: waiting } = await eventually(
        async () => (await shootOf(address)).carrying,
        ({ stopped: stop }) => stop !== null,
      );
      await send('POST', `${address}/api/shoots/lisbon/go-on`, {
        dollars: 5,
      });
      await eventually(
        async () => (await shootOf(address)).ordered,
        (ordered) => ordered === null,
      );
      return [waiting, await restingOf(address)];
    });
    expect(stopped).toMatchObject({
      needs: 'money',
      photos: ['A2'],
      reason:
        'What you agreed to pay is used up, and one photo you ordered isn’t edited yet.',
      seenAt: null,
    });
    expect(after).toEqual({ since: null, stopped: null });
    expect(inImmich()).toContain('A2');
  });
});

describe('the marks command', () => {
  it('lists only what is still to be carried out', async () => {
    await publishLisbon();
    keepsakeInProcess();
    await whileServing(async (address) => {
      await markB(address);
      await handOver(address, { dollars: 5 });
      return answeredOf(address);
    });
    expect(await runOk('marks', 'lisbon')).toMatchObject({
      agreedDollars: 0,
      marks: [],
    });
  });
});
