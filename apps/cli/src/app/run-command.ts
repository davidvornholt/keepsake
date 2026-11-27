import { Effect, Option } from 'effect';
import { Command } from 'effect/cli';
import { cull as cullShoot, judgedTooFew } from '../features/cull/cull.ts';
import { checkPrices, edit as editShoot } from '../features/edit/edit.ts';
import { ImageModel, imageModelAccess } from '../features/edit/image-model.ts';
import { explain as explainShoot } from '../features/explain/explain.ts';
import { pick as pickShoot } from '../features/pick/pick.ts';
import {
  publish as publishShoot,
  tellOutdated,
} from '../features/publish/publish.ts';
import { checkTitled } from '../features/publish/target.ts';
import { scan } from '../features/scan/scan.ts';
import { ModelFailed } from '../shared/errors/errors.ts';
import { askReviewer } from '../shared/review-vision.ts';
import { Spending } from '../shared/spending.ts';
import { workOn } from '../shared/work.ts';
import { fail, flag, visionModel } from './command-inputs.ts';
import { emitWithCost } from './output.ts';
import { folderArgument, scanFlags } from './shoot-commands.ts';
import {
  editFlags,
  editInput,
  imageModelOf,
  pickFlags,
  pickInput,
  reviewLayer,
  withVision,
} from './step-commands.ts';

/** Stops when a model couldn't judge many moments, such as at its limit. */
const checkCulled = ({
  moments,
  failed,
}: {
  readonly moments: number;
  readonly failed: ReadonlyArray<{ readonly reason: string }>;
}) =>
  judgedTooFew(moments, failed.length)
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
    publish: flag(
      'publish',
      'Also upload the finished photos to Immich, to the album published to before, or else to a new album named after --title',
    ),
  },
  (flags) =>
    Effect.gen(function* () {
      const picking = yield* pickInput(flags);
      const editing = yield* editInput(flags);
      if (flags.unedited && flags.publish) {
        return yield* fail('Give either --unedited or --publish.');
      }
      const imageModel = imageModelOf(flags.imageModel);
      if (!flags.unedited) {
        // Stops before the cull, which may cost money, when it couldn't edit.
        yield* imageModelAccess(imageModel);
      }
      const scanned = yield* scan(flags);
      const { shoot } = scanned;
      yield* Effect.gen(function* () {
        if (flags.publish) {
          // Before the cull and the edits, which may cost money.
          yield* workOn(shoot, checkTitled);
        }
        if (!flags.unedited) {
          yield* checkPrices(imageModel);
        }
        const culled = yield* workOn(shoot, (open) => cullShoot(open, false));
        yield* checkCulled(culled);
        const picked = yield* workOn(shoot, (open) =>
          pickShoot(open, { ...picking, again: false }),
        );
        // Only the edits need the image model, so --unedited needs no key.
        const edited = flags.unedited
          ? null
          : yield* workOn(shoot, (open) =>
              editShoot(open, [], {
                ...editing,
                again: false,
                wish: null,
                areas: [],
              }),
            ).pipe(Effect.provide(ImageModel.layer(imageModel)));
        const published = flags.publish
          ? yield* workOn(shoot, (open) =>
              publishShoot(open, [], Option.none()),
            )
          : null;
        const explained = yield* workOn(shoot, (open) =>
          askReviewer(explainShoot(open, false)),
        );
        const tell = (outdated: ReadonlyArray<string>) =>
          emitWithCost({
            scanned,
            culled,
            picked,
            edited,
            published: published && { ...published, outdated },
            explained,
          });
        // The lock was let go after publishing, so another publish may have
        // brought a replaced upload back; it is held again until it told.
        yield* published === null
          ? tell([])
          : workOn(shoot, (open) =>
              tellOutdated(open, published.outdated, tell),
            );
      }).pipe(
        Effect.provide(reviewLayer(flags.reviewModel)),
        withVision(shoot, flags.model),
      );
    }).pipe(Effect.provide(Spending.layer)),
).pipe(
  Command.withDescription(
    'Do everything with a folder of photos: scan, cull, pick and edit, publish if asked, and explain why the other photos were left out. Running it again goes on where it stopped.',
  ),
);
