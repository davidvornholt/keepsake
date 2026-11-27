import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { existsSync, readdirSync } from 'node:fs';
import {
  pickLisbon,
  runOk,
  setUp,
  shootFile,
  tearDown,
} from './command-fixtures.ts';
import {
  change,
  eventually,
  handOver,
  marksOf,
  pickedOf,
  send,
  shootOf,
  statusOf,
  whileServing,
} from './light-table-fixtures.ts';

beforeEach(() => setUp(spyOn));
afterEach(tearDown);

const answeredAt = '2026-04-01T11:00:00.000Z';
const pendingAt = '2026-04-02T11:00:00.000Z';

/** A mark as keepsake saved it before hand-overs had a file each. */
const oldMark = (id: string, handedOverAt: string, answer: object | null) =>
  Bun.write(
    shootFile('marks', `${id}.json`),
    JSON.stringify({
      id,
      photo: 'B',
      note: 'Remove the chair',
      boxes: [],
      madeAt: '2026-04-01T10:00:00.000Z',
      handedOverAt,
      answer,
      seenAt: null,
    }),
  );

/**
 * A shoot as keepsake left it then: one mark answered, one that an agent is
 * still to act on, handed over with an album of the chosen photos.
 */
const oldShoot = async () => {
  await pickLisbon();
  await oldMark('answered', answeredAt, {
    outcome: 'done',
    note: 'The chair is gone.',
    at: '2026-04-01T12:00:00.000Z',
  });
  await oldMark('pending', pendingAt, null);
  await Bun.write(
    shootFile('hand-overs.json'),
    JSON.stringify([
      { at: answeredAt, dollars: 0.5, album: false },
      { at: pendingAt, dollars: 2, album: true },
    ]),
  );
};

describe('a shoot from before hand-overs had a file each', () => {
  it('keeps what was handed over and answered', async () => {
    await oldShoot();
    const waiting = await runOk('marks', 'lisbon');
    expect(waiting).toMatchObject({ album: null, agreedDollars: 0 });
    expect(waiting.marks.map(({ id }: { id: string }) => id)).toEqual([
      'pending',
    ]);
    const all = await runOk('marks', 'lisbon', '--all');
    expect(all.marks).toMatchObject([
      { id: 'answered', handedOverAt: answeredAt, answer: { outcome: 'done' } },
      { id: 'pending', handedOverAt: pendingAt, answer: null },
    ]);
    expect(existsSync(shootFile('hand-overs.json'))).toBe(false);
  });

  it('is changed only once, even when that stopped halfway', async () => {
    await oldShoot();
    await runOk('marks', 'lisbon');
    // As if it stopped before the old list was put aside.
    await Bun.write(
      shootFile('hand-overs.json'),
      Bun.file(shootFile('hand-overs-before.json')),
    );
    const again = await runOk('marks', 'lisbon', '--all');
    expect(again.marks).toHaveLength(2);
    const files = readdirSync(shootFile('hand-overs'));
    expect(files.filter((name) => name.endsWith('.json'))).toHaveLength(2);
  });

  it('is handed over to again, and the album ordered anew', async () => {
    await oldShoot();
    const [ordered, statuses, pending] = await whileServing(async (address) => {
      // Nothing was agreed for the mark that waited, so it waits for the
      // owner to pay for it.
      const { stopped } = await eventually(
        async () => (await shootOf(address)).carrying,
        (carrying) => carrying.stopped !== null,
      );
      const before = (await shootOf(address)).ordered;
      await send('PUT', `${address}/api/shoots/lisbon/marks`, change);
      const first = await statusOf(
        handOver(address, { dollars: 1, album: await pickedOf(address) }),
      );
      return [before, [first, await statusOf(handOver(address))], stopped];
    });
    expect(ordered).toBeNull();
    expect(statuses).toEqual([200, 400]);
    expect(pending).toMatchObject({ needs: 'money' });
    const waiting = await runOk('marks', 'lisbon');
    expect(waiting.marks.map(({ id }: { id: string }) => id)).toContain(
      'pending',
    );
    expect(waiting.marks).toHaveLength(2);
    expect(waiting.album).not.toBeNull();
    expect(waiting.agreedDollars).toBe(1);
  });
});

type Kinded = {
  readonly id: string;
  readonly kind: string;
  readonly photo: string;
  readonly note: string;
  readonly other?: string;
};

/** A mark as keepsake saved it while marks had a kind. */
const kindedMark = ({ id, other, ...mark }: Kinded) =>
  Bun.write(
    shootFile('marks', `${id}.json`),
    JSON.stringify({
      id,
      ...mark,
      boxes: [],
      other: other ?? null,
      madeAt: '2026-04-01T10:00:00.000Z',
      answer: null,
      seenAt: null,
    }),
  );

describe('a shoot from when marks had a kind', () => {
  const kinded = async () => {
    await pickLisbon();
    await kindedMark({
      id: 'change',
      kind: 'change',
      photo: 'B',
      note: 'Warmer.',
    });
    await kindedMark({
      id: 'out',
      kind: 'take-out',
      photo: 'C',
      note: 'Too dark.',
    });
    await kindedMark({ id: 'in', kind: 'put-in', photo: 'A2', note: '' });
    await kindedMark({
      id: 'swap',
      kind: 'swap',
      photo: 'A2',
      note: 'Brighter.',
      other: 'A1',
    });
    await Bun.write(
      shootFile('hand-overs', 'swapped.json'),
      JSON.stringify({
        id: 'swapped',
        at: pendingAt,
        dollars: 1,
        spentBefore: 0,
        marks: ['swap'],
        album: null,
        fulfilledAt: null,
      }),
    );
  };

  it('keeps its changes, and leaves out what isn’t a change', async () => {
    await kinded();
    const all = await runOk('marks', 'lisbon', '--all');
    expect(all.marks.map(({ id }: { id: string }) => id)).toEqual(['change']);
    const waiting = await runOk('marks', 'lisbon');
    expect(waiting.marks).toEqual([]);
    const shown = await whileServing(marksOf);
    expect(shown.map(({ id }: { id: string }) => id)).toEqual(['change']);
  });

  it('refuses a mark from a page that still has kinds', async () => {
    await pickLisbon();
    const statuses = await whileServing(async (address) => [
      await statusOf(
        send('PUT', `${address}/api/shoots/lisbon/marks`, {
          ...change,
          kind: 'take-out',
          other: null,
        }),
      ),
      await statusOf(send('PUT', `${address}/api/shoots/lisbon/marks`, change)),
    ]);
    expect(statuses).toEqual([400, 200]);
    expect(await whileServing(marksOf)).toHaveLength(1);
  });
});
