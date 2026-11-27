import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { chmod, mkdir } from 'node:fs/promises';
import {
  editLisbon,
  failureOf,
  judge,
  pickLisbon,
  setUp,
  shootFile,
  tearDown,
} from './command-fixtures.ts';
import { fakeModels } from './fake-models.ts';

beforeEach(() => setUp(spyOn));
afterEach(tearDown);

const wished = ['B', '--wish', 'No chair', '--operation', 'first'] as const;

describe('keepsake edit, with an operation id', () => {
  it('isn’t paid twice when it stopped before it noted what it came to', async () => {
    await pickLisbon();
    await editLisbon('B');
    // Noting what it came to fails, as when keepsake stops right there.
    await mkdir(shootFile('operations'), { mode: 0o500 });
    const failure = await failureOf(
      'edit',
      'lisbon',
      ...wished,
      '--review-model',
      judge,
    );
    expect(failure._tag).toBe('StoreFailed');
    const paid = fakeModels.edits.length;
    await chmod(shootFile('operations'), 0o700);
    const result = await editLisbon(...wished);
    expect(fakeModels.edits).toHaveLength(paid);
    expect(result).toMatchObject({
      edited: 1,
      finished: [
        { photo: 'B', digest: expect.any(String), review: expect.any(String) },
      ],
    });
    // Given again, it says the same without editing.
    expect(await editLisbon(...wished)).toEqual(result);
    expect(fakeModels.edits).toHaveLength(paid);
  });

  it('refuses an id that an edit of something else was given', async () => {
    await pickLisbon();
    await editLisbon('B', '--operation', 'first');
    const failure = await failureOf(
      'edit',
      'lisbon',
      'A2',
      '--operation',
      'first',
      '--review-model',
      judge,
    );
    expect(failure).toMatchObject({
      _tag: 'InvalidInput',
      message: expect.stringContaining('was about the photos B'),
    });
  });
});
