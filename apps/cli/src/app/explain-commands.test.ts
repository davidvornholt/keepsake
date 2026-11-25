import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import {
  asked,
  editLisbon,
  failureOf,
  judge,
  runOk,
  scanLisbon,
  setUp,
  shootJson,
  tearDown,
} from './command-fixtures.ts';
import { type Asked, fakeModels, verdictAnswer } from './fake-models.ts';

/** An album of one photo, A1, although B and C were good enough too. */
const publishOne = async () => {
  await scanLisbon();
  await runOk('cull', 'lisbon');
  await runOk('pick', 'lisbon', '--maximum', '1');
  await editLisbon();
  await runOk('publish', 'lisbon');
};

const standingOf = async (photo: string) =>
  (await runOk('show', 'lisbon', photo)).standing;

const bothReasons = {
  reasons: [
    { photo: 2, repeats: 1, because: 'The heron is closer in the album.' },
    { photo: 3, repeats: null, because: 'The branch covers the beak.' },
  ],
};

const behindReason = {
  reasons: [{ photo: 2, because: 'Its eyes are closed.' }],
};

const isAboutStack = ({ texts }: Asked) =>
  texts.join(' ').includes('photo 1 was chosen to stand for all of them');

/** Says why B and C are left out, and why A2 is behind A1. */
const answerAll = () => {
  fakeModels.answers.reasons = (question: Asked) =>
    isAboutStack(question) ? behindReason : bothReasons;
};

/** The questions about photos that stand for themselves, and the others. */
const aboutSingles = () => asked('reasons').filter((one) => !isAboutStack(one));
const aboutStacks = () => asked('reasons').filter(isAboutStack);

const explainLisbon = (...args: ReadonlyArray<string>) =>
  runOk('explain', 'lisbon', ...args, '--review-model', judge);

beforeEach(() => setUp(spyOn));
afterEach(tearDown);

describe('keepsake explain', () => {
  it('finds out why photos aren’t in the album', async () => {
    await publishOne();
    expect(await standingOf('B')).toEqual({ kind: 'left-out', because: null });
    answerAll();
    expect(await explainLisbon()).toMatchObject({
      explained: 3,
      similar: 2,
      notExplained: [],
      failed: [],
    });
    const [question] = aboutSingles();
    expect(question?.images).toBe(3);
    expect(question?.texts.join(' ')).toContain(
      'Photos 1 to 1 are in the album. Photos 2 to 3 aren’t.',
    );
    expect(await standingOf('B')).toEqual({
      kind: 'similar',
      to: 'A1',
      because: 'The heron is closer in the album.',
    });
    expect(await standingOf('C')).toEqual({
      kind: 'left-out',
      because: 'The branch covers the beak.',
    });
  });

  it('compares the photos of a stack with the one in front', async () => {
    await publishOne();
    answerAll();
    await explainLisbon();
    const [question] = aboutStacks();
    expect(question?.images).toBe(2);
    expect(await standingOf('A2')).toEqual({
      kind: 'similar',
      to: 'A1',
      because: 'Its eyes are closed.',
    });
  });

  it('asks also about photos with a low score', async () => {
    await scanLisbon();
    fakeModels.answers.judgement = { ...verdictAnswer, score: 5 };
    await runOk('cull', 'lisbon');
    await runOk('pick', 'lisbon');
    await explainLisbon();
    expect(aboutSingles()[0]?.images).toBe(3);
  });

  it('asks only about photos without a reason, unless told to', async () => {
    await publishOne();
    answerAll();
    await explainLisbon();
    expect(await explainLisbon()).toMatchObject({ explained: 0 });
    expect(asked('reasons')).toHaveLength(2);
    await explainLisbon('--again');
    expect(asked('reasons')).toHaveLength(4);
  });

  it('asks again when the photo in front is out of the album', async () => {
    await publishOne();
    answerAll();
    await explainLisbon();
    await runOk('take-out', 'lisbon', 'A1', '--because', 'It is blurred.');
    fakeModels.answers.reasons = {
      reasons: [{ photo: 1, repeats: null, because: 'It is dark.' }],
    };
    expect(await explainLisbon()).toMatchObject({ explained: 1 });
    expect(aboutSingles()[1]?.texts.join(' ')).toContain(
      'None of these 1 photos is in the album.',
    );
    expect(await standingOf('B')).toEqual({
      kind: 'left-out',
      because: 'It is dark.',
    });
  });

  it('names the photos it got no reason for', async () => {
    await publishOne();
    fakeModels.answers.reasons = (question: Asked) =>
      isAboutStack(question)
        ? { reasons: [] }
        : {
            reasons: [
              { photo: 3, repeats: 2, because: 'It is dark.' },
              { photo: 1, repeats: null, because: 'It is in the album.' },
              { photo: 7, repeats: null, because: 'There is no such photo.' },
            ],
          };
    expect(await explainLisbon()).toMatchObject({
      explained: 1,
      similar: 0,
      notExplained: ['B', 'A2'],
    });
    const reasons = await shootJson('reasons.json');
    expect(reasons).toHaveLength(1);
    expect(reasons[0]).toMatchObject({ photo: 'C', repeats: null });
  });

  it('needs photos that were picked', async () => {
    await scanLisbon();
    const failure = await failureOf(
      'explain',
      'lisbon',
      '--review-model',
      judge,
    );
    expect(failure.message).toContain('keepsake pick lisbon');
  });
});
