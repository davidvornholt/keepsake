import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  setDefaultTimeout,
  spyOn,
} from 'bun:test';
import { appendFileSync, existsSync, readdirSync } from 'node:fs';
import { copyFile } from 'node:fs/promises';
import { changeUsedUp } from '../features/light-table/mark-answers.ts';
import { inImmich, publishLisbon } from './choice-fixtures.ts';
import {
  runOk,
  setUp,
  shootFile,
  shootJson,
  tearDown,
} from './command-fixtures.ts';
import { fakeModels, freeChatUsage } from './fake-models.ts';
import { fakeTools } from './fake-tools.ts';
import {
  eventually,
  handOver,
  marksOf,
  whileServing,
} from './light-table-fixtures.ts';
import { whileHeld } from './lock-fixtures.ts';
import {
  answeredOf,
  busy,
  endedOnce,
  goOn,
  keepsakeInProcess,
  keepsakeRuns,
  markB,
  restingOf,
  stopOf,
} from './runner-fixtures.ts';
import { editLater, laterAlbum, laterFinal } from './shared-album-fixtures.ts';

// The test's reviewing model is a paid one, which the page's usual one isn't,
// so the hand-overs agree to more than the page would ask. A server on a
// slow machine takes a while for an edit.
setDefaultTimeout(30_000);
beforeEach(() => setUp(spyOn));
afterEach(tearDown);

const operationOf = (args: string) => args.split('--operation ')[1] ?? '';

/** The noted progress of each mark, while there is any. */
const progressOf = async () =>
  existsSync(shootFile('carrying-out.json'))
    ? Object.values(
        (await shootJson('carrying-out.json')).marks as Record<
          string,
          { readonly operation: string | null; readonly edited: unknown }
        >,
      )
    : [];

/** What was handed over, as it was noted. */
const handOversNoted = async () =>
  Promise.all(
    readdirSync(shootFile('hand-overs')).map((name) =>
      shootJson('hand-overs', name),
    ),
  );

describe('a change mark that is handed over', () => {
  it('is carried out, published and answered with what changed', async () => {
    await publishLisbon();
    // The fake image model's pictures are all alike, and a change isn't, so
    // it is made to differ from what was published before.
    keepsakeInProcess(([command]) => {
      if (command === 'publish') {
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
    const [edit, ...rest] = keepsakeRuns();
    expect(edit).toStartWith(
      `edit lisbon --mark ${id} --budget 5 --operation `,
    );
    expect(rest).toEqual([`publish lisbon --mark ${id}`, 'explain lisbon']);
    expect(carrying).toEqual({ since: null, stopped: null });
    // The upload it replaced is in the trash, and the new one in the album.
    expect(fakeTools.trashed).toEqual(['asset-3']);
    expect(inImmich()).toContain('B');
    expect(
      existsSync(shootFile('operations', `${operationOf(edit ?? '')}.json`)),
    ).toBe(false);
  });

  it('is answered with why when nothing changed', async () => {
    await publishLisbon();
    keepsakeInProcess();
    fakeModels.answers.places = {
      everywhere: false,
      bringsBack: false,
      places: [],
    };
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

  it('waits for more money, and makes the change with its wish once the owner pays it, once', async () => {
    await publishLisbon();
    keepsakeInProcess();
    const [waiting, marks] = await whileServing(async (address) => {
      await markB(address, 'Remove the bench');
      await handOver(address, { dollars: 0 });
      const stop = await stopOf(address);
      // A second word, and one from a tab that showed an older stop, add nothing.
      await goOn(address, stop.id, 5);
      await goOn(address, stop.id, 5);
      await goOn(address, 'older', 5);
      return [stop, await answeredOf(address)];
    });
    expect(waiting).toMatchObject({
      needs: 'money',
      photos: ['B'],
      reason: changeUsedUp,
    });
    const [{ id, answer }] = marks;
    expect(answer).not.toBeNull();
    expect(keepsakeRuns()[0]).toStartWith(
      `edit lisbon --mark ${id} --budget 5 `,
    );
    expect(fakeModels.edits.at(-1)?.prompt).toContain('Remove the bench');
    expect(await handOversNoted()).toMatchObject([
      { dollars: 5, approved: [waiting.id] },
    ]);
  });

  it('waits while another command works on the shoot', async () => {
    await publishLisbon();
    keepsakeInProcess();
    const [{ answer }] = await whileServing(async (address) => {
      await whileHeld(async () => {
        await markB(address);
        await handOver(address, { dollars: 5 });
        // Until the edit found the shoot busy.
        await endedOnce((args) => args.startsWith('edit'));
      });
      return answeredOf(address);
    });
    expect(answer).toMatchObject({ outcome: 'done' });
    expect(
      keepsakeRuns().filter((args) => args.startsWith('edit')).length,
    ).toBeGreaterThan(1);
  });
});

describe('a change mark that runs out of money', () => {
  it('waits for more money when it runs out in the middle of a change, and goes on with what is left', async () => {
    await publishLisbon();
    keepsakeInProcess();
    fakeModels.chatUsage = freeChatUsage;
    const box = { left: 0.1, top: 0.4, right: 0.3, bottom: 0.6 };
    fakeModels.answers.places = {
      everywhere: false,
      bringsBack: false,
      places: [{ part: 0, what: 'Remove the bench', isRemoval: true, box }],
    };
    fakeModels.answers.choices = {
      places: [{ place: 1, best: 0, notes: 'A leg of it is left' }],
    };
    const before = fakeModels.edits.length;
    const [stop, pending, edits, marks] = await whileServing(
      async (address) => {
        await markB(address, 'Remove the bench');
        // One attempt fits, a second one doesn't.
        await handOver(address, { dollars: 1 });
        const waiting = await stopOf(address);
        const shown = await marksOf(address);
        const made = fakeModels.edits.length - before;
        await goOn(address, waiting.id, 5);
        return [waiting, shown, made, await answeredOf(address)];
      },
    );
    expect(stop).toMatchObject({ needs: 'money', reason: changeUsedUp });
    expect(pending).toMatchObject([{ answer: null }]);
    expect(edits).toBe(1);
    // Only the second attempt is made, at the place that is left.
    expect(fakeModels.edits.length - before).toBe(2);
    expect(fakeModels.edits.at(-1)?.prompt).toContain(
      'An earlier attempt failed: A leg of it is left.',
    );
    expect(marks[0].answer?.note).toContain('A leg of it is left');
  });
});

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
      `publish lisbon --mark ${id}`,
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

describe('a change mark whose photo changed meanwhile', () => {
  it('isn’t put into the album when another edit came before the server heard of it', async () => {
    await publishLisbon();
    keepsakeInProcess(undefined, ([command]) =>
      command === 'edit' ? new Promise<void>(() => undefined) : undefined,
    );
    await whileServing(async (address) => {
      await markB(address);
      await handOver(address, { dollars: 5 });
      await endedOnce((args) => args.startsWith('edit'));
    });
    // Another edit replaced what the mark's edit made.
    appendFileSync(shootFile('edits', 'B', 'B-keepsake.jpg'), 'edited again');
    keepsakeInProcess();
    const [stop, marks] = await whileServing(async (address) => [
      await stopOf(address),
      await marksOf(address),
    ]);
    expect(stop).toMatchObject({
      needs: 'retry',
      photos: ['B'],
      reason: expect.stringContaining('edited again after this change'),
    });
    expect(marks).toMatchObject([{ answer: null }]);
    expect(keepsakeRuns().filter((args) => args.startsWith('publish'))).toEqual(
      [],
    );
  });
});

describe('a change mark of a photo another shoot published too', () => {
  it('leaves the upload it replaced, since the other shoot names it', async () => {
    await publishLisbon();
    // The other shoot's B is the same file, so Immich has one upload of it.
    await editLater((photo) =>
      copyFile(
        shootFile('edits', photo, `${photo}-keepsake.jpg`),
        laterFinal(photo),
      ),
    );
    await runOk('publish', 'later');
    const { photos } = await laterAlbum();
    expect(photos).toContainEqual(
      expect.objectContaining({ photo: 'B', asset: 'asset-3' }),
    );
    keepsakeInProcess(([command]) => {
      if (command === 'publish') {
        appendFileSync(shootFile('edits', 'B', 'B-keepsake.jpg'), 'changed');
      }
    });
    const [{ answer }] = await whileServing(async (address) => {
      await markB(address);
      await handOver(address, { dollars: 5 });
      const answered = await answeredOf(address);
      await restingOf(address);
      return answered;
    });
    expect(answer).toMatchObject({ outcome: 'done' });
    expect(fakeTools.trashed).toEqual([]);
    expect(fakeTools.albums[0]?.assets.map(({ id }) => id)).toContain(
      'asset-3',
    );
  });
});

describe('the marks command', () => {
  it('lists only what is still to be carried out', async () => {
    await publishLisbon();
    keepsakeInProcess();
    await whileServing(async (address) => {
      await markB(address);
      await handOver(address, { dollars: 5 });
      await answeredOf(address);
      return restingOf(address);
    });
    expect(await runOk('marks', 'lisbon')).toMatchObject({
      agreedDollars: 0,
      marks: [],
    });
  });
});
