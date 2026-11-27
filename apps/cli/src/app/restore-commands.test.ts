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
import { fakeModels } from './fake-models.ts';

beforeEach(() => setUp(spyOn));
afterEach(tearDown);

const crane = 'the yellow crane behind the church';
const otherCrane = 'the red crane by the river';
const atCrane = { left: 0.1, top: 0.3, right: 0.4, bottom: 0.7 };
const atOtherCrane = { left: 0.6, top: 0.2, right: 0.9, bottom: 0.5 };
const note = 'Bring the yellow crane back';

const textsOf = (question: { readonly texts: ReadonlyArray<string> }) =>
  question.texts.join(' ');

/** keepsake takes both cranes out of B, unless it is told to keep one. */
const editWithoutCranes = async () => {
  await pickLisbon();
  fakeModels.answers.removals = ({ texts }) => ({
    remove: [
      ...(texts.join(' ').includes(note)
        ? []
        : [{ what: crane, box: atCrane }]),
      { what: otherCrane, box: atOtherCrane },
    ],
  });
  await editLisbon('B');
};

/** The owner marked a place of B with a note and handed it over. */
const mark = (text: string, box: object) =>
  Bun.write(
    shootFile('marks', 'one.json'),
    JSON.stringify({
      id: 'one',
      photo: 'B',
      note: text,
      boxes: [box],
      madeAt: '2026-04-01T10:00:00Z',
      handedOverAt: '2026-04-01T11:00:00Z',
      answer: null,
      seenAt: null,
    }),
  );

const bringsBack = () => {
  fakeModels.answers.places = {
    everywhere: false,
    bringsBack: true,
    places: [],
  };
};

const editMarked = () => editLisbon('--mark', 'one', '--budget', '5');

describe('keepsake edit, bringing back what it took out', () => {
  it.each([
    { box: atCrane, meant: crane, other: otherCrane },
    { box: atOtherCrane, meant: otherCrane, other: crane },
  ])(
    'names what is in the mark for that edit only: $meant',
    async ({ box, meant, other }) => {
      await editWithoutCranes();
      await mark('Bring this back', box);
      bringsBack();
      await editMarked();
      const wish = textsOf(asked('removals')[1] ?? { texts: [] });
      expect(wish).toContain(
        `“Bring this back. What they marked to come back: ${meant}.”`,
      );
      expect(wish).not.toContain(`back: ${other}`);
      expect(fakeModels.edits[1]?.prompt).toContain(`come back: ${meant}.`);
      expect(await shootJson('edits', 'B', 'wish.json')).toEqual({
        wish: 'Bring this back',
      });
    },
  );

  it('edits the photo anew from the camera’s, also for a mark', async () => {
    await editWithoutCranes();
    await mark(note, atCrane);
    bringsBack();
    const result = await editMarked();
    expect(result.notDone).toEqual([]);
    expect(textsOf(asked('places')[0] ?? { texts: [] })).toContain(
      `- ${crane}\n- ${otherCrane}`,
    );
    expect(fakeModels.edits).toHaveLength(2);
    expect(fakeModels.edits[1]?.prompt).not.toContain('Change only');
    expect(textsOf(asked('removals')[1] ?? { texts: [] })).toContain(
      `“${note}. What they marked to come back: ${crane}.”`,
    );
    expect(asked('crops')).toHaveLength(1);
    expect(await shootJson('edits', 'B', 'wish.json')).toEqual({ wish: note });
    expect(await shootJson('edits', 'B', 'edit.json')).toMatchObject({
      removed: [{ what: otherCrane, box: atOtherCrane }],
    });
  });
});
