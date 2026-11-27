import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  setDefaultTimeout,
  spyOn,
} from 'bun:test';
import { existsSync } from 'node:fs';
import { inImmich, publishLisbon } from './choice-fixtures.ts';
import { pickLisbon, setUp, shootFile, tearDown } from './command-fixtures.ts';
import { fakeModels } from './fake-models.ts';
import {
  eventually,
  handOver,
  marksOf,
  pickedOf,
  whileServing,
} from './light-table-fixtures.ts';
import {
  answeredOf,
  busy,
  endedOnce,
  finalDigestOf,
  keepsakeInProcess,
  keepsakeRuns,
  markB,
  operationOf,
  progressOf,
  restingOf,
} from './runner-fixtures.ts';

// The test's reviewing model is a paid one, which the page's usual one isn't,
// so the hand-overs agree to more than the page would ask. A server on a
// slow machine takes a while for an edit.
setDefaultTimeout(30_000);
beforeEach(() => setUp(spyOn));
afterEach(tearDown);

describe('a change mark that a server didn’t get through', () => {
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
      await eventually(progressOf, (marks) =>
        marks.some(({ edited }) => edited !== null),
      );
      return (await marksOf(address))[0].id;
    });
    const before = keepsakeRuns().length;
    keepsakeInProcess();
    const [{ answer }] = await whileServing(async (address) => {
      const answered = await answeredOf(address);
      await restingOf(address);
      return answered;
    });
    expect(answer).toMatchObject({ outcome: 'done' });
    expect(keepsakeRuns().slice(before)).toEqual([
      `publish lisbon --mark ${id} --digest ${await finalDigestOf('B')}`,
      'explain lisbon',
    ]);
  });

  it('isn’t paid again when the server stopped after the edit ended, before it noted it', async () => {
    await publishLisbon();
    // The first server stops while the edit has ended and said what it came
    // to, before it hears of that.
    keepsakeInProcess(undefined, ([command]) =>
      command === 'edit' ? new Promise<void>(() => undefined) : undefined,
    );
    await whileServing(async (address) => {
      await markB(address);
      await handOver(address, { dollars: 5 });
      await endedOnce((args) => args.startsWith('edit'));
    });
    const [noted] = await progressOf();
    const operation = noted?.operation ?? '';
    expect(noted).toMatchObject({ edited: null });
    expect(existsSync(shootFile('operations', `${operation}.json`))).toBe(true);
    const paid = fakeModels.edits.length;
    expect(paid).toBeGreaterThan(0);
    keepsakeInProcess();
    const [{ answer }] = await whileServing(async (address) => {
      const answered = await answeredOf(address);
      await restingOf(address);
      return answered;
    });
    expect(answer).not.toBeNull();
    // The same edit again, which says what it came to without editing.
    const edits = keepsakeRuns().filter((args) => args.startsWith('edit'));
    expect(edits.map(operationOf)).toEqual([operation, operation]);
    expect(fakeModels.edits.length).toBe(paid);
    expect(existsSync(shootFile('operations', `${operation}.json`))).toBe(
      false,
    );
  });
});

describe('a change mark of a photo that wasn’t edited before', () => {
  it('is answered as done after a restart that came before its edit was noted', async () => {
    await pickLisbon();
    expect(existsSync(shootFile('edits', 'B', 'B-keepsake.jpg'))).toBe(false);
    // The first server stops while the edit has ended, before it hears of it.
    keepsakeInProcess(undefined, ([command]) =>
      command === 'edit' ? new Promise<void>(() => undefined) : undefined,
    );
    // A wish for a photo's first edit waits for an order of it.
    await whileServing(async (address) => {
      await markB(address);
      await handOver(address, { dollars: 10, album: await pickedOf(address) });
      await endedOnce((args) => args.startsWith('edit'));
    });
    expect(await progressOf()).toMatchObject([{ before: null, edited: null }]);
    keepsakeInProcess();
    const [{ answer }] = await whileServing(async (address) => {
      const answered = await answeredOf(address);
      await restingOf(address);
      return answered;
    });
    expect(answer).toMatchObject({ outcome: 'done' });
    expect(inImmich()).toContain('B');
  });
});
