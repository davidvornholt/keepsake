import { Context, Effect, Layer } from 'effect';
import { Vision, type VisionModel } from './vision.ts';

/**
 * The model that looks after an edit: it describes the photo, marks people and
 * signs, and reviews what the image model made.
 */
export class ReviewVision extends Context.Service<ReviewVision, VisionModel>()(
  '@keepsake/cli/shared/ReviewVision',
) {
  static readonly layer = (model: string) =>
    Layer.effect(
      ReviewVision,
      Effect.gen(function* () {
        return ReviewVision.of(yield* Vision);
      }),
    ).pipe(Layer.provide(Vision.layer(model)));
}

/** Has the model that looks after the edit answer a step's questions. */
export const askReviewer = <A, E, R>(step: Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const reviewer = yield* ReviewVision;
    return yield* Effect.provideService(step, Vision, Vision.of(reviewer));
  });
