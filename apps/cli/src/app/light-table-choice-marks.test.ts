import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import {
  choose,
  publishLisbon,
  settled,
  standingOf,
} from './choice-fixtures.ts';
import { editLisbon, runOk, setUp, tearDown } from './command-fixtures.ts';
import { fakeTools } from './fake-tools.ts';
import {
  change,
  handOver,
  marksOf,
  send,
  whileServing,
} from './light-table-fixtures.ts';

// What becomes of the changes of photos that the owner puts in or takes out.

beforeEach(() => setUp(spyOn));
afterEach(tearDown);

const mark = (address: string, photo: string, note: string) =>
  send('PUT', `${address}/api/shoots/lisbon/marks`, {
    ...change,
    photo,
    note,
  });

const photosOf = (marks: ReadonlyArray<{ readonly photo: string }>) =>
  marks.map(({ photo }) => photo);

/** What an agent is given to act on. */
const forAgent = async () => {
  const listed = await runOk('marks', 'lisbon');
  return { photos: photosOf(listed.marks), album: listed.album };
};

describe('a change of a photo that goes out', () => {
  it('goes with it, so nothing edits it back in', async () => {
    await publishLisbon();
    const [left] = await whileServing(async (address) => {
      await mark(address, 'B', 'Warmer.');
      await choose(address, { photo: 'B', wants: 'out' });
      await mark(address, 'C', 'Less sky.');
      const shown = photosOf(await marksOf(address));
      await handOver(address);
      return [shown];
    });
    expect(left).toEqual(['C']);
    expect(await forAgent()).toEqual({ photos: ['C'], album: null });
    expect(await standingOf('B')).toMatchObject({ kind: 'taken-out' });
  });

  it('goes also with the photo that another takes the place of', async () => {
    await publishLisbon();
    await editLisbon('A2');
    const shown = await whileServing(async (address) => {
      await mark(address, 'A1', 'Warmer.');
      await choose(address, {
        photo: 'A2',
        wants: 'in',
        instead: 'A1',
        because: 'You chose A2 instead.',
      });
      return photosOf(await marksOf(address));
    });
    expect(shown).toEqual([]);
    expect((await runOk('marks', 'lisbon', '--all')).marks).toEqual([]);
  });

  it('isn’t acted on when it was handed over before', async () => {
    await publishLisbon();
    await whileServing(async (address) => {
      await mark(address, 'B', 'Warmer.');
      await handOver(address, { dollars: 0.45 });
      await choose(address, { photo: 'B', wants: 'out' });
    });
    expect(await runOk('marks', 'lisbon')).toMatchObject({
      handOvers: [],
      marks: [],
    });
  });

  it('stays when the photo couldn’t be taken out', async () => {
    await publishLisbon();
    fakeTools.refused.add('asset-3');
    const shown = await whileServing(async (address) => {
      await mark(address, 'B', 'Warmer.');
      await choose(address, { photo: 'B', wants: 'out' });
      await settled(address);
      return photosOf(await marksOf(address));
    });
    expect(shown).toEqual(['B']);
    expect(await standingOf('B')).toMatchObject({ kind: 'album' });
  });
});
