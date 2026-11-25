import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import {
  pickLisbon,
  runOk,
  scanLisbon,
  setUp,
  tearDown,
} from './command-fixtures.ts';
import { fakeModels, verdictAnswer } from './fake-models.ts';

const standingOf = async (photo: string) =>
  (await runOk('show', 'lisbon', photo)).standing;

beforeEach(() => setUp(spyOn));
afterEach(tearDown);

describe('where a photo stands', () => {
  it('is unknown before photos were picked', async () => {
    await scanLisbon();
    expect(await standingOf('B')).toEqual({
      kind: 'left-out',
      rule: 'unknown',
      repeats: null,
      because: null,
    });
  });

  it('is picked until it is published', async () => {
    await pickLisbon();
    expect(await standingOf('A1')).toEqual({ kind: 'picked' });
    expect(await standingOf('A2')).toEqual({ kind: 'other-frame', of: 'A1' });
  });

  it('is left out when its score is too low', async () => {
    await scanLisbon();
    fakeModels.answers.judgement = { ...verdictAnswer, score: 5 };
    await runOk('cull', 'lisbon');
    fakeModels.answers.judgement = verdictAnswer;
    await runOk('pick', 'lisbon', '--minimum-score', '6');
    expect(await standingOf('A1')).toMatchObject({ rule: 'score' });
    expect(await standingOf('A2')).toEqual({ kind: 'other-frame', of: 'A1' });
  });

  it('is left out when another picked photo shows the same', async () => {
    await scanLisbon();
    await runOk('cull', 'lisbon');
    fakeModels.answers.motifs = {
      motifs: [{ motif: 'a heron', photos: [1, 3] }],
    };
    fakeModels.answers.motif = {
      keep: [2],
      repeats: [{ photo: 1, insteadOf: 2 }],
    };
    await runOk('pick', 'lisbon');
    expect(await standingOf('A1')).toEqual({
      kind: 'left-out',
      rule: 'repeat',
      repeats: 'C',
      because: null,
    });
  });
});
