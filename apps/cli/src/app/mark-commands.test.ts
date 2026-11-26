import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { existsSync } from 'node:fs';
import process from 'node:process';
import {
  asked,
  editLisbon,
  failureOf,
  pickLisbon,
  runOk,
  setUp,
  shootFile,
  shootJson,
  tearDown,
} from './command-fixtures.ts';
import { fakeModels } from './fake-models.ts';

/** What was spent on the shoot so far, in dollars. */
const spentSoFar = async () =>
  existsSync(shootFile('spending.json'))
    ? Object.values(
        (await shootJson('spending.json')) as Record<
          string,
          { readonly dollars: number }
        >,
      ).reduce((sum, { dollars }) => sum + dollars, 0)
    : 0;

/** Saves what the owner handed over at once. */
const handedOver = async (id: string, overrides: object = {}) =>
  Bun.write(
    shootFile('hand-overs', `${id}.json`),
    JSON.stringify({
      id,
      at: '2026-04-01T11:00:00Z',
      dollars: 0,
      spentBefore: await spentSoFar(),
      marks: [],
      album: null,
      fulfilledAt: null,
      ...overrides,
    }),
  );

/** Saves a mark, and hands it over unless `handedOverAt` is null. */
const mark = async (
  id: string,
  {
    handedOverAt = '2026-04-01T11:00:00Z',
    ...overrides
  }: Record<string, unknown> = {},
) => {
  await Bun.write(
    shootFile('marks', `${id}.json`),
    JSON.stringify({
      id,
      photo: 'B',
      kind: 'change',
      note: 'Remove the chair',
      boxes: [],
      other: null,
      madeAt: '2026-04-01T10:00:00Z',
      answer: null,
      seenAt: null,
      ...overrides,
    }),
  );
  if (handedOverAt !== null) {
    await handedOver(`for-${id}`, { at: handedOverAt, marks: [id] });
  }
};

const until = async (isSo: () => boolean): Promise<void> => {
  if (!isSo()) {
    await Bun.sleep(5);
    await until(isSo);
  }
};

const notHandedOver = { handedOverAt: null };
const answered = {
  answer: { outcome: 'done', note: 'It is gone.', at: '2026-04-01T12:00:00Z' },
};

const idsOf = (listed: {
  readonly marks: ReadonlyArray<{ readonly id: string }>;
}) => listed.marks.map(({ id }) => id);

beforeEach(() => setUp(spyOn));
afterEach(tearDown);

describe('keepsake marks', () => {
  it('lists what was handed over and has no answer yet', async () => {
    await pickLisbon();
    await mark('second', { madeAt: '2026-04-01T10:30:00Z' });
    await mark('first');
    await mark('open', notHandedOver);
    await mark('over', answered);
    expect(idsOf(await runOk('marks', 'lisbon'))).toEqual(['first', 'second']);
    const all = idsOf(await runOk('marks', 'lisbon', '--all'));
    expect(new Set(all)).toEqual(new Set(['first', 'open', 'over', 'second']));
  });

  it('says where an agent finds the photos of a mark', async () => {
    await pickLisbon();
    await editLisbon();
    await runOk('publish', 'lisbon');
    await mark('swap', { photo: 'A2', kind: 'swap', note: '', other: 'A1' });
    const { link, marks } = await runOk('marks', 'lisbon');
    expect(link).toBeNull();
    expect(marks[0]).toMatchObject({
      id: 'swap',
      kind: 'swap',
      photo: 'A2',
      preview: shootFile('previews', 'A2.jpg'),
      final: null,
      asset: null,
      other: {
        photo: 'A1',
        final: shootFile('edits', 'A1', 'A1-keepsake.jpg'),
        asset: 'asset-1',
      },
    });
  });

  it('links to the photos while the page is served', async () => {
    await pickLisbon();
    await mark('one');
    const address = 'https://keepsake.example.com/';
    const serving = shootFile('..', '..', 'light-table.json');
    await Bun.write(serving, JSON.stringify({ process: process.pid, address }));
    const { link, marks } = await runOk('marks', 'lisbon');
    expect(link).toBe(`${address}lisbon`);
    expect(marks[0].link).toBe(`${address}lisbon/photos/B`);
  });

  it('waits until there are some', async () => {
    await pickLisbon();
    await mark('one', notHandedOver);
    const waiting = runOk('marks', 'lisbon', '--wait');
    await until(() => existsSync(shootFile('waiting.json')));
    expect((await shootJson('waiting.json')).process).toBe(process.pid);
    await mark('one');
    expect(idsOf(await waiting)).toEqual(['one']);
    expect(existsSync(shootFile('waiting.json'))).toBe(false);
  });

  it('says that the album is ordered, until it is made', async () => {
    await pickLisbon();
    await editLisbon('A1');
    const photos = ['A1', 'B'];
    await handedOver('order', { dollars: 2.25, album: photos });
    expect(await runOk('marks', 'lisbon')).toMatchObject({
      agreedDollars: 2.25,
      album: { at: '2026-04-01T11:00:00Z', photos, edited: 1 },
      marks: [],
    });
    await editLisbon();
    await runOk('publish', 'lisbon');
    expect(await runOk('marks', 'lisbon')).toMatchObject({
      agreedDollars: 0,
      album: null,
    });
  });

  it('waits only for new ones', async () => {
    await pickLisbon();
    const failure = await failureOf('marks', 'lisbon', '--wait', '--all');
    expect(failure.message).toBe('Give either --wait or --all.');
  });
});

describe('a hand-over', () => {
  it('waits for all of a hand-over, not for part of it', async () => {
    await pickLisbon();
    await mark('one', notHandedOver);
    await mark('two', { ...notHandedOver, photo: 'C' });
    const waiting = runOk('marks', 'lisbon', '--wait');
    await until(() => existsSync(shootFile('waiting.json')));
    // As a writer that stopped after the first of its marks left them.
    const one = shootFile('marks', 'one.json');
    const handed = { handedOverAt: '2026-04-01T11:00:00Z' };
    await Bun.write(
      one,
      JSON.stringify({ ...(await shootJson('marks', 'one.json')), ...handed }),
    );
    await handedOver('budget', { dollars: 1.5 });
    await Bun.sleep(1500);
    expect(existsSync(shootFile('waiting.json'))).toBe(true);
    await handedOver('both', { dollars: 1.5, marks: ['one', 'two'] });
    const listed = await waiting;
    expect(new Set(idsOf(listed))).toEqual(new Set(['one', 'two']));
    expect(listed.agreedDollars).toBe(1.5);
  });

  it('counts what was spent since against what was agreed', async () => {
    await pickLisbon();
    await handedOver('order', { dollars: 1.5, album: ['A1', 'B'] });
    await editLisbon('A1');
    const spent = await spentSoFar();
    const { agreedDollars } = await runOk('marks', 'lisbon');
    expect(agreedDollars).toBe(
      Math.max(0, Math.round((1.5 - spent) * 100) / 100),
    );
    expect(agreedDollars).toBeLessThan(1.5);
  });

  it('forgets an order once its photos are in the album', async () => {
    await pickLisbon();
    await runOk('pick', 'lisbon', '--maximum', '1');
    const [first] = (await runOk('show', 'lisbon')).picked;
    await handedOver('order', { dollars: 0.75, album: [first.photo] });
    await editLisbon();
    await runOk('publish', 'lisbon');
    await runOk('pick', 'lisbon');
    expect(await runOk('marks', 'lisbon')).toMatchObject({
      agreedDollars: 0,
      album: null,
    });
  });
});

describe('keepsake answer', () => {
  it('tells the owner what came of a mark', async () => {
    await pickLisbon();
    await mark('one');
    await mark('two');
    const done = ['--done', 'The chair is gone.'];
    const result = await runOk('answer', 'lisbon', 'one', ...done);
    expect(result.left).toEqual(['two']);
    expect((await shootJson('marks', 'one.json')).answer).toMatchObject({
      outcome: 'done',
      note: 'The chair is gone.',
    });
    const not = ['--not-done', 'The beak came out wrong.'];
    expect(await runOk('answer', 'lisbon', 'two', ...not)).toMatchObject({
      mark: {
        answer: { outcome: 'not-done', note: 'The beak came out wrong.' },
      },
      left: [],
    });
  });

  it.each([[], ['--done', 'Yes.', '--not-done', 'No.']])(
    'needs to know whether it was done: %p',
    async (...flags) => {
      await pickLisbon();
      await mark('one');
      const failure = await failureOf('answer', 'lisbon', 'one', ...flags);
      expect(failure.message).toBe('Give either --done or --not-done.');
    },
  );

  it('leaves alone what the owner may still change', async () => {
    await pickLisbon();
    await mark('one', notHandedOver);
    const failure = await failureOf('answer', 'lisbon', 'one', '--done', 'Yes');
    expect(failure.message).toContain('isn’t handed over yet');
    expect((await shootJson('marks', 'one.json')).answer).toBeNull();
  });

  it.each(['three', '../shoot'])('knows no mark %p', async (id) => {
    await pickLisbon();
    const failure = await failureOf('answer', 'lisbon', id, '--done', 'Yes');
    expect(failure.message).toBe(`There is no mark ${id}.`);
  });
});

describe('keepsake edit --mark', () => {
  const box = { left: 0.1, top: 0.4, right: 0.3, bottom: 0.6 };

  it('does what the mark says', async () => {
    await pickLisbon();
    await editLisbon('B');
    await mark('one');
    const result = await editLisbon('--mark', 'one');
    expect(result).toMatchObject({ edited: 1 });
    expect(fakeModels.edits.at(-1)?.prompt).toContain('Remove the chair');
  });

  it('shows where it is meant', async () => {
    await pickLisbon();
    await editLisbon('B');
    fakeModels.answers.places = {
      everywhere: false,
      places: [{ part: 0, what: 'Remove the chair', isRemoval: true, box }],
    };
    fakeModels.answers.choices = {
      places: [{ place: 1, best: 1, notes: 'Clean' }],
    };
    await mark('one', { boxes: [box] });
    await editLisbon('--mark', 'one');
    expect(asked('places')[0]?.texts.join(' ')).toContain('marked');
    expect(await shootJson('edits', 'B', 'correction', 'areas.json')).toEqual([
      box,
    ]);
  });

  it('needs to know what to do at the places of a mark', async () => {
    await pickLisbon();
    await mark('one', { note: '', boxes: [box] });
    const failure = await failureOf('edit', 'lisbon', '--mark', 'one');
    expect(failure.message).toContain('--wish');
  });

  it('takes the photo from the mark', async () => {
    await pickLisbon();
    await mark('one');
    const failure = await failureOf('edit', 'lisbon', 'B', '--mark', 'one');
    expect(failure.message).toContain('Name no photos');
  });
});

describe('a photo that is edited again', () => {
  it('keeps the finished photo it replaces', async () => {
    await pickLisbon();
    await editLisbon('B');
    const final = shootFile('edits', 'B', 'B-keepsake.jpg');
    await Bun.write(final, 'the former edit');
    const made = Math.round(Bun.file(final).lastModified);
    await editLisbon('B', '--again');
    const earlier = shootFile('edits', 'B', 'earlier', `${made}.jpg`);
    expect(await Bun.file(earlier).text()).toBe('the former edit');
    expect(await Bun.file(final).text()).toBe('a picture');
  });
});
