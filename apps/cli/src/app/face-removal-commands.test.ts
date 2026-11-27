import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import {
  editLisbon,
  pickLisbon,
  setUp,
  shootFile,
  tearDown,
} from './command-fixtures.ts';
import { fakeModels } from './fake-models.ts';

beforeEach(() => setUp(spyOn));
afterEach(tearDown);

const marked = { left: 0.1, top: 0.3, right: 0.4, bottom: 0.7 };
const face = { left: 0.15, top: 0.32, right: 0.3, bottom: 0.5 };
const sticker = 'the sticker on her cheek';
const onCheek = { left: 0.2, top: 0.4, right: 0.25, bottom: 0.45 };
const chair = 'the chair beside her';
const beside = { left: 0.32, top: 0.55, right: 0.38, bottom: 0.68 };

/** A woman with a sticker on her cheek, which keepsake keeps with her face. */
const herWithSticker = () => {
  fakeModels.answers.people = {
    people: [
      {
        face,
        outline: [
          { x: 0.12, y: 0.31 },
          { x: 0.31, y: 0.31 },
          { x: 0.31, y: 0.69 },
          { x: 0.12, y: 0.69 },
        ],
      },
    ],
  };
};

const isAboutSticker = (what: string) => what.includes(sticker);

/** What a command says wasn't done. */
const notDoneIn = (result: {
  readonly notDone: ReadonlyArray<{ readonly what: string }>;
}) => result.notDone.map(({ what }) => what);

describe('keepsake edit, removing what is on a face', () => {
  it('says that a change leaves it on the face', async () => {
    await pickLisbon();
    await editLisbon('B');
    await Bun.write(
      shootFile('marks', 'one.json'),
      JSON.stringify({
        id: 'one',
        photo: 'B',
        note: 'Remove the sticker and the chair',
        boxes: [marked],
        madeAt: '2026-04-01T10:00:00Z',
        handedOverAt: '2026-04-01T11:00:00Z',
        answer: null,
        seenAt: null,
      }),
    );
    herWithSticker();
    fakeModels.answers.places = {
      everywhere: false,
      back: [],
      places: [
        { part: 0, what: sticker, isRemoval: true, box: onCheek },
        { part: 0, what: chair, isRemoval: true, box: beside },
      ],
    };
    // The reviewer takes the version at every place it is shown.
    fakeModels.answers.choices = ({ texts }) => ({
      places: texts.some((text) => text.includes(sticker))
        ? [
            { place: 1, best: 1, notes: 'Clean' },
            { place: 2, best: 1, notes: 'Clean' },
          ]
        : [{ place: 1, best: 1, notes: 'Clean' }],
    });
    const result = await editLisbon('--mark', 'one', '--budget', '5');
    expect(result.edited).toBe(1);
    const notDone = notDoneIn(result);
    expect(notDone).toHaveLength(1);
    expect(notDone.every(isAboutSticker)).toBe(true);
    expect(notDone[0]).toContain('face');
    expect(fakeModels.edits.at(-1)?.prompt).not.toContain(sticker);
  });

  it('says that an edit leaves it on the face', async () => {
    await pickLisbon();
    herWithSticker();
    fakeModels.answers.removals = {
      remove: [{ what: sticker, box: onCheek }],
    };
    const result = await editLisbon('B', '--wish', 'Remove the sticker');
    expect(result.edited).toBe(1);
    const notDone = notDoneIn(result);
    expect(notDone).toHaveLength(1);
    expect(notDone.every(isAboutSticker)).toBe(true);
    expect(notDone[0]).toContain('face');
  });
});
