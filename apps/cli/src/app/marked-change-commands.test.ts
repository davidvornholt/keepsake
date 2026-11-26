import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { readFileSync } from 'node:fs';
import {
  editLisbon,
  pickLisbon,
  setUp,
  shootFile,
  shootJson,
  tearDown,
} from './command-fixtures.ts';
import { assessment, fakeModels } from './fake-models.ts';

beforeEach(() => setUp(spyOn));
afterEach(tearDown);

const marked = { left: 0.1, top: 0.3, right: 0.4, bottom: 0.7 };
const chair = 'Remove the chair';

/** The owner marked a place of B and handed it over. */
const markB = () =>
  Bun.write(
    shootFile('marks', 'one.json'),
    JSON.stringify({
      id: 'one',
      photo: 'B',
      kind: 'change',
      note: chair,
      boxes: [marked],
      other: null,
      madeAt: '2026-04-01T10:00:00Z',
      handedOverAt: '2026-04-01T11:00:00Z',
      answer: null,
      seenAt: null,
    }),
  );

const finalFile = () => shootFile('edits', 'B', 'B-keepsake.jpg');

/** Says the chair is at a place, and that a version is good there. */
const chairAt = (box: object) => {
  fakeModels.answers.places = {
    everywhere: false,
    places: [{ part: 0, what: chair, isRemoval: true, box }],
  };
  fakeModels.answers.choices = {
    places: [{ place: 1, best: 1, notes: 'Clean' }],
  };
};

const isLocal = (prompt: string | undefined) =>
  prompt?.includes('Change only the following') === true;

const isInMark = ({ box }: { box: typeof marked }) =>
  box.left >= marked.left - 0.05 &&
  box.top >= marked.top - 0.07 &&
  box.right <= marked.right + 0.05 &&
  box.bottom <= marked.bottom + 0.07;

describe('keepsake edit, with a mark at places of a finished photo', () => {
  it('changes a large thing only inside the mark', async () => {
    await pickLisbon();
    await editLisbon('B');
    await markB();
    chairAt({ left: 0, top: 0, right: 0.9, bottom: 0.9 });
    const result = await editLisbon('--mark', 'one');
    expect(result.notDone).toEqual([]);
    expect(fakeModels.edits).toHaveLength(2);
    expect(isLocal(fakeModels.edits[1]?.prompt)).toBe(true);
    const { places } = await shootJson(
      'edits',
      'B',
      'correction',
      'places.json',
    );
    expect(places.length).toBeGreaterThan(0);
    expect(places.every(isInMark)).toBe(true);
  });

  it('says so when the wish is about all of the photo', async () => {
    await pickLisbon();
    await editLisbon('B');
    await Bun.write(finalFile(), 'the former edit');
    await markB();
    fakeModels.answers.places = { everywhere: true, places: [] };
    const result = await editLisbon('--mark', 'one');
    expect(result.notDone).toHaveLength(1);
    expect(fakeModels.edits).toHaveLength(1);
    expect(readFileSync(finalFile(), 'utf8')).toBe('the former edit');
  });

  it('keeps to the mark where places were found before that', async () => {
    await pickLisbon();
    await editLisbon('B');
    await Bun.write(finalFile(), 'the former edit');
    await markB();
    // What a change that stopped left behind, before marks were kept to.
    const correction = (name: string, value: object) =>
      Bun.write(
        shootFile('edits', 'B', 'correction', name),
        JSON.stringify(value),
      );
    await correction('wish.json', { wish: chair });
    await correction('areas.json', [marked]);
    await correction('places.json', { everywhere: true, places: [] });
    const result = await editLisbon('--mark', 'one');
    expect(result.notDone).toHaveLength(1);
    expect(fakeModels.edits).toHaveLength(1);
    expect(readFileSync(finalFile(), 'utf8')).toBe('the former edit');
  });

  it('changes the camera’s own picture only inside the mark', async () => {
    await pickLisbon();
    fakeModels.answers.assessment = {
      assessments: [
        assessment(1, { samePlace: false, notes: 'Another beach.' }),
      ],
    };
    expect((await editLisbon('B')).keptFromCamera).toHaveLength(1);
    const before = fakeModels.edits.length;
    fakeModels.answers.assessment = undefined;
    await markB();
    chairAt({ ...marked, right: 0.3 });
    const result = await editLisbon('--mark', 'one');
    expect(result.notDone).toEqual([]);
    expect(fakeModels.edits).toHaveLength(before + 1);
    expect(isLocal(fakeModels.edits.at(-1)?.prompt)).toBe(true);
    expect(await shootJson('edits', 'B', 'edit.json')).toMatchObject({
      version: 'ai',
    });
  });
});
