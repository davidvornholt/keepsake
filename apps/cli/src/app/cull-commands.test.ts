import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import process from 'node:process';
import {
  asked,
  failureOf,
  runOk,
  scanLisbon,
  setUp,
  shootFile,
  shootJson,
  tearDown,
} from './command-fixtures.ts';
import { fakeModels, verdictAnswer } from './fake-models.ts';
import { fakeTools } from './fake-tools.ts';

beforeEach(() => setUp(spyOn));
afterEach(tearDown);

describe('keepsake scan', () => {
  it('groups photos into moments and makes previews', async () => {
    const result = await scanLisbon();
    expect(result).toMatchObject({
      shoot: 'lisbon',
      photos: 4,
      moments: 3,
      unreadable: [],
    });
    expect(await shootJson('moments.json')).toEqual([
      { id: 'A1', photos: ['A1', 'A2'] },
      { id: 'B', photos: ['B'] },
      { id: 'C', photos: ['C'] },
    ]);
    expect(existsSync(shootFile('previews', 'A1.jpg'))).toBe(true);
  });

  it('lists files it can’t read and goes on', async () => {
    fakeTools.broken = new Set(['B.ARW']);
    const result = await scanLisbon();
    expect(result.photos).toBe(3);
    expect(result.unreadable).toEqual([
      { file: 'B.ARW', reason: 'exiftool failed: unreadable file' },
    ]);
  });

  it('refuses a folder that isn’t there', async () => {
    const failure = await failureOf('scan', '/nowhere/at/all');
    expect(failure._tag).toBe('InvalidInput');
  });

  it('refuses a name that means another folder already', async () => {
    await scanLisbon();
    const failure = await failureOf('scan', '/tmp', '--name', 'lisbon');
    expect(failure.message).toContain('already about');
  });
});

describe('keepsake cull', () => {
  it('asks once about each moment and keeps the verdicts', async () => {
    await scanLisbon();
    const result = await runOk('cull', 'lisbon');
    expect(result).toMatchObject({ moments: 3, failed: [] });
    expect(result.scores['score 8']).toBe(3);
    expect(asked('judgement').map(({ images }) => images)).toEqual([2, 1, 1]);
    await runOk('cull', 'lisbon');
    expect(asked('judgement')).toHaveLength(3);
    await runOk('cull', 'lisbon', '--again');
    expect(asked('judgement')).toHaveLength(6);
  });

  it('decides between good frames with close-ups', async () => {
    await scanLisbon();
    const focus = verdictAnswer.ranking[0]?.focus;
    fakeModels.answers.judgement = (question: { images: number }) =>
      question.images === 2
        ? {
            ...verdictAnswer,
            ranking: [
              { frame: 1, focus },
              { frame: 2, focus },
            ],
          }
        : verdictAnswer;
    fakeModels.answers.check = {
      ranking: [2, 1],
      score: 9,
      reason: 'The second is sharp.',
    };
    await runOk('cull', 'lisbon');
    expect(asked('check').map(({ images }) => images)).toEqual([4]);
    expect(
      await shootJson('verdicts', 'azure--gpt-6-astra', 'A1.json'),
    ).toMatchObject({ best: ['A2', 'A1'], score: 9 });
  });

  it('goes on when a moment can’t be judged, and tries it again later', async () => {
    await scanLisbon();
    let count = 0;
    fakeModels.answers.judgement = () => {
      count += 1;
      return count === 1
        ? Response.json({ error: { message: 'too big' } }, { status: 400 })
        : verdictAnswer;
    };
    const first = await runOk('cull', 'lisbon');
    expect(first.failed).toHaveLength(1);
    expect((await runOk('cull', 'lisbon')).failed).toEqual([]);
    expect(count).toBe(4);
  });

  it('adds up what the models cost', async () => {
    await scanLisbon();
    const result = await runOk('cull', 'lisbon');
    // Three answers of 10,000 tokens in at $10 and 1,000 out at $50.
    expect(result.dollarsSpent).toBeCloseTo(0.45);
    expect((await runOk('show', 'lisbon')).dollarsSpent).toBeCloseTo(0.45);
  });

  it('needs a scan first', async () => {
    const failure = await failureOf('cull', 'madeira');
    expect(failure._tag).toBe('StepMissing');
    expect(failure.message).toContain('keepsake scan');
  });

  it('refuses a shoot another command is working on', async () => {
    await scanLisbon();
    await writeFile(shootFile('lock'), `${process.ppid}\n`);
    expect((await failureOf('cull', 'lisbon'))._tag).toBe('ShootBusy');
  });

  it('takes over from a command that was killed', async () => {
    await scanLisbon();
    await writeFile(shootFile('lock'), '999999999\n');
    await runOk('cull', 'lisbon');
    expect(existsSync(shootFile('lock'))).toBe(false);
  });
});

describe('keepsake pick', () => {
  it('leaves out low scores and repeats', async () => {
    await scanLisbon();
    let count = 0;
    fakeModels.answers.judgement = () => {
      count += 1;
      return { ...verdictAnswer, score: count === 1 ? 5 : 8 };
    };
    fakeModels.answers.album = { leaveOut: [{ photo: 2, insteadOf: 1 }] };
    await runOk('cull', 'lisbon');
    const result = await runOk('pick', 'lisbon');
    expect(result).toMatchObject({ candidates: 2, redundant: 1, picked: 1 });
  });

  it('keeps the best by comparison when there are too many', async () => {
    await scanLisbon();
    await runOk('cull', 'lisbon');
    fakeModels.answers.ranking = { bestFirst: [3, 1, 2] };
    const result = await runOk('pick', 'lisbon', '--maximum', '1');
    expect(result).toMatchObject({ candidates: 3, picked: 1 });
    const { picks } = await shootJson('picks.json');
    expect(picks.map(({ photo }: { photo: string }) => photo)).toEqual(['C']);
  });

  it('asks nothing when nothing changed', async () => {
    await scanLisbon();
    await runOk('cull', 'lisbon');
    await runOk('pick', 'lisbon');
    await runOk('pick', 'lisbon');
    expect(asked('album')).toHaveLength(1);
  });

  it('needs verdicts first', async () => {
    await scanLisbon();
    const failure = await failureOf('pick', 'lisbon');
    expect(failure.message).toContain('keepsake cull lisbon');
  });

  it('refuses a score outside 1 to 10', async () => {
    const failure = await failureOf('pick', 'lisbon', '--minimum-score', '11');
    expect(failure._tag).toBe('InvalidInput');
  });
});
