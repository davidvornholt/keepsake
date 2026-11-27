import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import {
  asked,
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

const crane = 'the yellow crane behind the church';
const otherCrane = 'the red crane by the river';
const atCrane = { left: 0.1, top: 0.3, right: 0.4, bottom: 0.7 };
const atOtherCrane = { left: 0.6, top: 0.2, right: 0.9, bottom: 0.5 };
const kept = `Keep what was taken out before: ${crane}.`;

const textsOf = (question: { readonly texts: ReadonlyArray<string> }) =>
  question.texts.join(' ');

/** keepsake takes the cranes out of B, unless it is told to keep the first. */
const editWithoutCranes = async () => {
  await pickLisbon();
  fakeModels.answers.removals = ({ texts }) => ({
    remove: [
      ...(texts.join(' ').includes(kept)
        ? []
        : [{ what: crane, box: atCrane }]),
      { what: otherCrane, box: atOtherCrane },
    ],
  });
  await editLisbon('B');
};

/** The owner marked the first crane's place and handed it over. */
const markCrane = (note: string) =>
  Bun.write(
    shootFile('marks', 'one.json'),
    JSON.stringify({
      id: 'one',
      photo: 'B',
      note,
      boxes: [atCrane],
      madeAt: '2026-04-01T10:00:00Z',
      handedOverAt: '2026-04-01T11:00:00Z',
      answer: null,
      seenAt: null,
    }),
  );

/** The change model names what of the list is to come back. */
const wantsBack = (...numbers: ReadonlyArray<number>) => {
  fakeModels.answers.places = {
    everywhere: false,
    places: [],
    back: numbers,
    replaces: [],
  };
};

const editMarked = () => editLisbon('--mark', 'one', '--budget', '5');

describe('keepsake edit, bringing back what it took out', () => {
  it('edits the photo anew and keeps it from then on', async () => {
    await editWithoutCranes();
    await markCrane('Back, please');
    wantsBack(1);
    const result = await editMarked();
    expect(result.notDone).toEqual([]);
    expect(textsOf(asked('places')[0] ?? { texts: [] })).toContain(
      `1. ${crane}\n2. ${otherCrane}`,
    );
    expect(fakeModels.edits).toHaveLength(2);
    expect(fakeModels.edits[1]?.prompt).not.toContain('Change only');
    expect(textsOf(asked('removals')[1] ?? { texts: [] })).toContain(
      `“${kept}”`,
    );
    expect(asked('crops')).toHaveLength(1);
    expect(await shootJson('edits', 'B', 'wish.json')).toEqual({
      wishes: [kept],
    });
    expect(await shootJson('edits', 'B', 'edit.json')).toMatchObject({
      removed: [{ what: otherCrane, box: atOtherCrane }],
    });
  });

  it('brings back nothing from outside the mark', async () => {
    await editWithoutCranes();
    await markCrane('Back, please');
    wantsBack(2);
    const result = await editMarked();
    expect(result.notDone).toHaveLength(1);
    expect(fakeModels.edits).toHaveLength(1);
  });

  it('doesn’t pay twice when it stopped after noting the wishes', async () => {
    await editWithoutCranes();
    await markCrane('Back, please');
    wantsBack(1);
    fakeModels.answers.assessment = () => new Response(null, { status: 400 });
    expect((await editMarked()).failed).toHaveLength(1);
    expect(fakeModels.edits).toHaveLength(2);
    expect(await shootJson('edits', 'B', 'correction', 'wish.json')).toEqual({
      wishes: [kept],
    });
    fakeModels.answers.assessment = { assessments: [assessment(1)] };
    const result = await editMarked();
    expect(result).toMatchObject({ edited: 1, notDone: [], failed: [] });
    expect(fakeModels.edits).toHaveLength(2);
  });

  it('lets a later wish take it out again', async () => {
    await editWithoutCranes();
    wantsBack(1);
    await editLisbon('B', '--wish', 'Bring the crane back');
    fakeModels.answers.places = {
      everywhere: false,
      places: [
        { part: 0, what: 'Remove the crane', isRemoval: true, box: atCrane },
      ],
      back: [],
      replaces: [1],
    };
    fakeModels.answers.choices = {
      places: [{ place: 1, best: 1, notes: 'Clean' }],
    };
    await editLisbon('B', '--wish', 'Remove the crane');
    expect(textsOf(asked('places')[1] ?? { texts: [] })).toContain(
      `1. ${kept}`,
    );
    expect(await shootJson('edits', 'B', 'wish.json')).toEqual({
      wishes: ['Remove the crane'],
    });
    fakeModels.answers.places = {
      everywhere: true,
      places: [],
      back: [],
      replaces: [],
    };
    await editLisbon('B', '--wish', 'Warmer');
    const prompt = fakeModels.edits.at(-1)?.prompt;
    expect(prompt).toContain('this is what I want: Remove the crane. Warmer.');
    expect(prompt).not.toContain('Keep what was taken out');
  });
});
