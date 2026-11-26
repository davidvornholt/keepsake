import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { writeFile } from 'node:fs/promises';
import {
  asked,
  failureOf,
  judge,
  runOk,
  scanLisbon,
  setUp,
  shootFile,
  shootJson,
  tearDown,
} from './command-fixtures.ts';
import { fakeModels, verdictAnswer } from './fake-models.ts';

beforeEach(() => setUp(spyOn));
afterEach(tearDown);

describe('keepsake bench', () => {
  it('measures a model on the rated moments only', async () => {
    await scanLisbon();
    // The burst is asked about with two pictures.
    fakeModels.answers.judgement = ({ images }) => ({
      ...verdictAnswer,
      score: images === 2 ? 9 : 3,
    });
    await writeFile(
      shootFile('ratings.json'),
      JSON.stringify([
        {
          moment: 'A1',
          photos: ['A1', 'A2'],
          best: 'A1',
          stars: 4,
          further: [],
        },
        { moment: 'B', photos: ['B'], best: null, stars: 0, further: [] },
      ]),
    );
    const { results, dollarsSpent, models } = await runOk(
      'bench',
      'lisbon',
      '--model',
      'azure/gpt-6-astra',
    );
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      model: 'azure/gpt-6-astra',
      moments: 2,
      bursts: 1,
      sameBestFrame: 1,
      bestFrameByChance: 0.5,
      keepAccuracy: 1,
      rankCorrelation: 1,
      failed: [],
    });
    expect(dollarsSpent).toBeCloseTo(0.3);
    expect(models['azure/gpt-6-astra'].calls).toBe(2);
  });

  it('keeps apart what it asks about moments that a later scan changed', async () => {
    await scanLisbon();
    await runOk('cull', 'lisbon');
    // Rated when the burst was its first frame alone.
    await writeFile(
      shootFile('ratings.json'),
      JSON.stringify([
        { moment: 'A1', photos: ['A1'], best: 'A1', stars: 4, further: [] },
      ]),
    );
    const judged = asked('judgement').length;
    await runOk('bench', 'lisbon');
    expect(asked('judgement')).toHaveLength(judged + 1);
    await runOk('bench', 'lisbon');
    expect(asked('judgement')).toHaveLength(judged + 1);
    expect(
      await shootJson('verdicts', 'azure--gpt-6-astra', 'A1.json'),
    ).toMatchObject({ photos: ['A1', 'A2'] });
    expect(await runOk('pick', 'lisbon')).toMatchObject({ notJudged: 0 });
  });

  it('needs ratings first', async () => {
    await scanLisbon();
    const failure = await failureOf('bench', 'lisbon');
    expect(failure.message).toContain('keepsake rate lisbon');
  });
});

describe('keepsake rate', () => {
  it('asks the owner about moments of the shoot', async () => {
    await scanLisbon();
    expect(await runOk('rate', 'lisbon', '--moments', '2')).toEqual({
      shoot: 'lisbon',
      link: null,
      moments: 2,
      rated: 0,
    });
    expect(await shootJson('to-rate.json')).toHaveLength(2);
  });

  it.each([1, 3])('refuses to compare %d models', async (count) => {
    await scanLisbon();
    const flags = Array.from({ length: count }, () => ['--between', judge]);
    const failure = await failureOf('rate', 'lisbon', ...flags.flat());
    expect(failure.message).toContain('two times');
  });

  it('needs verdicts of both models to compare them', async () => {
    await scanLisbon();
    await runOk('cull', 'lisbon');
    const failure = await failureOf(
      'rate',
      'lisbon',
      ...['--between', judge],
      ...['--between', 'azure/other-model'],
    );
    expect(failure.message).toContain(
      'keepsake cull lisbon --model azure/other-model',
    );
  });
});
