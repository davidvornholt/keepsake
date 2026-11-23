import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { existsSync } from 'node:fs';
import {
  asked,
  failureOf,
  pickLisbon,
  runOk,
  setUp,
  shootFile,
  shootJson,
  tearDown,
} from './command-fixtures.ts';
import { assessment, fakeModels, verdictAnswer } from './fake-models.ts';
import { fakeTools } from './fake-tools.ts';

beforeEach(() => setUp(spyOn));
afterEach(tearDown);

describe('keepsake edit', () => {
  it('edits every picked photo and keeps what passes the review', async () => {
    await pickLisbon();
    const result = await runOk('edit', 'lisbon');
    expect(result).toMatchObject({
      edited: 3,
      keptFromCamera: [],
      overBudget: [],
      failed: [],
    });
    expect(fakeModels.edits).toHaveLength(3);
    expect(fakeModels.edits[0]?.size).toBe('3520x2352');
    expect(fakeModels.edits[0]?.prompt).toContain('from Lisbon, May 2026');
    expect(fakeModels.edits[0]?.prompt).toContain(verdictAnswer.description);
    for (const photo of ['A1', 'B', 'C']) {
      expect(
        existsSync(shootFile('edits', photo, `${photo}-keepsake.jpg`)),
      ).toBe(true);
    }
  });

  it('crops to the framing the model chooses', async () => {
    await pickLisbon();
    fakeModels.answers.crops = {
      subject: { left: 0.4, top: 0.4, right: 0.5, bottom: 0.5 },
      faces: [],
      crops: [
        {
          box: { left: 0.3, top: 0.3, right: 0.6, bottom: 0.6 },
          aspect: '4:5',
          reason: 'Tight.',
        },
      ],
    };
    fakeModels.answers.choice = { best: 2, reason: 'Closer is better.' };
    await runOk('edit', 'lisbon', 'B');
    expect(fakeModels.edits[0]?.size).toBe('2576x3216');
    expect(await shootJson('edits', 'B', 'crop.json')).toMatchObject({
      aspect: '4:5',
      reason: 'Closer is better.',
    });
  });

  it('edits nothing twice, unless told to start over', async () => {
    await pickLisbon();
    await runOk('edit', 'lisbon');
    await runOk('edit', 'lisbon');
    expect(fakeModels.edits).toHaveLength(3);
    await runOk('edit', 'lisbon', 'B', '--again');
    expect(fakeModels.edits).toHaveLength(4);
  });

  it('tries once more with what was wrong', async () => {
    await pickLisbon();
    fakeModels.answers.assessment = (question: { texts: Array<string> }) => ({
      assessments:
        asked('assessment').length === 1
          ? [assessment(1, { sameMoment: false, notes: 'It has two heads' })]
          : [assessment(2, { beauty: 9 }), assessment(1)],
      question,
    });
    await runOk('edit', 'lisbon', 'B');
    expect(fakeModels.edits).toHaveLength(2);
    expect(fakeModels.edits[0]?.prompt).not.toContain('It has two heads');
    expect(fakeModels.edits[1]?.prompt).toContain('It has two heads.');
    expect(await shootJson('edits', 'B', 'edit.json')).toMatchObject({
      version: 'ai',
      attempts: 2,
    });
  });

  it('marks what an image model made, with the score and a caption', async () => {
    await pickLisbon();
    await runOk('edit', 'lisbon', 'B');
    const marking = fakeTools.runs.find(
      ({ command, args }) =>
        command === 'exiftool' &&
        args.some((arg) => arg.includes('DigitalSourceType')),
    );
    expect(marking?.args).toContain('-XMP-xmp:Rating=4');
    expect(marking?.args).toContain(
      `-XMP-dc:Description=${verdictAnswer.description}`,
    );
  });
});

describe('keepsake edit, when something goes wrong', () => {
  it('keeps the camera’s own picture when no version passes', async () => {
    await pickLisbon();
    fakeModels.answers.assessment = {
      assessments: [
        assessment(1, { samePlace: false, notes: 'Another beach.' }),
      ],
    };
    const result = await runOk('edit', 'lisbon', 'B');
    expect(result.edited).toBe(0);
    expect(result.keptFromCamera).toEqual([
      { photo: 'B', reason: 'Another beach.' },
    ]);
    const finishing = fakeTools.runs
      .filter(({ command }) => command === 'exiftool')
      .flatMap(({ args }) => args);
    expect(finishing.some((arg) => arg.includes('DigitalSourceType'))).toBe(
      false,
    );
  });

  it('keeps the camera’s own picture when the image model refuses', async () => {
    await pickLisbon();
    fakeModels.editAnswer = () =>
      Response.json(
        { error: { code: 'moderation_blocked', message: 'refused' } },
        { status: 400 },
      );
    const result = await runOk('edit', 'lisbon', 'B');
    expect(result.keptFromCamera[0].reason).toContain('refused');
    expect(fakeModels.edits).toHaveLength(1);
  });

  it('lists a photo that fails and goes on', async () => {
    await pickLisbon();
    fakeModels.editAnswer = () =>
      Response.json({ error: { message: 'no such model' } }, { status: 404 });
    const result = await runOk('edit', 'lisbon', 'B');
    expect(result.failed).toEqual([
      {
        photo: 'B',
        reason: 'azure/gpt-image-2.5-sunburst answered 404: no such model',
      },
    ]);
  });

  it('starts no photo beyond the budget', async () => {
    await pickLisbon();
    const result = await runOk('edit', 'lisbon', '--budget', '1');
    expect(result.edited).toBe(2);
    expect(result.overBudget).toHaveLength(1);
  });

  it('refuses a photo nobody judged', async () => {
    await pickLisbon();
    expect((await failureOf('edit', 'lisbon', 'Z'))._tag).toBe('InvalidInput');
  });

  it('refuses a provider that can’t edit photos', async () => {
    await pickLisbon();
    const failure = await failureOf(
      'edit',
      'lisbon',
      '--image-model',
      'anthropic/claude-opus-5-5',
    );
    expect(failure.message).toContain("can't edit photos");
  });
});
