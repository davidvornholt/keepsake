import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import {
  editLisbon,
  failureOf,
  photosFolder,
  runOk,
  scanLisbon,
  setUp,
  shootFile,
  tearDown,
} from './command-fixtures.ts';
import { verdictAnswer } from './fake-models.ts';

beforeEach(() => setUp(spyOn));
afterEach(tearDown);

describe('keepsake shoots', () => {
  it('lists what was scanned', async () => {
    expect(await runOk('shoots')).toEqual({ shoots: [] });
    await scanLisbon();
    expect(await runOk('shoots')).toEqual({
      shoots: [
        {
          shoot: 'lisbon',
          title: 'Lisbon',
          about: 'Lisbon, May 2026',
          source: photosFolder(),
          photos: 4,
          moments: 3,
          folder: shootFile(),
        },
      ],
    });
  });
});

describe('keepsake show', () => {
  it('shows where a shoot stands', async () => {
    await scanLisbon();
    expect(await runOk('show', 'lisbon')).toMatchObject({
      judgedBy: { moments: 0 },
      picked: [],
      album: null,
      dollarsSpent: 0,
    });
    await runOk('cull', 'lisbon');
    await runOk('pick', 'lisbon');
    await editLisbon('B');
    const shown = await runOk('show', 'lisbon');
    expect(shown.judgedBy.moments).toBe(3);
    expect(shown.picked[1]).toMatchObject({
      photo: 'B',
      score: 8,
      edit: { version: 'ai', file: shootFile('edits', 'B', 'B-keepsake.jpg') },
      published: null,
    });
    expect(shown.picked[2].edit).toBeNull();
  });

  it('shows everything about a photo', async () => {
    await scanLisbon();
    await runOk('cull', 'lisbon');
    expect(await runOk('show', 'lisbon', 'A2')).toMatchObject({
      id: 'A2',
      camera: 'ILCE-7M4',
      takenAt: '2026-03-30T10:00:01.000',
      moment: { id: 'A1', photos: ['A1', 'A2'] },
      verdict: { best: ['A1'], description: verdictAnswer.description },
      edit: null,
    });
  });

  it('refuses a photo that isn’t there', async () => {
    await scanLisbon();
    expect((await failureOf('show', 'lisbon', 'Z'))._tag).toBe('InvalidInput');
  });

  it.each(['Lisbon', '../lisbon', ''])(
    'refuses %j as a shoot’s name',
    async (name) => {
      expect((await failureOf('show', name))._tag).toBe('InvalidInput');
    },
  );
});
