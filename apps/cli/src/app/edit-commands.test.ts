import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { existsSync, statSync } from 'node:fs';
import {
  asked,
  editLisbon,
  failureOf,
  judge,
  photosFolder,
  pickLisbon,
  runOk,
  setUp,
  shootFile,
  shootJson,
  tearDown,
} from './command-fixtures.ts';
import { assessment, fakeModels } from './fake-models.ts';
import { fakeTools } from './fake-tools.ts';

beforeEach(() => setUp(spyOn));
afterEach(tearDown);

describe('keepsake edit', () => {
  it('edits every picked photo and keeps what passes the review', async () => {
    await pickLisbon();
    const result = await editLisbon();
    expect(result).toMatchObject({
      edited: 3,
      keptFromCamera: [],
      overBudget: [],
      failed: [],
    });
    expect(fakeModels.edits).toHaveLength(3);
    expect(fakeModels.edits[0]?.size).toBe('3520x2352');
    expect(fakeModels.edits[0]?.prompt).toContain('from Lisbon, May 2026');
    expect(fakeModels.edits[0]?.prompt).toContain('A heron takes off.');
    for (const photo of ['A1', 'B', 'C']) {
      expect(
        existsSync(shootFile('edits', photo, `${photo}-keepsake.jpg`)),
      ).toBe(true);
    }
  });

  it('edits nothing twice, unless told to start over', async () => {
    await pickLisbon();
    await editLisbon();
    await editLisbon();
    expect(fakeModels.edits).toHaveLength(3);
    const camera = shootFile('edits', 'B', 'B.jpg');
    const { mtimeMs } = statSync(camera);
    await editLisbon('B', '--again');
    expect(fakeModels.edits).toHaveLength(4);
    // Immich would show it twice if it were made anew.
    expect(statSync(camera).mtimeMs).toBe(mtimeMs);
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
    await editLisbon('B');
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
    await editLisbon('B');
    const marking = fakeTools.runs.find(
      ({ command, args }) =>
        command === 'exiftool' &&
        args.some((arg) => arg.includes('DigitalSourceType')),
    );
    expect(marking?.args).toContain('-XMP-xmp:Rating=4');
    expect(marking?.args).toContain('-XMP-dc:Description=A heron takes off.');
  });
});

const timesWritten = () =>
  fakeTools.runs
    .filter(({ command }) => command === 'exiftool')
    .flatMap(({ args }) =>
      args.filter((arg) => arg.startsWith('-EXIF:DateTimeOriginal=')),
    );

describe('keepsake edit, in another time zone', () => {
  it('writes the time where the photos were taken', async () => {
    await pickLisbon();
    await runOk(
      'scan',
      photosFolder(),
      '--name',
      'lisbon',
      '--time-zone',
      'Europe/Lisbon',
    );
    // Scanning again without it keeps it.
    await runOk('scan', photosFolder(), '--name', 'lisbon');
    await editLisbon('B');
    const time = '-EXIF:DateTimeOriginal=2026:03:30 09:00:00';
    expect(timesWritten()).toEqual([time, time]);
  });

  it('leaves the camera’s clock alone otherwise', async () => {
    await pickLisbon();
    await editLisbon('B');
    expect(timesWritten()).toEqual([]);
  });

  it('refuses a time zone there isn’t', async () => {
    const failure = await failureOf(
      'scan',
      photosFolder(),
      '--title',
      'Lisbon',
      '--time-zone',
      'Lisbon',
    );
    expect(failure._tag).toBe('InvalidInput');
    expect(failure.message).toContain('Europe/Lisbon');
  });
});

describe('keepsake edit, with named photos', () => {
  it('edits one that isn’t the best of its moment', async () => {
    await pickLisbon();
    expect((await editLisbon('A2')).edited).toBe(1);
    expect(asked('description')).toHaveLength(1);
  });

  it('edits a photo named twice once', async () => {
    await pickLisbon();
    await editLisbon('B');
    const result = await editLisbon('B', 'B', '--again');
    expect(result.edited).toBe(1);
    expect(fakeModels.edits).toHaveLength(2);
  });
});

describe('keepsake edit, with people', () => {
  it('puts the photo’s own people into every version', async () => {
    await pickLisbon();
    fakeModels.answers.people = {
      people: [
        {
          face: { left: 0.4, top: 0.1, right: 0.6, bottom: 0.4 },
          outline: [
            { x: 0.3, y: 0 },
            { x: 0.7, y: 0 },
            { x: 0.7, y: 1.2 },
            { x: 0.3, y: 1.2 },
          ],
        },
        {
          face: { left: 0.4, top: 0.1, right: 0.4, bottom: 0.4 },
          outline: [{ x: 0.3, y: 0 }],
        },
      ],
    };
    await editLisbon('B');
    const people = await shootJson('edits', 'B', 'people.json');
    // A person without a face or an outline can't be kept.
    expect(people).toHaveLength(1);
    expect(people[0].outline[2]).toEqual({ x: 0.7, y: 1 });
    const version = shootFile('edits', 'B', 'version-1-kept.png');
    expect(existsSync(version)).toBe(true);
    const sources = fakeTools.runs
      .filter(({ command }) => command === 'magick')
      .map(({ args }) => args[0]);
    expect(sources).toContain(version);
    // The original and the two versions, each with the face close up.
    expect(
      asked('assessment')[0]?.texts.filter((text) => text.includes('a face')),
    ).toHaveLength(3);
    expect(fakeModels.edits).toHaveLength(1);
  });

  it('finishes what the model made when nobody is in the photo', async () => {
    await pickLisbon();
    await editLisbon('B');
    expect(asked('people')).toHaveLength(1);
    expect(existsSync(shootFile('edits', 'B', 'version-1.png'))).toBe(true);
    expect(existsSync(shootFile('edits', 'B', 'version-1-kept.png'))).toBe(
      false,
    );
  });
});

describe('keepsake edit, with signs', () => {
  it('puts the photo’s own signs where a version got them wrong', async () => {
    await pickLisbon();
    const box = { left: 0.2, top: 0.2, right: 0.4, bottom: 0.3 };
    fakeModels.answers.signs = {
      signs: [
        { part: 1, text: 'HOTEL', box },
        { part: 1, text: 'PARK', box },
        { part: 1, text: 'SALE', box },
        // Neither a part that isn't there nor an empty box can be kept.
        { part: 9, text: 'BAR', box },
        { part: 1, text: 'CAFE', box: { ...box, right: 0.2 } },
      ],
    };
    fakeModels.answers['changed-signs'] = () => ({
      changed: asked('changed-signs').length === 1 ? [1, 3, 7] : [],
      // The banner it was on isn't there any more either.
      gone: [3],
    });
    const result = await editLisbon('B');
    expect(result.edited).toBe(1);
    const signs = (name: string) => shootJson('edits', 'B', name);
    expect(await signs('signs.json')).toHaveLength(3);
    expect(await signs('version-1-signs.json')).toEqual([
      { text: 'HOTEL', box },
    ]);
    expect(await signs('version-2-signs.json')).toEqual([]);
    const isKept = (version: string) =>
      existsSync(shootFile('edits', 'B', version));
    expect(isKept('version-1-kept.png')).toBe(true);
    expect(isKept('version-2-kept.png')).toBe(false);
    expect(
      asked('assessment')[0]?.texts.some((text) => text.includes('“HOTEL”')),
    ).toBe(true);
  });

  it('compares many signs a few at a time', async () => {
    await pickLisbon();
    fakeModels.answers.signs = {
      signs: Array.from({ length: 25 }, (_, sign) => ({
        part: 1,
        text: `${sign}`,
        box: { left: 0.2, top: 0.2, right: 0.4, bottom: 0.3 },
      })),
    };
    fakeModels.answers['changed-signs'] = { changed: [2], gone: [] };
    await editLisbon('B', '--versions', '1');
    expect(asked('changed-signs').map(({ images }) => images)).toEqual([
      40, 10,
    ]);
    const changed = await shootJson('edits', 'B', 'version-1-signs.json');
    expect(changed.map(({ text }: { text: string }) => text)).toEqual([
      '1',
      '21',
    ]);
  });

  it('says nothing about signs when there are none', async () => {
    await pickLisbon();
    await editLisbon('B');
    expect(asked('signs')).toHaveLength(1);
    expect(
      asked('assessment')[0]?.texts.some((text) => text.includes('signs')),
    ).toBe(false);
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
    const result = await editLisbon('B');
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
    const result = await editLisbon('B');
    expect(result.keptFromCamera[0].reason).toContain('refused');
    expect(fakeModels.edits).toHaveLength(1);
  });

  it('lists a photo that fails and goes on', async () => {
    await pickLisbon();
    fakeModels.editAnswer = () =>
      Response.json({ error: { message: 'no such model' } }, { status: 404 });
    const result = await editLisbon('B');
    expect(result.failed).toEqual([
      {
        photo: 'B',
        reason: 'azure/gpt-image-2.5-sunburst answered 404: no such model',
      },
    ]);
  });

  it('lists a photo as failed when the image model answers with no image', async () => {
    await pickLisbon();
    fakeModels.editAnswer = () => Response.json({ data: [] });
    const result = await editLisbon('B');
    expect(result.failed).toEqual([
      { photo: 'B', reason: expect.stringContaining('without an image') },
    ]);
    expect(result.keptFromCamera).toEqual([]);
    expect(existsSync(shootFile('edits', 'B', 'B-keepsake.jpg'))).toBe(false);
    fakeModels.editAnswer = undefined;
    expect((await editLisbon('B')).edited).toBe(1);
    expect(fakeModels.edits).toHaveLength(2);
  });

  it('refuses a photo nobody judged', async () => {
    await pickLisbon();
    const failure = await failureOf(
      'edit',
      'lisbon',
      'Z',
      '--review-model',
      judge,
    );
    expect(failure._tag).toBe('InvalidInput');
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
