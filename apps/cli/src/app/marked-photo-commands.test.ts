import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import {
  editLisbon,
  failureOf,
  judge,
  pickLisbon,
  runOk,
  setUp,
  tearDown,
} from './command-fixtures.ts';
import { fakeModels } from './fake-models.ts';
import { firstAlbum } from './fake-tools.ts';
import { mark } from './mark-fixtures.ts';

// What an agent does for a mark whose photo the owner took out since they
// handed it over.

beforeEach(() => setUp(spyOn));
afterEach(tearDown);

const because = ['--because', 'It is blurred.'];

const standingOf = async (photo: string) =>
  (await runOk('show', 'lisbon', photo)).standing;

const inImmich = () =>
  (firstAlbum() ?? []).map(({ fileName }) => fileName.split('-')[0]);

const publishLisbon = async () => {
  await pickLisbon();
  await editLisbon();
  await runOk('publish', 'lisbon');
};

describe('keepsake edit --mark of a photo taken out', () => {
  it('edits nothing and asks no model', async () => {
    await pickLisbon();
    await editLisbon('B');
    await mark('one');
    await runOk('take-out', 'lisbon', 'B', ...because);
    const questions = fakeModels.asked.length;
    const edits = fakeModels.edits.length;
    const failure = await failureOf(
      'edit',
      'lisbon',
      '--mark',
      'one',
      '--budget',
      '5',
      '--review-model',
      judge,
    );
    expect(failure.message).toContain('taken out meanwhile');
    expect(fakeModels.asked).toHaveLength(questions);
    expect(fakeModels.edits).toHaveLength(edits);
  });
});

describe('keepsake publish --mark', () => {
  it('publishes the photo of the mark', async () => {
    await pickLisbon();
    await editLisbon();
    await mark('one');
    await editLisbon('--mark', 'one', '--budget', '5');
    expect(await runOk('publish', 'lisbon', '--mark', 'one')).toMatchObject({
      published: 1,
    });
    expect(inImmich()).toEqual(['B']);
  });

  it('keeps out a photo taken out after it was edited', async () => {
    await publishLisbon();
    await mark('one');
    await editLisbon('--mark', 'one', '--budget', '5');
    await runOk('take-out', 'lisbon', 'B', ...because);
    const failure = await failureOf('publish', 'lisbon', '--mark', 'one');
    expect(failure.message).toContain('taken out meanwhile');
    expect(inImmich()).toEqual(['A1', 'C']);
    expect(await standingOf('B')).toMatchObject({ kind: 'taken-out' });
  });

  it('leaves naming a photo to put it back in', async () => {
    await publishLisbon();
    await runOk('take-out', 'lisbon', 'B', ...because);
    await runOk('publish', 'lisbon', 'B');
    expect(inImmich()).toContain('B');
    expect(await standingOf('B')).toMatchObject({ kind: 'album' });
  });
});
