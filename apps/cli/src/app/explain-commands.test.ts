import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import {
  asked,
  editLisbon,
  failureOf,
  runOk,
  scanLisbon,
  setUp,
  shootJson,
  tearDown,
} from './command-fixtures.ts';
import { fakeModels } from './fake-models.ts';

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

beforeEach(() => setUp(spyOn));
afterEach(tearDown);

describe('keepsake explain', () => {
  it('finds out why good photos aren’t in the album', async () => {
    await publishOne();
    expect(await standingOf('B')).toMatchObject({ rule: 'no-room' });
    fakeModels.answers.reasons = bothReasons;
    expect(await runOk('explain', 'lisbon')).toMatchObject({
      explained: 2,
      repeats: 1,
      notExplained: [],
      failed: [],
    });
    const [question] = asked('reasons');
    expect(question?.images).toBe(3);
    expect(question?.texts.join(' ')).toContain(
      'Photos 1 to 1 are in the album. Photos 2 to 3 aren’t.',
    );
    expect(await standingOf('B')).toEqual({
      kind: 'left-out',
      rule: 'repeat',
      repeats: 'A1',
      because: 'The heron is closer in the album.',
    });
    expect(await standingOf('C')).toEqual({
      kind: 'left-out',
      rule: 'weaker',
      repeats: null,
      because: 'The branch covers the beak.',
    });
  });

  it('asks only about photos without a reason, unless told to', async () => {
    await publishOne();
    fakeModels.answers.reasons = bothReasons;
    await runOk('explain', 'lisbon');
    expect(await runOk('explain', 'lisbon')).toMatchObject({ explained: 0 });
    expect(asked('reasons')).toHaveLength(1);
    await runOk('explain', 'lisbon', '--again');
    expect(asked('reasons')).toHaveLength(2);
  });

  it('asks again when the photo it repeats is out of the album', async () => {
    await publishOne();
    fakeModels.answers.reasons = bothReasons;
    await runOk('explain', 'lisbon');
    await runOk('take-out', 'lisbon', 'A1', '--because', 'It is blurred.');
    fakeModels.answers.reasons = {
      reasons: [{ photo: 1, repeats: null, because: 'It is dark.' }],
    };
    expect(await runOk('explain', 'lisbon')).toMatchObject({ explained: 1 });
    expect(asked('reasons')[1]?.texts.join(' ')).toContain(
      'None of these 1 photos is in the album.',
    );
    expect(await standingOf('B')).toMatchObject({
      rule: 'weaker',
      because: 'It is dark.',
    });
  });

  it('names the photos it got no reason for', async () => {
    await publishOne();
    fakeModels.answers.reasons = {
      reasons: [
        { photo: 3, repeats: 2, because: 'It is dark.' },
        { photo: 1, repeats: null, because: 'It is in the album.' },
        { photo: 7, repeats: null, because: 'There is no such photo.' },
      ],
    };
    expect(await runOk('explain', 'lisbon')).toMatchObject({
      explained: 1,
      repeats: 0,
      notExplained: ['B'],
    });
    const reasons = await shootJson('reasons.json');
    expect(reasons).toHaveLength(1);
    expect(reasons[0]).toMatchObject({ photo: 'C', repeats: null });
  });

  it('needs photos that were picked', async () => {
    await scanLisbon();
    const failure = await failureOf('explain', 'lisbon');
    expect(failure.message).toContain('keepsake pick lisbon');
  });
});
