import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import {
  asked,
  editLisbon,
  pickLisbon,
  setUp,
  tearDown,
} from './command-fixtures.ts';
import { type Asked, assessment, fakeModels } from './fake-models.ts';
import { fakeTools } from './fake-tools.ts';

const chair = 'the grey chair';
const withChair = 'A heron takes off beside a grey chair.';
const withoutChair = 'A heron takes off.';

const describing = ({ texts }: Asked) => ({
  description: texts.some((text) => text.includes(chair))
    ? withoutChair
    : withChair,
});

/** The caption the last finished photo got. */
const caption = () =>
  fakeTools.runs
    .filter(({ command }) => command === 'exiftool')
    .flatMap(({ args }) => args)
    .filter((arg) => arg.startsWith('-XMP-dc:Description='))
    .at(-1)
    ?.slice('-XMP-dc:Description='.length);

const box = { left: 0.1, top: 0.4, right: 0.3, bottom: 0.6 };

beforeEach(() => setUp(spyOn));
afterEach(tearDown);

describe('the caption of a finished photo', () => {
  it('leaves out what the edit removed', async () => {
    await pickLisbon();
    fakeModels.answers.removals = { remove: [{ what: chair, box }] };
    fakeModels.answers.description = describing;
    expect((await editLisbon('B')).edited).toBe(1);
    expect(caption()).toBe(withoutChair);
    expect(asked('description')).toHaveLength(1);
  });

  it('names what was to be removed when the camera’s picture is kept', async () => {
    await pickLisbon();
    fakeModels.answers.removals = { remove: [{ what: chair, box }] };
    fakeModels.answers.description = describing;
    fakeModels.answers.assessment = {
      assessments: [1, 2].map((version) =>
        assessment(version, { samePlace: false }),
      ),
    };
    expect((await editLisbon('B')).keptFromCamera).toHaveLength(1);
    expect(caption()).toBe(withChair);
  });

  it('names what was to be removed and stays on a face', async () => {
    await pickLisbon();
    fakeModels.answers.people = {
      people: [
        {
          face: { left: 0.15, top: 0.32, right: 0.3, bottom: 0.5 },
          outline: [
            { x: 0.12, y: 0.31 },
            { x: 0.31, y: 0.31 },
            { x: 0.31, y: 0.69 },
            { x: 0.12, y: 0.69 },
          ],
        },
      ],
    };
    const sticker = 'the sticker on her cheek';
    fakeModels.answers.removals = {
      remove: [
        {
          what: sticker,
          box: { left: 0.2, top: 0.4, right: 0.25, bottom: 0.45 },
        },
        {
          what: chair,
          box: { left: 0.32, top: 0.55, right: 0.38, bottom: 0.68 },
        },
      ],
    };
    fakeModels.answers.description = ({ texts }: Asked) => ({
      description: `It shows ${[sticker, chair]
        .filter((what) => !texts.some((text) => text.includes(what)))
        .join(' and ')}.`,
    });
    expect((await editLisbon('B')).edited).toBe(1);
    expect(caption()).toBe(`It shows ${sticker}.`);
  });

  it('says what a change to places of a finished photo made', async () => {
    await pickLisbon();
    await editLisbon('B');
    const boat = 'Make the boat red';
    fakeModels.answers.places = {
      everywhere: false,
      bringsBack: false,
      places: [{ part: 0, what: boat, isRemoval: false, box }],
    };
    fakeModels.answers.choices = {
      places: [{ place: 1, best: 1, notes: 'It looks natural' }],
    };
    fakeModels.answers.description = () => ({
      description:
        asked('description').length <= 2
          ? 'A heron flies over a blue boat.'
          : 'A heron flies over a red boat.',
    });
    const result = await editLisbon('B', '--wish', 'A red boat');
    expect(result).toMatchObject({ edited: 1, notDone: [] });
    expect(caption()).toBe('A heron flies over a red boat.');
    // Described for the edit, for the change, and as it is now.
    expect(asked('description')).toHaveLength(3);
  });

  it('asks nothing more when a change only removed something', async () => {
    await pickLisbon();
    await editLisbon('B');
    fakeModels.answers.places = {
      everywhere: false,
      bringsBack: false,
      places: [{ part: 0, what: chair, isRemoval: true, box }],
    };
    fakeModels.answers.choices = {
      places: [{ place: 1, best: 1, notes: 'It looks natural' }],
    };
    fakeModels.answers.description = describing;
    const result = await editLisbon('B', '--wish', 'Remove the chair');
    expect(result).toMatchObject({ edited: 1, notDone: [] });
    expect(caption()).toBe(withoutChair);
    expect(asked('description')).toHaveLength(2);
  });
});
