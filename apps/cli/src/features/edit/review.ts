import { Effect, Schema } from 'effect';
import { coverage } from '../../shared/boxes.ts';
import type { Box, Person, Pick, Sign } from '../../shared/domain.ts';
import { frameOf, rendered, sizeOf } from '../../shared/pictures.ts';
import { type Piece, Vision } from '../../shared/vision.ts';
import { edgesBeyond } from './beyond.ts';

const pictureSide = 1536;
const closeUpSide = 1024;
/** A subject this large is seen well enough in the whole picture. */
const closeUpBelow = 0.4;
const closeUpMargin = 0.25;
const mostFaces = 3;

const role = `You check photos that an image model edited, for the person who took them. They want beautiful photos and like it when the edit improves the light, the colours and an existing sky, calms or blurs the background, removes a small distraction, sharpens what was soft, and invents fine detail such as feathers, fur, leaves or texture. None of that is a fault.

It is a fault when the photo no longer shows the same moment: another subject, pose, expression, number of animals or people, time of day, or weather. It is a fault when the place is no longer the same: the sky, water, trees, walls or buildings are where there were none, or are gone. It is a fault when a person's face, body, hair or clothes look different apart from light and sharpness, so that someone who knows them well would notice. It is a fault when a real text or sign says something else, when something has the wrong anatomy or makes no sense, such as an extra leg or a melted edge, when a person has a halo, a seam or a second edge around them or looks cut out and pasted in, and when the photo looks like a painting or a render, or is garish or overdone.`;

const Assessment = Schema.Struct({
  assessments: Schema.Array(
    Schema.Struct({
      version: Schema.Int,
      sameMoment: Schema.Boolean,
      samePlace: Schema.Boolean,
      /** True when there are no people. */
      peopleUnchanged: Schema.Boolean,
      /** True when there is no text that can be read. */
      textUnchanged: Schema.Boolean,
      withoutErrors: Schema.Boolean,
      looksLikeAPhoto: Schema.Boolean,
      betterThanOriginal: Schema.Boolean,
      beauty: Schema.Int.annotate({ description: 'From 1 to 10' }),
      notes: Schema.String.annotate({
        description:
          'What is wrong with it, or what makes it good, in a sentence',
      }),
    }),
  ),
});
type Version = (typeof Assessment.Type)['assessments'][number];

const question = (count: number) =>
  `Compare ${count === 1 ? 'the version' : `each of the ${count} versions`} with the original. Say for each whether it still shows the same moment, whether it still shows the same place with the same background, whether people and readable text are unchanged (true when there are none), whether it is free of errors, whether it looks like a photo, whether it is better than the original, and how beautiful it is from 1 to 10.`;

/** Whether a version may take the place of the original. */
export const passes = (version: Version): boolean =>
  version.sameMoment &&
  version.samePlace &&
  version.peopleUnchanged &&
  version.textUnchanged &&
  version.withoutErrors &&
  version.looksLikeAPhoto &&
  version.betterThanOriginal;

const withMargin = ({ left, top, right, bottom }: Box): Box => {
  const x = (right - left) * closeUpMargin;
  const y = (bottom - top) * closeUpMargin;
  return {
    left: Math.max(0, left - x),
    top: Math.max(0, top - y),
    right: Math.min(1, right + x),
    bottom: Math.min(1, bottom + y),
  };
};

type Shown = {
  /** What the original shows of the photo. */
  readonly crop: Box;
  readonly subject: Box;
  /** The people and signs of the original, which are in every version. */
  readonly people: ReadonlyArray<Person>;
  readonly signs: ReadonlyArray<Sign>;
};

/** What to know about versions that have the original's signs. */
const aboutSigns = (signs: ReadonlyArray<Sign>): ReadonlyArray<string> =>
  signs.length === 0
    ? []
    : [
        `These signs were put back into every version from the original, pixel by pixel, so they still say what they said, however small or soft they look: ${signs.map(({ text }) => `“${text}”`).join(', ')}. Judge only whether they sit naturally where they are, and whether any other text has changed.`,
      ];

/** What to know about versions that continue the scene. */
const aboutBeyond = (crop: Box): ReadonlyArray<string> => {
  const edges = edgesBeyond(crop);
  return edges === null
    ? []
    : [
        `The plain grey area at the ${edges} of the original is not part of the photo. The edit was asked to fill it by continuing the scene and completing what the edge of the photo cuts off, so that is no fault and changes neither the moment nor the place. It is a fault when grey is left, when a seam shows where the photo ended, when what was completed has the wrong shape or anatomy, and when people, further animals, text or anything else that draws attention was added there.`,
      ];
};

/** A picture, with its subject close up when that is small, and its faces. */
const looks = Effect.fn('looks')(function* (
  name: string,
  file: string,
  { subject, people }: Shown,
) {
  const size = yield* sizeOf(file);
  const area = coverage(subject);
  const faces = people
    .map(({ face }) => face)
    .toSorted((left, right) => coverage(right) - coverage(left))
    .slice(0, mostFaces);
  const closeUps = [
    ...(area > 0 && area < closeUpBelow
      ? [{ what: 'the subject', box: subject }]
      : []),
    ...faces.map((box) => ({ what: 'a face', box })),
  ];
  const pieces = yield* Effect.forEach(closeUps, ({ what, box }) =>
    Effect.gen(function* () {
      const frame = frameOf(withMargin(box), size);
      return [
        `${name}, ${what} close up:`,
        yield* rendered(file, { frame, longSide: closeUpSide }),
      ] satisfies Array<Piece>;
    }),
  );
  return [
    `${name}:`,
    yield* rendered(file, { longSide: pictureSide }),
    ...pieces.flat(),
  ] satisfies Array<Piece>;
});

export type Review = {
  /** The file of the best version, or null when each has a fault. */
  readonly best: string | null;
  readonly notes: string;
};

/** Chooses the best version of an edit. */
export const review = Effect.fn('review')(function* (
  pick: Pick,
  shown: Shown,
  files: {
    readonly original: string;
    readonly versions: ReadonlyArray<string>;
  },
) {
  const vision = yield* Vision;
  const original = yield* looks('The original', files.original, shown);
  const edited = yield* Effect.forEach(files.versions, (file, index) =>
    looks(`Version ${index + 1}`, file, shown),
  );
  const { assessments } = yield* vision.ask({
    role,
    name: 'assessment',
    schema: Assessment,
    pieces: [
      `The photo: ${pick.description}`,
      ...original,
      ...edited.flat(),
      ...aboutSigns(shown.signs),
      ...aboutBeyond(shown.crop),
      question(files.versions.length),
    ],
  });
  const known = assessments
    .filter(({ version }) => files.versions[version - 1] !== undefined)
    .toSorted((left, right) => right.beauty - left.beauty);
  const best = known.find(passes);
  const result: Review = {
    best:
      best === undefined ? null : (files.versions[best.version - 1] ?? null),
    notes: best?.notes ?? known.map(({ notes }) => notes).join(' '),
  };
  return result;
});
