import { Effect, Layer, Option } from 'effect';
import { Argument, Command } from 'effect/cli';
import { cull as cullShoot } from '../features/cull/cull.ts';
import { edit as editShoot } from '../features/edit/edit.ts';
import { ImageModel } from '../features/edit/image-model.ts';
import { explain as explainShoot } from '../features/explain/explain.ts';
import { pick as pickShoot } from '../features/pick/pick.ts';
import {
  publish as publishShoot,
  tellOutdated,
} from '../features/publish/publish.ts';
import { judgeOf } from '../shared/judge.ts';
import { defaultImageModel, defaultReviewModel } from '../shared/models.ts';
import { askReviewer, ReviewVision } from '../shared/review-vision.ts';
import { Spending } from '../shared/spending.ts';
import { openShoot } from '../shared/store.ts';
import { Vision } from '../shared/vision.ts';
import { workOn } from '../shared/work.ts';
import {
  bounded,
  flag,
  optionalInt,
  optionalNumber,
  optionalString,
  shootArgument,
  visionModel,
} from './command-inputs.ts';
import { emit, emitWithCost } from './output.ts';
import { whatToEdit } from './what-to-edit.ts';

const lowestScore = 1;
const highestScore = 10;
const defaultMinimum = 7;
const mostPicks = 10_000;
const defaultBudget = 25;
const mostDollars = 10_000;
const defaultVersions = 2;
const mostVersions = 4;

const again = flag('again', 'Start over instead of keeping what is done');

const photosArgument = (description: string) =>
  Argument.String('photo').pipe(
    Argument.withDescription(description),
    Argument.variadic(),
  );

export const pickFlags = {
  minimum: optionalInt(
    'minimum-score',
    `Pick photos from this score on, 1 to 10 (default ${defaultMinimum})`,
  ),
  maximum: optionalInt('maximum', 'Pick at most this many, the best ones'),
};

export const pickInput = (flags: {
  readonly minimum: Option.Option<number>;
  readonly maximum: Option.Option<number>;
}) =>
  Effect.gen(function* () {
    return {
      minimumScore: yield* bounded('minimum-score', flags.minimum, {
        fallback: defaultMinimum,
        min: lowestScore,
        max: highestScore,
      }),
      maximum: Option.isSome(flags.maximum)
        ? Option.some(
            yield* bounded('maximum', flags.maximum, {
              fallback: mostPicks,
              min: 1,
              max: mostPicks,
            }),
          )
        : Option.none<number>(),
    };
  });

export const editFlags = {
  budget: optionalNumber(
    'budget',
    `Spend at most this many dollars on the edits: a paid request is sent only when what is left covers the most it can cost (default ${defaultBudget})`,
  ),
  versions: optionalInt(
    'versions',
    `How many versions of a photo to make and choose from, 1 to ${mostVersions} (default ${defaultVersions})`,
  ),
  imageModel: optionalString(
    'image-model',
    `The image model, with its provider (default ${defaultImageModel})`,
  ),
  reviewModel: optionalString(
    'review-model',
    `The vision model that describes the photos, marks people and signs in them and reviews the edits, with its provider (default ${defaultReviewModel})`,
  ),
};

/** The model that looks after the edits and explains the choice. */
export const reviewLayer = (asked: Option.Option<string>) =>
  ReviewVision.layer(Option.getOrElse(asked, () => defaultReviewModel));

export const editInput = (flags: {
  readonly budget: Option.Option<number>;
  readonly versions: Option.Option<number>;
}) =>
  Effect.gen(function* () {
    return {
      budget: yield* bounded('budget', flags.budget, {
        fallback: defaultBudget,
        min: 0,
        max: mostDollars,
      }),
      versions: yield* bounded('versions', flags.versions, {
        fallback: defaultVersions,
        min: 1,
        max: mostVersions,
      }),
    };
  });

export const imageModelOf = (asked: Option.Option<string>) =>
  Option.getOrElse(asked, () => defaultImageModel);

/** The models that edit and that look after the edits. */
const editLayer = (flags: {
  readonly imageModel: Option.Option<string>;
  readonly reviewModel: Option.Option<string>;
}) =>
  Layer.merge(
    ImageModel.layer(imageModelOf(flags.imageModel)),
    reviewLayer(flags.reviewModel),
  );

/** Runs steps with the vision model asked for, or the shoot's own. */
export const withVision =
  (shoot: string, asked: Option.Option<string>) =>
  <A, E, R>(steps: Effect.Effect<A, E, R>) =>
    Effect.gen(function* () {
      const model = yield* judgeOf(yield* openShoot(shoot), asked);
      return yield* steps.pipe(Effect.provide(Vision.layer(model)));
    });

export const cull = Command.make(
  'cull',
  { shoot: shootArgument, model: visionModel, again },
  ({ shoot, model, again: startOver }) =>
    workOn(shoot, (open) => cullShoot(open, startOver)).pipe(
      Effect.flatMap(emitWithCost),
      withVision(shoot, model),
      Effect.provide(Spending.layer),
    ),
).pipe(
  Command.withDescription(
    'Let a vision model find the best frames of every moment and score them. Moments it has judged before are kept.',
  ),
);

export const pick = Command.make(
  'pick',
  { shoot: shootArgument, model: visionModel, ...pickFlags, again },
  ({ shoot, model, again: startOver, ...flags }) =>
    Effect.gen(function* () {
      const input = yield* pickInput(flags);
      yield* workOn(shoot, (open) =>
        pickShoot(open, { ...input, again: startOver }),
      ).pipe(Effect.flatMap(emitWithCost), withVision(shoot, model));
    }).pipe(Effect.provide(Spending.layer)),
).pipe(
  Command.withDescription(
    'Choose the photos worth editing: those with a high score, without repeats of the same subject',
  ),
);

export const edit = Command.make(
  'edit',
  {
    shoot: shootArgument,
    photos: photosArgument('Photos to edit instead of the picked ones'),
    model: visionModel,
    ...editFlags,
    wish: optionalString(
      'wish',
      'What you want to be done with the named photos, such as what to remove. Changes only the places of a finished photo that it is about, or edits all of it anew in the frame it has; with --again, the frame follows it too',
    ),
    mark: optionalString(
      'mark',
      'Edit the photo that a mark of the owner is about, with its note as the wish and at the places it marks. `keepsake marks` lists the marks.',
    ),
    again,
  },
  ({ shoot, photos, model, wish, mark, again: startOver, ...flags }) =>
    Effect.gen(function* () {
      const input = yield* editInput(flags);
      const asked = yield* whatToEdit(shoot, {
        photos,
        wish,
        mark,
        again: startOver,
        budget: flags.budget,
      });
      yield* workOn(shoot, (open) =>
        editShoot(open, asked.photos, {
          ...input,
          again: startOver,
          wish: asked.wish,
          areas: asked.areas,
        }),
      ).pipe(
        Effect.flatMap(emitWithCost),
        Effect.provide(editLayer(flags)),
        withVision(shoot, model),
      );
    }).pipe(Effect.provide(Spending.layer)),
).pipe(
  Command.withDescription(
    'Crop the picked photos, edit them with an image model, and keep the version that passes a review, or the camera’s own picture when none does. Photos edited before are kept. `--model` is the one that crops.',
  ),
);

export const albumFlag = optionalString(
  'album',
  'The name of the album (default: the one published to before, or what the shoot is about, or its name)',
);

export const publish = Command.make(
  'publish',
  {
    shoot: shootArgument,
    photos: photosArgument('Photos to publish instead of the picked ones'),
    album: albumFlag,
  },
  ({ shoot, photos, album }) =>
    workOn(shoot, (open) =>
      publishShoot(open, photos, album).pipe(
        Effect.flatMap((published) =>
          tellOutdated(open, published.outdated, (outdated) =>
            emit({ ...published, outdated }),
          ),
        ),
      ),
    ).pipe(Effect.provide(Spending.layer)),
).pipe(
  Command.withDescription(
    'Upload the finished photos to an album in Immich with the photos command, each stacked on top of the camera’s own picture. Photos published before are not sent again.',
  ),
);

export const explain = Command.make(
  'explain',
  {
    shoot: shootArgument,
    reviewModel: optionalString(
      'review-model',
      `The vision model that explains, with its provider (default ${defaultReviewModel})`,
    ),
    again,
  },
  ({ shoot, reviewModel, again: startOver }) =>
    workOn(shoot, (open) => askReviewer(explainShoot(open, startOver))).pipe(
      Effect.flatMap(emitWithCost),
      Effect.provide(reviewLayer(reviewModel)),
      Effect.provide(Spending.layer),
    ),
).pipe(
  Command.withDescription(
    'Let a vision model say of every photo that isn’t in the album why that is: what speaks against it, or what the photo that shows the same does better. Photos it has explained before are kept unless the album has changed.',
  ),
);
