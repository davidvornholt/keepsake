import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  setDefaultTimeout,
  spyOn,
} from 'bun:test';
import { choose, inImmich, publishLisbon } from './choice-fixtures.ts';
import { setUp, shootJson, tearDown } from './command-fixtures.ts';
import {
  eventually,
  handOver,
  send,
  shootOf,
  whileServing,
} from './light-table-fixtures.ts';
import {
  goOn,
  keepsakeInProcess,
  keepsakeRuns,
  restingOf,
  stopOf,
} from './runner-fixtures.ts';

// The test's reviewing model is a paid one, which the page's usual one isn't,
// so the hand-overs agree to more than the page would ask. A server on a
// slow machine takes a while for an edit.
setDefaultTimeout(30_000);
beforeEach(() => setUp(spyOn));
afterEach(tearDown);

/** Once the order has none of its photos left to put in. */
const throughOf = (address: string) =>
  eventually(
    async () => (await shootOf(address)).ordered,
    (ordered) => ordered === null,
    1500,
  );

type Added = { readonly photo: string; readonly at: string };

const byOrder = /^publish lisbon --order /u;

describe('an order that is handed over', () => {
  it('is edited, put into the album, and new until it was looked at', async () => {
    await publishLisbon();
    keepsakeInProcess();
    const [list, early, seen] = await whileServing(async (address) => {
      await choose(address, { photo: 'A2', wants: 'in' });
      await handOver(address, { dollars: 5, album: ['A2'] });
      await throughOf(address);
      await restingOf(address);
      const listed = async () =>
        (await (await fetch(`${address}/api/shoots`)).json()).shoots[0];
      const before = await listed();
      const [added] = (await shootOf(address)).added as ReadonlyArray<Added>;
      const seenAs = (at: string) =>
        send('POST', `${address}/api/shoots/lisbon/seen`, {
          items: [`added:A2:${at}`],
        });
      // What the page showed before it came stays new.
      await seenAs('2026-01-01T00:00:00.000Z');
      const shownEarlier = await listed();
      await seenAs(added?.at ?? '');
      return [before, shownEarlier, await listed()];
    });
    expect(inImmich()).toContain('A2');
    const [edit, publish, ...rest] = keepsakeRuns();
    expect(edit).toBe('edit lisbon A2 --budget 5');
    expect(publish).toStartWith('publish lisbon --order ');
    expect(rest).toEqual(['explain lisbon']);
    expect(list).toMatchObject({ news: 1, newSince: expect.any(String) });
    expect(early).toMatchObject({ news: 1 });
    expect(seen).toMatchObject({ news: 0, newSince: null });
    expect(await shootJson('added.json')).toEqual([
      { photo: 'A2', at: expect.any(String), seenAt: expect.any(String) },
    ]);
  });

  it('puts no photo into the album that the owner took out after it was edited', async () => {
    await publishLisbon();
    let address = '';
    // The owner takes it out between the edit and the publish.
    keepsakeInProcess(async ([command]) => {
      if (command === 'publish') {
        await choose(address, { photo: 'A2', wants: 'out' });
      }
    });
    await whileServing(async (served) => {
      address = served;
      await choose(served, { photo: 'A2', wants: 'in' });
      await handOver(served, { dollars: 5, album: ['A2'] });
      await throughOf(served);
      return restingOf(served);
    });
    expect(inImmich()).not.toContain('A2');
    expect(keepsakeRuns().filter((args) => args.startsWith('publish'))).toEqual(
      [expect.stringMatching(byOrder)],
    );
  });

  it('stops for more money, says so, and goes on when the owner agrees', async () => {
    await publishLisbon();
    keepsakeInProcess();
    const [stopped, after] = await whileServing(async (address) => {
      await choose(address, { photo: 'A2', wants: 'in' });
      await handOver(address, { dollars: 0.01, album: ['A2'] });
      const waiting = await stopOf(address);
      await goOn(address, waiting.id, 5);
      await throughOf(address);
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
