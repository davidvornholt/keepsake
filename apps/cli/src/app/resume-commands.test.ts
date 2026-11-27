import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { existsSync, rmSync } from 'node:fs';
import {
  asked,
  credentialsPath,
  editLisbon,
  endpoint,
  judge,
  pickLisbon,
  runOk,
  setUp,
  shootFile,
  tearDown,
} from './command-fixtures.ts';
import { assessment, fakeModels } from './fake-models.ts';

beforeEach(async () => {
  await setUp(spyOn);
  // Another provider, for a review model of the same price.
  await Bun.write(
    credentialsPath(),
    JSON.stringify({
      azure: { endpoint, apiKey: fakeModels.key },
      openai: { endpoint: null, apiKey: fakeModels.key },
    }),
  );
});
afterEach(tearDown);

const failing = () => new Response(null, { status: 400 });
const rejected = {
  assessments: [assessment(1, { sameMoment: false, notes: 'Two heads.' })],
};

describe('keepsake edit, after it was stopped', () => {
  it('makes the versions that weren’t saved', async () => {
    await pickLisbon();
    fakeModels.answers.assessment = failing;
    expect((await editLisbon('B')).failed).toHaveLength(1);
    // As if it had been stopped after the first of the two.
    const second = shootFile('edits', 'B', 'version-2.png');
    rmSync(second);
    rmSync(shootFile('edits', 'B', 'attempt-1.json'), { force: true });
    fakeModels.answers.assessment = undefined;
    expect((await editLisbon('B')).edited).toBe(1);
    expect(fakeModels.edits).toHaveLength(2);
    expect(existsSync(second)).toBe(true);
  });

  it('asks for the versions that weren’t saved only within the budget', async () => {
    await pickLisbon();
    fakeModels.answers.assessment = failing;
    expect((await editLisbon('B')).failed).toHaveLength(1);
    rmSync(shootFile('edits', 'B', 'version-2.png'));
    rmSync(shootFile('edits', 'B', 'attempt-1.json'), { force: true });
    fakeModels.answers.assessment = undefined;
    const result = await editLisbon('B', '--budget', '0.01');
    expect(result.overBudget).toEqual(['B']);
    expect(fakeModels.edits).toHaveLength(1);
  });

  it('keeps each attempt’s versions when it makes another number', async () => {
    await pickLisbon();
    fakeModels.answers.assessment = () =>
      asked('assessment').length === 2 ? failing() : rejected;
    expect((await editLisbon('B', '--versions', '1')).failed).toHaveLength(1);
    expect(fakeModels.edits).toHaveLength(2);
    fakeModels.answers.assessment = { assessments: [assessment(1)] };
    expect((await editLisbon('B', '--versions', '2')).edited).toBe(1);
    expect(fakeModels.edits).toHaveLength(2);
    // The first attempt's review was kept, so only the second is asked again.
    expect(asked('assessment')).toHaveLength(3);
  });
});

describe('keepsake edit, starting over after it was stopped', () => {
  it('goes on with the same command and starts anew with a later one', async () => {
    await pickLisbon();
    await editLisbon('B');
    fakeModels.answers.assessment = failing;
    expect((await editLisbon('B', '--again')).failed).toHaveLength(1);
    expect(fakeModels.edits).toHaveLength(2);
    fakeModels.answers.assessment = undefined;
    expect((await editLisbon('B', '--again')).edited).toBe(1);
    expect(fakeModels.edits).toHaveLength(2);
    await editLisbon('B', '--again');
    expect(fakeModels.edits).toHaveLength(3);
  });

  it.each([
    ['--image-model', 'azure/gpt-image-2.5-flare'],
    ['--review-model', 'openai/gpt-6-astra'],
  ])(
    'starts anew when the command names another model with %s',
    async (flag, model) => {
      await pickLisbon();
      await editLisbon('B');
      fakeModels.answers.assessment = failing;
      expect((await editLisbon('B', '--again')).failed).toHaveLength(1);
      expect(fakeModels.edits).toHaveLength(2);
      fakeModels.answers.assessment = undefined;
      const others = { '--review-model': judge, [flag]: model };
      await runOk(
        'edit',
        'lisbon',
        'B',
        '--again',
        ...Object.entries(others).flat(),
      );
      expect(fakeModels.edits).toHaveLength(3);
    },
  );

  it('starts anew once a plain edit finished what it left', async () => {
    await pickLisbon();
    await editLisbon('B');
    fakeModels.answers.assessment = failing;
    expect((await editLisbon('B', '--again')).failed).toHaveLength(1);
    expect(fakeModels.edits).toHaveLength(2);
    fakeModels.answers.assessment = undefined;
    expect((await editLisbon('B')).edited).toBe(1);
    expect(fakeModels.edits).toHaveLength(2);
    expect((await editLisbon('B', '--again')).edited).toBe(1);
    expect(fakeModels.edits).toHaveLength(3);
  });

  it('goes on with a first edit with a wish', async () => {
    await pickLisbon();
    fakeModels.answers.assessment = failing;
    expect((await editLisbon('B', '--wish', 'Warmer')).failed).toHaveLength(1);
    fakeModels.answers.assessment = undefined;
    expect((await editLisbon('B', '--wish', 'Warmer')).edited).toBe(1);
    expect(fakeModels.edits).toHaveLength(1);
  });

  it('doesn’t start over the photos it finished', async () => {
    await pickLisbon();
    await editLisbon();
    const before = asked('assessment').length;
    fakeModels.answers.assessment = () =>
      asked('assessment').length === before + 2
        ? failing()
        : { assessments: [assessment(1)] };
    expect((await editLisbon('--again')).failed).toHaveLength(1);
    expect(fakeModels.edits).toHaveLength(6);
    fakeModels.answers.assessment = undefined;
    expect((await editLisbon('--again')).edited).toBe(3);
    expect(fakeModels.edits).toHaveLength(6);
  });
});
