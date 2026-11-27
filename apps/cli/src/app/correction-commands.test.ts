import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { existsSync, readFileSync, statSync } from 'node:fs';
import {
  asked,
  editLisbon,
  pickLisbon,
  setUp,
  shootFile,
  shootJson,
  tearDown,
} from './command-fixtures.ts';
import { type Asked, assessment, fakeModels } from './fake-models.ts';
import { fakeTools } from './fake-tools.ts';

const chair = 'Remove the grey chair';
const boat = 'Make the boat red';
const problem = 'A leg of the chair is left';

const place = (what: string, left: number) => ({
  part: 0,
  what,
  isRemoval: what === chair,
  box: { left, top: 0.4, right: left + 0.2, bottom: 0.6 },
});

const choice = (number: number, best: number, notes = 'It looks natural') => ({
  place: number,
  best,
  notes,
});

const finalFile = () => shootFile('edits', 'B', 'B-keepsake.jpg');

/** The finished photo is grey, and the versions take away a chair in it. */
const grey = 100;
const isChair = (x: number, y: number) => x >= 7 && x < 12 && y >= 14 && y < 18;
const withoutChair = (x: number, y: number) => (isChair(x, y) ? 200 : grey);

/** How bright a pixel of a picture is that keepsake wrote, 48 pixels wide. */
const brightnessAt = (file: string, x: number, y: number) =>
  readFileSync(file)[(y * 48 + x) * 3];
const final = () => readFileSync(finalFile(), 'utf8');

/** Edits a photo and marks its file, to see whether it stays. */
const editB = async () => {
  await pickLisbon();
  await editLisbon('B');
  await Bun.write(finalFile(), 'the former edit');
  fakeModels.answers.places = {
    everywhere: false,
    bringsBack: false,
    places: [place(chair, 0.1)],
  };
  fakeModels.answers.choices = { places: [choice(1, 1)] };
};

beforeEach(() => setUp(spyOn));
afterEach(tearDown);

describe('keepsake edit, with a wish for places of a finished photo', () => {
  it('changes only the places the wish is about', async () => {
    await editB();
    const camera = shootFile('edits', 'B', 'B.jpg');
    const { mtimeMs } = statSync(camera);
    fakeTools.pictures = {
      'B-keepsake.jpg': () => grey,
      'correction/version-1.png': withoutChair,
      'correction/version-2.png': withoutChair,
    };
    const result = await editLisbon('B', '--wish', 'No chair');
    expect(result).toMatchObject({ edited: 1, notDone: [], failed: [] });
    const changed = shootFile('edits', 'B', 'correction', 'result-1.png');
    expect(brightnessAt(changed, 10, 16)).toBeGreaterThan(150);
    expect(brightnessAt(changed, 40, 5)).toBe(grey);
    // The finished photo is made of it.
    expect(fakeTools.runs.at(-2)?.args.slice(0, 2)).toEqual([
      changed,
      '-strip',
    ]);
    expect(asked('places')[0]?.texts.join(' ')).toContain('“No chair”');
    expect(fakeModels.edits).toHaveLength(2);
    expect(fakeModels.edits[1]?.prompt).toContain(
      `Change only the following:\r\n\r\n- ${chair}.\r\n`,
    );
    // As it was, and the two versions in two ways each.
    expect(asked('choices')[0]?.images).toBe(1 + 1 + 2 * 2);
    for (const name of ['crops', 'assessment'] as const) {
      expect(asked(name)).toHaveLength(1);
    }
    expect(final()).not.toBe('the former edit');
    expect(statSync(camera).mtimeMs).toBe(mtimeMs);
    expect(await shootJson('edits', 'B', 'edit.json')).toMatchObject({
      version: 'ai',
      review: 'Changed: No chair.',
      attempts: 1,
    });
  });

  it('tries what didn’t work once more, with what was wrong', async () => {
    await editB();
    fakeModels.answers.places = {
      everywhere: false,
      bringsBack: false,
      places: [place(chair, 0.1), place(boat, 0.6)],
    };
    fakeModels.answers.choices = () => ({
      places:
        asked('choices').length === 1
          ? [choice(1, 0, problem), choice(2, 3)]
          : [choice(1, 2)],
    });
    const result = await editLisbon('B', '--wish', 'No chair, a red boat');
    expect(result.notDone).toEqual([]);
    expect(fakeModels.edits).toHaveLength(3);
    expect(fakeModels.edits[1]?.prompt).toContain(`- ${boat}.`);
    expect(fakeModels.edits[2]?.prompt).toContain(
      `- ${chair}. An earlier attempt failed: ${problem}.`,
    );
    expect(fakeModels.edits[2]?.prompt).not.toContain(boat);
  });

  it('keeps what worked and says what didn’t', async () => {
    await editB();
    fakeModels.answers.places = {
      everywhere: false,
      bringsBack: false,
      places: [place(chair, 0.1), place(boat, 0.6)],
    };
    fakeModels.answers.choices = () => ({
      places:
        asked('choices').length === 1
          ? [choice(1, 0, problem), choice(2, 3)]
          : [choice(1, 0, problem)],
    });
    const result = await editLisbon('B', '--wish', 'No chair, a red boat');
    const what = `${chair}. ${problem}.`;
    expect(result.notDone).toEqual([{ photo: 'B', what }]);
    expect(final()).not.toBe('the former edit');
    expect((await shootJson('edits', 'B', 'edit.json')).review).toBe(
      `Changed: No chair, a red boat. Not done: ${what}`,
    );
  });

  it('keeps the edit there is when nothing works', async () => {
    await editB();
    fakeModels.answers.choices = { places: [choice(1, 0, problem)] };
    const result = await editLisbon('B', '--wish', 'No chair');
    const what = `${chair}. ${problem}.`;
    expect(result.notDone).toEqual([{ photo: 'B', what }]);
    expect(fakeModels.edits).toHaveLength(3);
    expect(final()).toBe('the former edit');
    expect(existsSync(shootFile('edits', 'B', 'wish.json'))).toBe(false);
  });
});

describe('keepsake edit, with a wish that is more or less than that', () => {
  it('pays for nothing when the photo doesn’t show what it is about', async () => {
    await editB();
    fakeModels.answers.places = {
      everywhere: false,
      bringsBack: false,
      places: [],
    };
    const result = await editLisbon('B', '--wish', 'No chair');
    expect(result.notDone).toHaveLength(1);
    expect(fakeModels.edits).toHaveLength(1);
    expect(final()).toBe('the former edit');
  });

  it('doesn’t pay twice for a change that was interrupted', async () => {
    await editB();
    const { choices } = fakeModels.answers;
    fakeModels.answers.choices = () => new Response(null, { status: 400 });
    const failed = await editLisbon('B', '--wish', 'No chair');
    expect(failed.failed).toHaveLength(1);
    expect(final()).toBe('the former edit');
    fakeModels.answers.choices = choices;
    const result = await editLisbon('B', '--wish', 'No chair');
    expect(result).toMatchObject({ edited: 1, notDone: [], failed: [] });
    expect(fakeModels.edits).toHaveLength(2);
    expect(asked('places')).toHaveLength(1);
    // That one is done, so this is another attempt.
    await editLisbon('B', '--wish', 'No chair');
    expect(fakeModels.edits).toHaveLength(3);
  });

  it('edits all of it anew when the wish is about all of it', async () => {
    await editB();
    await editLisbon('B', '--wish', 'No chair');
    await Bun.write(finalFile(), 'the former edit');
    fakeModels.answers.places = {
      everywhere: true,
      bringsBack: false,
      places: [place(chair, 0.1)],
    };
    fakeModels.answers.assessment = {
      assessments: [assessment(1, { sameMoment: false, notes: 'Two heads.' })],
    };
    const kept = await editLisbon('B', '--wish', 'Warmer');
    expect(kept.notDone).toEqual([
      { photo: 'B', what: expect.stringContaining('Two heads.') },
    ]);
    expect(final()).toBe('the former edit');
    fakeModels.answers.assessment = { assessments: [assessment(1)] };
    const result = await editLisbon('B', '--wish', 'Warmer');
    expect(result.notDone).toEqual([]);
    expect(final()).not.toBe('the former edit');
    expect(fakeModels.edits.at(-1)?.prompt).toContain('No chair. Warmer.');
    expect(asked('crops')).toHaveLength(1);
  });

  it('remembers all wishes for when it starts over', async () => {
    await editB();
    await editLisbon('B', '--wish', 'No chair');
    await editLisbon('B', '--wish', 'A red boat');
    await editLisbon('B', '--again');
    const isTold = ({ texts }: Asked) =>
      texts.join(' ').includes('“No chair. A red boat”');
    expect(asked('crops').map(isTold)).toEqual([false, true]);
    expect(asked('removals').map(isTold)).toEqual([false, true]);
  });
});
