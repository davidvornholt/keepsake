import { Effect, Layer, Option } from 'effect';
import { Argument, Command } from 'effect/cli';
import { cull as cullShoot } from '../features/cull/cull.ts';
import { edit as editShoot } from '../features/edit/edit.ts';
import { ImageModel } from '../features/edit/image-model.ts';
import { explain as explainShoot } from '../features/explain/explain.ts';
import { markWith } from '../features/light-table/marks.ts';
import { pick as pickShoot } from '../features/pick/pick.ts';
import {
  forgetOutdated,
  publish as publishShoot,
} from '../features/publish/publish.ts';
import { scan } from '../features/scan/scan.ts';
import { InvalidInput, ModelFailed } from '../shared/errors/errors.ts';
import { judgeOf } from '../shared/judge.ts';
import { defaultImageModel, defaultReviewModel } from '../shared/models.ts';
import { askReviewer, ReviewVision } from '../shared/review-vision.ts';
import { Spending } from '../shared/spending.ts';
import { openShoot } from '../shared/store.ts';
import { Vision } from '../shared/vision.ts';
import { workOn } from '../shared/work.ts';
import {
  bounded,
  fail,
  flag,
  optionalInt,
  optionalNumber,
  optionalString,
  shootArgument,
  visionModel,
} from './command-inputs.ts';
import { emit, emitWithCost } from './output.ts';
import { folderArgument, scanFlags } from './shoot-commands.ts';

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

const pickFlags = {
  minimum: optionalInt(
    'minimum-score',
    `Pick photos from this score on, 1 to 10 (default ${defaultMinimum})`,
  ),
  maximum: optionalInt('maximum', 'Pick at most this many, the best ones'),
};

const pickInput = (flags: {
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

const editFlags = {
  budget: optionalNumber(
    'budget',
    `Start no more photos when the edits have cost this many dollars (default ${defaultBudget})`,
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
const reviewLayer = (asked: Option.Option<string>) =>
  ReviewVision.layer(Option.getOrElse(asked, () => defaultReviewModel));

const editInput = (flags: {
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

/** The photos to edit, and what is wanted of them and where. */
const whatToEdit = Effect.fn('whatToEdit')(function* (
  shoot: string,
  asked: {
    readonly photos: ReadonlyArray<string>;
    readonly wish: Option.Option<string>;
    readonly mark: Option.Option<string>;
  },
) {
  const { photos, mark } = asked;
  const own = Option.getOrNull(asked.wish);
  if (Option.isNone(mark)) {
    if (own !== null && photos.length === 0) {
      return yield* new InvalidInput({
        message: 'Name the photos the wish is for.',
      });
    }
    return { photos, wish: own, areas: [] };
  }
  if (photos.length > 0) {
    return yield* new InvalidInput({
      message: 'Name no photos with --mark, which is about one already.',
    });
  }
  const { files } = yield* openShoot(shoot);
  const { photo, note, boxes } = yield* markWith(files, mark.value);
  const wish = own ?? (note === '' ? null : note);
  if (wish === null && boxes.length > 0) {
    return yield* new InvalidInput({
      message: `The mark ${mark.value} has no note. Say with --wish what to do at the places it marks.`,
    });
  }
  return { photos: [photo], wish, areas: boxes };
});

/** The models that edit and that look after the edits. */
const editLayer = (flags: {
  readonly imageModel: Option.Option<string>;
  readonly reviewModel: Option.Option<string>;
}) =>
  Layer.merge(
    ImageModel.layer(
      Option.getOrElse(flags.imageModel, () => defaultImageModel),
    ),
    reviewLayer(flags.reviewModel),
  );

/** Runs steps with the vision model asked for, or the shoot's own. */
const withVision =
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
      const asked = yield* whatToEdit(shoot, { photos, wish, mark });
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

const albumFlag = optionalString(
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
        Effect.tap(emit),
        // Only what was printed is told, so only that is forgotten.
        Effect.flatMap(({ outdated }) => forgetOutdated(open, outdated)),
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

/** How many of the moments may be missing before the choice means nothing. */
const mostMissing = 0.05;

/** Stops when a model couldn't judge many moments, such as at its limit. */
const checkCulled = ({
  moments,
  failed,
}: {
  readonly moments: number;
  readonly failed: ReadonlyArray<{ readonly reason: string }>;
}) =>
  failed.length > moments * mostMissing
    ? Effect.fail(
        new ModelFailed({
          message: `${failed.length} of ${moments} moments couldn’t be judged. The first problem: ${failed[0]?.reason}`,
        }),
      )
    : Effect.void;

export const run = Command.make(
  'run',
  {
    folder: folderArgument,
    ...scanFlags,
    model: visionModel,
    ...pickFlags,
    unedited: flag(
      'unedited',
      'Stop before the edits, which cost money, for the owner to look over the choice first',
    ),
    ...editFlags,
    publish: flag('publish', 'Also upload the finished photos to Immich'),
    album: albumFlag,
  },
  (flags) =>
    Effect.gen(function* () {
      const picking = yield* pickInput(flags);
      const editing = yield* editInput(flags);
      if (flags.unedited && flags.publish) {
        return yield* fail('Give either --unedited or --publish.');
      }
      const scanned = yield* scan(flags);
      const { shoot } = scanned;
      yield* Effect.gen(function* () {
        const culled = yield* workOn(shoot, (open) => cullShoot(open, false));
        yield* checkCulled(culled);
        const picked = yield* workOn(shoot, (open) =>
          pickShoot(open, { ...picking, again: false }),
        );
        const edited = flags.unedited
          ? null
          : yield* workOn(shoot, (open) =>
              editShoot(open, [], {
                ...editing,
                again: false,
                wish: null,
                areas: [],
              }),
            );
        const published = flags.publish
          ? yield* workOn(shoot, (open) => publishShoot(open, [], flags.album))
          : null;
        const explained = yield* workOn(shoot, (open) =>
          askReviewer(explainShoot(open, false)),
        );
        yield* emitWithCost({
          scanned,
          culled,
          picked,
          edited,
          published,
          explained,
        });
        if (published !== null) {
          yield* workOn(shoot, (open) =>
            forgetOutdated(open, published.outdated),
          );
        }
      }).pipe(Effect.provide(editLayer(flags)), withVision(shoot, flags.model));
    }).pipe(Effect.provide(Spending.layer)),
).pipe(
  Command.withDescription(
    'Do everything with a folder of photos: scan, cull, pick and edit, publish if asked, and explain why the other photos were left out. Running it again goes on where it stopped.',
  ),
);
