import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { readFileSync } from 'node:fs';
import {
  asked,
  editLisbon,
  failureOf,
  pickLisbon,
  setUp,
  shootFile,
  shootJson,
  tearDown,
} from './command-fixtures.ts';
import { assessment, fakeModels } from './fake-models.ts';
import { fakeTools } from './fake-tools.ts';

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
      note: chair,
      boxes: [marked],
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

/** The pixels of a change beyond the mark and the little around it. */
const outsideMark = (file: string): ReadonlyArray<number> => {
  const pixels = readFileSync(file);
  const width = 48;
  const height = 32;
  const across = (marked.right - marked.left) * 0.15;
  const down = (marked.bottom - marked.top) * 0.15;
  const isMarked = (x: number, y: number) =>
    x + 0.5 > (marked.left - across) * width &&
    x + 0.5 < (marked.right + across) * width &&
    y + 0.5 > (marked.top - down) * height &&
    y + 0.5 < (marked.bottom + down) * height;
  return Array.from({ length: width * height }, (_, index) => index).flatMap(
    (index) =>
      isMarked(index % width, Math.floor(index / width))
        ? []
        : [pixels[index * 3] ?? 0],
  );
};

describe('keepsake edit, with a mark at places of a finished photo', () => {
  it('changes a large thing only inside the mark', async () => {
    await pickLisbon();
    await editLisbon('B');
    await markB();
    chairAt({ left: 0, top: 0, right: 0.9, bottom: 0.9 });
    fakeTools.pictures = {
      'B-keepsake.jpg': () => 100,
      'correction/version-1.png': () => 200,
      'correction/version-2.png': () => 200,
    };
    const result = await editLisbon('--mark', 'one', '--budget', '5');
    expect(result.notDone).toEqual([]);
    expect(fakeModels.edits).toHaveLength(2);
    expect(isLocal(fakeModels.edits[1]?.prompt)).toBe(true);
    const outside = outsideMark(
      shootFile('edits', 'B', 'correction', 'result-1.png'),
    );
    expect(outside.length).toBeGreaterThan(0);
    expect(outside.filter((value) => value !== 100)).toEqual([]);
  });

  it('leaves every pixel outside the mark as it was', async () => {
    await pickLisbon();
    await editLisbon('B');
    await markB();
    chairAt({ left: 0.1, top: 0.35, right: 0.6, bottom: 0.65 });
    // The versions change a place on both sides of the mark's edge.
    const isChanged = (x: number, y: number) =>
      x >= 12 && x < 30 && y >= 14 && y < 18;
    const version = (x: number, y: number) => (isChanged(x, y) ? 200 : 100);
    fakeTools.pictures = {
      'B-keepsake.jpg': () => 100,
      'correction/version-1.png': version,
      'correction/version-2.png': version,
    };
    expect(
      (await editLisbon('--mark', 'one', '--budget', '5')).notDone,
    ).toEqual([]);
    const result = shootFile('edits', 'B', 'correction', 'result-1.png');
    expect(outsideMark(result).filter((value) => value !== 100)).toEqual([]);
    const pixels = readFileSync(result);
    const width = 48;
    const row = Array.from(
      { length: 10 },
      (_, index) => pixels[(16 * width + 14 + index) * 3] ?? 0,
    );
    const change = (row[0] ?? 0) - 100;
    expect(change).toBeGreaterThan(0);
    // The change fades out across the little around the mark, without a step.
    const steps = row.slice(1).map((value, index) => (row[index] ?? 0) - value);
    expect(steps.every((step) => step >= 0)).toBe(true);
    expect(Math.max(...steps)).toBeLessThan((change * 2) / 3);
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
    const result = await editLisbon('--mark', 'one', '--budget', '5');
    expect(result.notDone).toEqual([]);
    expect(fakeModels.edits).toHaveLength(before + 1);
    expect(isLocal(fakeModels.edits.at(-1)?.prompt)).toBe(true);
    expect(await shootJson('edits', 'B', 'edit.json')).toMatchObject({
      version: 'ai',
    });
  });
});

describe('keepsake edit, with a mark that can’t be kept to', () => {
  it('refuses to start over, which would change all of it', async () => {
    await pickLisbon();
    await editLisbon('B');
    await Bun.write(finalFile(), 'the former edit');
    await markB();
    const failure = await failureOf(
      'edit',
      'lisbon',
      '--mark',
      'one',
      '--again',
    );
    expect(failure._tag).toBe('InvalidInput');
    expect(readFileSync(finalFile(), 'utf8')).toBe('the former edit');
    expect(await shootJson('edits', 'B', 'edit.json')).toMatchObject({
      version: 'ai',
    });
    expect(fakeModels.edits).toHaveLength(1);
  });

  it('starts the change anew with another image model', async () => {
    await pickLisbon();
    await editLisbon('B');
    await markB();
    chairAt(marked);
    fakeModels.answers.choices = () => new Response(null, { status: 400 });
    expect(
      (await editLisbon('--mark', 'one', '--budget', '5')).failed,
    ).toHaveLength(1);
    const before = fakeModels.edits.length;
    chairAt(marked);
    const other = 'gpt-image-2.5-flare';
    await editLisbon(
      '--mark',
      'one',
      '--budget',
      '5',
      '--image-model',
      `azure/${other}`,
    );
    expect(fakeModels.edits.slice(before).map(({ model }) => model)).toEqual([
      other,
    ]);
    expect(await shootJson('edits', 'B', 'edit.json')).toMatchObject({
      model: `azure/${other}`,
    });
  });

  it('changes with another image model only within the budget', async () => {
    await pickLisbon();
    await editLisbon('B');
    await markB();
    chairAt(marked);
    fakeModels.answers.choices = () => new Response(null, { status: 400 });
    expect(
      (await editLisbon('--mark', 'one', '--budget', '5')).failed,
    ).toHaveLength(1);
    const before = fakeModels.edits.length;
    chairAt(marked);
    const result = await editLisbon(
      '--mark',
      'one',
      '--budget',
      '0.01',
      '--image-model',
      'azure/gpt-image-2.5-flare',
    );
    expect(result.edited).toBe(0);
    expect(fakeModels.edits).toHaveLength(before);
  });

  it('says so when the wish is about all of the photo', async () => {
    await pickLisbon();
    await editLisbon('B');
    await Bun.write(finalFile(), 'the former edit');
    await markB();
    fakeModels.answers.places = { everywhere: true, places: [] };
    const result = await editLisbon('--mark', 'one', '--budget', '5');
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
    const result = await editLisbon('--mark', 'one', '--budget', '5');
    expect(result.notDone).toHaveLength(1);
    expect(fakeModels.edits).toHaveLength(1);
    expect(readFileSync(finalFile(), 'utf8')).toBe('the former edit');
  });
});

describe('keepsake edit, with marks that overlap', () => {
  it('shows the reviewer a thing in both of them once', async () => {
    await pickLisbon();
    await editLisbon('B');
    await Bun.write(
      shootFile('marks', 'one.json'),
      JSON.stringify({
        id: 'one',
        photo: 'B',
        note: chair,
        boxes: [marked, { ...marked, left: 0.2, right: 0.5 }],
        madeAt: '2026-04-01T10:00:00Z',
        handedOverAt: '2026-04-01T11:00:00Z',
        answer: null,
        seenAt: null,
      }),
    );
    chairAt({ left: 0.25, top: 0.4, right: 0.35, bottom: 0.6 });
    expect(
      (await editLisbon('--mark', 'one', '--budget', '5')).notDone,
    ).toEqual([]);
    const shown = asked('choices').flatMap(({ texts }) =>
      texts.filter((text) => text.includes(chair)),
    );
    expect(shown).toHaveLength(1);
  });
});
