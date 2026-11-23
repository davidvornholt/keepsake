import { Effect, Schema } from 'effect';
import { coverage } from '../../shared/boxes.ts';
import type { Box, Crop, Pick } from '../../shared/domain.ts';
import { frameOf, rendered, sizeOf } from '../../shared/pictures.ts';
import { type Piece, Vision } from '../../shared/vision.ts';

const pictureSide = 1536;
const closeUpSide = 1024;
/** A subject this large is seen well enough in the whole picture. */
const closeUpBelow = 0.4;
const closeUpMargin = 0.25;

const role = `You check photos that an image model edited, for the person who took them. They want beautiful photos and like it when the edit improves the light, the colours and an existing sky, calms or blurs the background, removes a small distraction, sharpens what was soft, and invents fine detail such as feathers, fur, leaves or texture. None of that is a fault.

It is a fault when the photo no longer shows the same moment: another subject, pose, expression, number of animals or people, time of day, or weather. It is a fault when the place is no longer the same: the sky, water, trees, walls or buildings are where there were none, or are gone. It is a fault when a person's face, body, hair or clothes look different apart from light and sharpness, so that someone who knows them well would notice. It is a fault when a real text or sign says something else, when something has the wrong anatomy or makes no sense, such as an extra leg or a melted edge, and when the photo looks like a painting or a render, or is garish or overdone.`;

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

/** A picture, with its subject close up when that is small, and its faces. */
const looks = Effect.fn('looks')(function* (
  name: string,
  file: string,
  crop: Crop,
) {
  const size = yield* sizeOf(file);
  const area = coverage(crop.subject);
  const closeUps = [
    ...(area > 0 && area < closeUpBelow
      ? [{ what: 'the subject', box: crop.subject }]
      : []),
    ...crop.faces.map((box) => ({ what: 'a face', box })),
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
  crop: Crop,
  files: {
    readonly original: string;
    readonly versions: ReadonlyArray<string>;
  },
) {
  const vision = yield* Vision;
  const original = yield* looks('The original', files.original, crop);
  const edited = yield* Effect.forEach(files.versions, (file, index) =>
    looks(`Version ${index + 1}`, file, crop),
  );
  const { assessments } = yield* vision.ask({
    role,
    name: 'assessment',
    schema: Assessment,
    pieces: [
      `The photo: ${pick.description}`,
      ...original,
      ...edited.flat(),
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
