import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { writeFile } from 'node:fs/promises';
import {
  failureOf,
  judge,
  runOk,
  scanLisbon,
  setUp,
  shootFile,
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

  it('needs ratings first', async () => {
    await scanLisbon();
    const failure = await failureOf('bench', 'lisbon');
    expect(failure.message).toContain('keepsake rate lisbon');
  });
});

describe('keepsake rate', () => {
  it.each(['server', 'ftp://server.example.ts.net'])(
    'refuses %s as an address',
    async (address) => {
      await scanLisbon();
      const failure = await failureOf('rate', 'lisbon', '--address', address);
      expect(failure._tag).toBe('InvalidInput');
    },
  );

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
