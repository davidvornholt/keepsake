import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import {
  pickLisbon,
  runOk,
  setUp,
  shootJson,
  tearDown,
} from './command-fixtures.ts';
import {
  change,
  handOver,
  marksOf,
  send,
  shootOf,
  statusOf,
  whileServing,
} from './light-table-fixtures.ts';

beforeEach(() => setUp(spyOn));
afterEach(tearDown);

describe('marks on the light table', () => {
  it('replace each other until they are handed over', async () => {
    await pickLisbon();
    const [open, handed] = await whileServing(async (address) => {
      const path = `${address}/api/shoots/lisbon/marks`;
      await send('PUT', path, { ...change, kind: 'put-in', note: '' });
      await send('PUT', path, change);
      const before = await marksOf(address);
      await handOver(address);
      await send('PUT', path, { ...change, kind: 'take-out' });
      return [before, await marksOf(address)];
    });
    const kinds = (all: ReadonlyArray<{ readonly kind: string }>) =>
      all.map(({ kind }) => kind);
    expect(kinds(open)).toEqual(['change']);
    expect(open[0]).toMatchObject({ ...change, note: 'Remove the chair' });
    expect(kinds(handed)).toEqual(['change', 'take-out']);
  });

  it('are handed over with the price that was shown', async () => {
    await pickLisbon();
    const handed = await whileServing(async (address) => {
      await send('PUT', `${address}/api/shoots/lisbon/marks`, change);
      return (await handOver(address, { dollars: 0.75 })).json();
    });
    expect(handed).toMatchObject([{ photo: 'B', answer: null }]);
    expect(handed[0].handedOverAt).not.toBeNull();
    const waiting = await runOk('marks', 'lisbon');
    expect(waiting).toMatchObject({
      agreedDollars: 0.75,
      album: null,
      marks: [{ photo: 'B', note: 'Remove the chair' }],
    });
    const { id } = handed[0];
    await runOk('answer', 'lisbon', id, '--done', 'The chair is gone.');
    expect(await runOk('marks', 'lisbon')).toMatchObject({ agreedDollars: 0 });
  });

  it('can’t be handed over when there are none', async () => {
    await pickLisbon();
    const status = await whileServing((address) => statusOf(handOver(address)));
    expect(status).toBe(400);
  });

  it('can be taken back before that', async () => {
    await pickLisbon();
    const statuses = await whileServing(async (address) => {
      const path = `${address}/api/shoots/lisbon`;
      const make = async () =>
        (await send('PUT', `${path}/marks`, change)).json();
      const takeBack = ({ id }: { readonly id: string }) =>
        statusOf(send('DELETE', `${path}/marks/${id}`));
      const first = await takeBack(await make());
      const second = await make();
      await handOver(address);
      return [first, await takeBack(second), (await marksOf(address)).length];
    });
    expect(statuses).toEqual([204, 400, 1]);
  });

  it('are news once they are answered, until they were looked at', async () => {
    await pickLisbon();
    const news = await whileServing(async (address) => {
      const path = `${address}/api/shoots/lisbon`;
      const { id } = await (await send('PUT', `${path}/marks`, change)).json();
      await handOver(address);
      await runOk('answer', 'lisbon', id, '--done', 'The chair is gone.');
      const [before] = await marksOf(address);
      await send('POST', `${path}/marks/${id}/seen`);
      const [after] = await marksOf(address);
      return [before, after];
    });
    expect(news[0]).toMatchObject({
      answer: { outcome: 'done', note: 'The chair is gone.' },
      seenAt: null,
    });
    expect(news[1].seenAt).not.toBeNull();
  });

  it.each([
    { ...change, photo: 'D' },
    { ...change, kind: 'burn' },
    { ...change, kind: 'swap' },
    { ...change, kind: 'swap', other: 'D' },
    { ...change, other: 'C' },
    { ...change, boxes: [{ left: 0 }] },
    'nonsense',
  ])('that make no sense are refused: %p', async (wanted) => {
    await pickLisbon();
    const answer = await whileServing(async (address) => {
      const path = `${address}/api/shoots/lisbon/marks`;
      const status = await statusOf(send('PUT', path, wanted));
      return { status, marks: await marksOf(address) };
    });
    expect(answer).toEqual({ status: 400, marks: [] });
  });
});

describe('labels and ratings on the light table', () => {
  it('keeps the labels of a photo, tidied', async () => {
    await pickLisbon();
    const labels = await whileServing(async (address) => {
      const path = `${address}/api/shoots/lisbon/labels`;
      const given = [' print ', 'print', '', 'wall'];
      await send('PUT', path, { photo: 'B', labels: given });
      await send('PUT', path, { photo: 'C', labels: ['send'] });
      await send('PUT', path, { photo: 'C', labels: [] });
      const { photos } = await shootOf(address);
      return photos.map((photo: { labels: unknown }) => photo.labels);
    });
    expect(labels).toEqual([[], [], ['print', 'wall'], []]);
    expect(Object.entries(await shootJson('labels.json'))).toEqual([
      ['B', ['print', 'wall']],
    ]);
  });

  it('asks for ratings and saves them', async () => {
    await pickLisbon();
    await runOk('rate', 'lisbon', '--moments', '3');
    const answer = { moment: 'A1', best: 'A2', stars: 4, further: ['A1'] };
    const rating = await whileServing(async (address) => {
      const path = `${address}/api/shoots/lisbon/ratings`;
      await send('POST', path, { ...answer, stars: 1 });
      await send('POST', path, answer);
      return (await shootOf(address)).rating;
    });
    expect(rating.questions).toContainEqual({
      moment: 'A1',
      photos: ['A1', 'A2'],
    });
    expect(rating.ratings).toEqual([answer]);
  });

  it.each([
    { moment: 'A1', best: 'A2', stars: 6, further: [] },
    { moment: 'B', best: 'A2', stars: 4, further: [] },
    { moment: 'A1', best: 'C', stars: 4, further: [] },
    { moment: 'A1', best: null, stars: 4, further: [] },
    { moment: 'A1', best: 'A2', stars: 0, further: [] },
    { moment: 'A1', best: 'A2', stars: 4, further: ['A2'] },
    { moment: 'D', best: 'A2', stars: 4, further: [] },
    null,
  ])('refuses a rating that makes no sense: %p', async (answer) => {
    await pickLisbon();
    const path = 'api/shoots/lisbon/ratings';
    const status = await whileServing((address) =>
      statusOf(send('POST', `${address}/${path}`, answer ?? 'nonsense')),
    );
    expect(status).toBe(400);
  });
});
