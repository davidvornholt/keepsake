import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { existsSync } from 'node:fs';
import {
  asked,
  failureOf,
  judge,
  photosFolder,
  runOk,
  scanLisbon,
  setUp,
  shootFile,
  tearDown,
} from './command-fixtures.ts';
import { fakeModels, verdictAnswer } from './fake-models.ts';
import { fakeTools } from './fake-tools.ts';

beforeEach(() => setUp(spyOn));
afterEach(tearDown);

const runLisbon = (...args: ReadonlyArray<string>) => [
  'run',
  photosFolder(),
  '--name',
  'lisbon',
  '--review-model',
  judge,
  ...args,
];

describe('keepsake run', () => {
  beforeEach(scanLisbon);

  it('does everything and goes on where it stopped', async () => {
    fakeModels.answers.reasons = {
      reasons: [{ photo: 2, because: 'Its eyes are closed.' }],
    };
    const result = await runOk(...runLisbon('--publish'));
    expect(result.culled.moments).toBe(3);
    expect(result.picked.picked).toBe(3);
    expect(result.edited.edited).toBe(3);
    expect(result.published.published).toBe(3);
    const questions = fakeModels.asked.length;
    await runOk(...runLisbon('--publish'));
    expect(fakeModels.asked).toHaveLength(questions);
  });

  it('uploads nothing unless asked to', async () => {
    const result = await runOk(...runLisbon());
    expect(result.published).toBeNull();
    expect(fakeTools.uploads).toEqual([]);
  });

  it('gets a shoot ready for the owner without an edit', async () => {
    const result = await runOk(...runLisbon('--unedited', '--maximum', '2'));
    expect(result).toMatchObject({
      picked: { picked: 2 },
      edited: null,
      published: null,
      explained: { notExplained: ['B', 'A2'] },
    });
    expect(fakeModels.edits).toEqual([]);
    expect(asked('reasons').length).toBeGreaterThan(0);
    expect(existsSync(shootFile('edits'))).toBe(false);
    const both = await failureOf(...runLisbon('--unedited', '--publish'));
    expect(both.message).toContain('either --unedited or --publish');
  });

  it('stops when many moments couldn’t be judged, and goes on later', async () => {
    fakeModels.answers.judgement = () =>
      asked('judgement').length === 1
        ? verdictAnswer
        : new Response('You’ve hit your limit', { status: 400 });
    const failure = await failureOf(...runLisbon('--unedited'));
    expect(failure._tag).toBe('ModelFailed');
    expect(failure.message).toContain('2 of 3 moments couldn’t be judged');
    expect(failure.message).toContain('You’ve hit your limit');
    expect(existsSync(shootFile('picks.json'))).toBe(false);
    fakeModels.answers.judgement = verdictAnswer;
    const result = await runOk(...runLisbon('--unedited'));
    expect(result.picked.picked).toBe(3);
  });
});
