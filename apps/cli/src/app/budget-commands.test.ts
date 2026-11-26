// biome-ignore-all lint/style/useNamingConvention: the API's names for tokens
import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import {
  asked,
  editLisbon,
  failureOf,
  pickLisbon,
  setUp,
  shootFile,
  tearDown,
} from './command-fixtures.ts';
import { assessment, fakeModels } from './fake-models.ts';

const imageModel = 'azure/gpt-image-2.5-sunburst';
/** What the fake image model's answer costs. */
const oneRequest = 0.432;
/** The most a request for the two usual versions may cost. */
const mostForTwo = 0.632;

const free = { prompt_tokens: 0, completion_tokens: 0 };

const spentOn = (model: string) => {
  const path = shootFile('spending.json');
  return existsSync(path)
    ? (JSON.parse(readFileSync(path, 'utf8'))[model]?.dollars ?? 0)
    : 0;
};

/** Every version fails its review, so another attempt is wanted. */
const everyVersionFails = () => {
  fakeModels.answers.assessment = {
    assessments: [
      assessment(1, { sameMoment: false }),
      assessment(2, { sameMoment: false }),
    ],
  };
};

beforeEach(() => setUp(spyOn));
afterEach(tearDown);

describe('keepsake edit, with a budget', () => {
  it('sends no paid request that the budget doesn’t cover', async () => {
    await pickLisbon();
    const questions = fakeModels.asked.length;
    const result = await editLisbon('--budget', '0.01');
    expect(result).toMatchObject({ edited: 0, dollarsSpent: 0 });
    expect(result.overBudget).toHaveLength(3);
    expect(fakeModels.edits).toHaveLength(0);
    expect(fakeModels.asked).toHaveLength(questions);
  });

  it('asks for no second attempt that the budget doesn’t cover', async () => {
    await pickLisbon();
    fakeModels.chatUsage = free;
    everyVersionFails();
    const result = await editLisbon('B', '--budget', '0.75');
    expect(result.overBudget).toEqual(['B']);
    expect(fakeModels.edits).toHaveLength(1);
    expect(result.dollarsSpent).toBeCloseTo(oneRequest);
    expect(existsSync(shootFile('edits', 'B', 'B-keepsake.jpg'))).toBe(false);
  });

  it('refuses a model whose price it doesn’t know', async () => {
    await pickLisbon();
    const questions = fakeModels.asked.length;
    const failure = await failureOf(
      'edit',
      'lisbon',
      'B',
      '--review-model',
      'azure/gpt-unknown',
    );
    expect(failure._tag).toBe('InvalidInput');
    expect(failure.message).toContain('azure/gpt-unknown');
    expect(fakeModels.asked).toHaveLength(questions);
    expect(fakeModels.edits).toHaveLength(0);
  });

  it('counts an answer that doesn’t say what it used at the most', async () => {
    await pickLisbon();
    fakeModels.chatUsage = undefined;
    fakeModels.editAnswer = () =>
      Response.json({
        data: [{ b64_json: btoa('a png') }, { b64_json: btoa('a png') }],
      });
    const result = await editLisbon('B');
    expect(result.models[imageModel].dollars).toBeCloseTo(mostForTwo);
    expect(result.models['azure/gpt-6-astra'].dollars).toBeGreaterThan(0);
  });
});

describe('what an edit spends', () => {
  it('is on disk as soon as a request has been answered', async () => {
    await pickLisbon();
    const onDisk: Array<number> = [];
    fakeModels.answers.assessment = () => {
      onDisk.push(spentOn(imageModel));
      return { assessments: [assessment(1), assessment(2)] };
    };
    await editLisbon('B');
    expect(onDisk[0]).toBeCloseTo(oneRequest);
  });
});

describe('keepsake edit, with a wish and a budget', () => {
  const finalFile = () => shootFile('edits', 'B', 'B-keepsake.jpg');

  it('makes no attempt that the budget doesn’t cover', async () => {
    await pickLisbon();
    await editLisbon('B');
    await Bun.write(finalFile(), 'the former edit');
    fakeModels.chatUsage = free;
    const box = { left: 0.1, top: 0.4, right: 0.3, bottom: 0.6 };
    fakeModels.answers.places = {
      everywhere: false,
      places: [{ part: 0, what: 'Remove the chair', isRemoval: true, box }],
    };
    fakeModels.answers.choices = {
      places: [{ place: 1, best: 0, notes: 'A leg of it is left' }],
    };
    // The first attempt and its review fit, a second attempt doesn't: the
    // reviewer's questions are held at the most they can cost.
    const result = await editLisbon('B', '--wish', 'No chair', '--budget', '1');
    expect(fakeModels.edits).toHaveLength(2);
    expect(asked('choices')).toHaveLength(1);
    expect(result.notDone).toEqual([
      {
        photo: 'B',
        what: expect.stringContaining('is left of the budget'),
      },
    ]);
    expect(readFileSync(finalFile(), 'utf8')).toBe('the former edit');
  });
});
