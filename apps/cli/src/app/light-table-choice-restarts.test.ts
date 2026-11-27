import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { copyFile } from 'node:fs/promises';
import {
  choose,
  inImmich,
  publishLisbon,
  settled,
  standingOf,
} from './choice-fixtures.ts';
import { editLisbon, setUp, shootFile, tearDown } from './command-fixtures.ts';
import { whileServing } from './light-table-fixtures.ts';

// What the page does with a choice it stopped in the middle of, or that
// Immich took only part of.

beforeEach(() => setUp(spyOn));
afterEach(tearDown);

const instead = 'You chose A2 instead.';

const swap = (address: string) =>
  choose(address, {
    photo: 'A2',
    wants: 'in',
    instead: 'A1',
    because: instead,
  });

describe('a photo used instead of one that is the same file in Immich', () => {
  it('leaves that one in the album', async () => {
    await publishLisbon();
    await editLisbon('A2');
    await copyFile(
      shootFile('edits', 'A1', 'A1-keepsake.jpg'),
      shootFile('edits', 'A2', 'A2-keepsake.jpg'),
    );
    const before = await standingOf('A1');
    const failed = await whileServing(async (address) => {
      await swap(address);
      return settled(address);
    });
    expect(failed).toHaveLength(2);
    expect(inImmich()).toEqual(['A1', 'B', 'C']);
    expect(await standingOf('A1')).toEqual(before);
  });
});
