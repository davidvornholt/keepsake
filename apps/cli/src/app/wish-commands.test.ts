import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import {
  asked,
  editLisbon,
  failureOf,
  pickLisbon,
  setUp,
  shootJson,
  tearDown,
} from './command-fixtures.ts';
import { type AnswerName, fakeModels } from './fake-models.ts';

beforeEach(() => setUp(spyOn));
afterEach(tearDown);

describe('keepsake edit, with something to remove', () => {
  const chair = 'the grey plastic chair at the left';
  const textsOf = (name: AnswerName) =>
    asked(name)
      .flatMap(({ texts }) => texts)
      .join(' ');

  it('has it removed and tells every other question', async () => {
    await pickLisbon();
    const box = { left: 0.9, top: 0.5, right: 0.8, bottom: 2 };
    fakeModels.answers.removals = { remove: [{ what: chair, box }] };
    await editLisbon('B');
    expect(await shootJson('edits', 'B', 'removals.json')).toEqual([
      { what: chair, box: { left: 0.8, top: 0.5, right: 0.9, bottom: 1 } },
    ]);
    expect(fakeModels.edits[0]?.prompt).toContain('Remove all of');
    expect(fakeModels.edits[0]?.prompt).toContain(`- ${chair}`);
    expect(fakeModels.edits[0]?.prompt).toContain('Every other person');
    for (const name of [
      'description',
      'people',
      'everyone',
      'signs',
      'textures',
      'assessment',
      'faults',
    ] as const) {
      expect(textsOf(name)).toContain(chair);
    }
  });

  it('does what the user wants and keeps the crop', async () => {
    await pickLisbon();
    await editLisbon('B');
    await editLisbon('B', '--wish', 'Remove the chair');
    expect(asked('crops')).toHaveLength(1);
    expect(fakeModels.edits).toHaveLength(2);
    expect(fakeModels.edits[1]?.prompt).toContain(
      'this is what I want: Remove the chair.',
    );
    for (const name of ['removals', 'everyone', 'assessment'] as const) {
      expect(asked(name)[0]?.texts.join(' ')).not.toContain('the chair”');
      expect(asked(name)[1]?.texts.join(' ')).toContain('“Remove the chair”');
    }
  });

  it('frames a photo as the user wants when it starts over', async () => {
    await pickLisbon();
    await editLisbon('B', '--wish', 'More room in front of the bird');
    await editLisbon('B', '--again');
    expect(asked('crops')).toHaveLength(2);
    for (const { texts } of asked('crops')) {
      expect(texts.join(' ')).toContain('“More room in front of the bird”');
    }
    await editLisbon('B', '--again', '--wish', '');
    expect(asked('crops')[2]?.texts.join(' ')).not.toContain('More room');
  });

  it('needs to know which photo a wish is about', async () => {
    await pickLisbon();
    expect((await failureOf('edit', 'lisbon', '--wish', 'Warm')).message).toBe(
      'Name the photos the wish is for.',
    );
  });
});
