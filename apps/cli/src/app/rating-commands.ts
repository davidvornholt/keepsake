import { Effect, Option } from 'effect';
import { Command, Flag } from 'effect/cli';
import { compareWithOwner } from '../features/benchmark/benchmark.ts';
import { judgeMoments } from '../features/cull/cull.ts';
import { disputedBetween } from '../features/rating/disputed.ts';
import { sampleOf } from '../features/rating/sample.ts';
import { ratingLink } from '../shared/address.ts';
import { StepMissing } from '../shared/errors/errors.ts';
import { judgeOf } from '../shared/judge.ts';
import { askToRate, readRatings } from '../shared/ratings.ts';
import { Spending } from '../shared/spending.ts';
import { type OpenShoot, openShoot } from '../shared/store.ts';
import { verdicts } from '../shared/verdicts.ts';
import { Vision } from '../shared/vision.ts';
import { workOn } from '../shared/work.ts';
import {
  bounded,
  fail,
  flag,
  optionalInt,
  shootArgument,
  visionModel,
} from './command-inputs.ts';
import { emit, emitWithCost } from './output.ts';

const defaultSample = 60;
const mostMoments = 1000;
/** What a model that is to be compared thinks of the shoot. */
const verdictsToCompare = Effect.fn('verdictsToCompare')(function* (
  open: OpenShoot,
  model: string,
) {
  const judged = yield* verdicts(open, model);
  if (judged.length === 0) {
    const { name } = open.shoot;
    return yield* new StepMissing({
      message: `${model} has judged no photos of ${name} yet. Run \`keepsake cull ${name} --model ${model}\` first.`,
    });
  }
  return judged;
});

/** The moments to rate: a mix, or those two models judged differently. */
const momentsToRate = Effect.fn('momentsToRate')(function* (
  open: OpenShoot,
  model: Option.Option<string>,
  between: ReadonlyArray<string>,
  count: number,
) {
  const [left, right, ...more] = between;
  if (left === undefined) {
    const judged = yield* verdicts(open, yield* judgeOf(open, model));
    return sampleOf(open.moments, judged, count);
  }
  if (right === undefined || more.length > 0) {
    return yield* fail('Give --between two times, once for each model.');
  }
  return disputedBetween(
    open.moments,
    [
      yield* verdictsToCompare(open, left),
      yield* verdictsToCompare(open, right),
    ],
    count,
  );
});

export const rate = Command.make(
  'rate',
  {
    shoot: shootArgument,
    moments: optionalInt(
      'moments',
      `How many moments to rate (default ${defaultSample})`,
    ),
    model: visionModel,
    between: Flag.String('between').pipe(
      Flag.withDescription(
        'Ask about the moments that two models judged most differently, instead of a mix. Give it two times, once for each model.',
      ),
      Flag.atLeast(0),
    ),
  },
  ({ shoot, moments, model, between }) =>
    Effect.gen(function* () {
      const count = yield* bounded('moments', moments, {
        fallback: defaultSample,
        min: 1,
        max: mostMoments,
      });
      const open = yield* openShoot(shoot);
      const sample = yield* momentsToRate(open, model, between, count);
      yield* askToRate(open, sample);
      const rated = new Set(
        (yield* readRatings(open)).map(({ moment }) => moment),
      );
      yield* emit({
        shoot,
        link: yield* ratingLink(shoot),
        moments: sample.length,
        rated: sample.filter(({ id }) => rated.has(id)).length,
      });
    }),
).pipe(
  Command.withDescription(
    'Ask the owner on the page to choose the best photo of some moments, give it stars and say which others are worth keeping, without seeing what a model thinks.',
  ),
);

export const bench = Command.make(
  'bench',
  {
    shoot: shootArgument,
    models: Flag.String('model').pipe(
      Flag.withDescription(
        'A vision model to measure, with its provider (default: the one that judged the shoot). Repeat it to compare several.',
      ),
      Flag.atLeast(0),
    ),
    again: flag('again', 'Ask about every rated moment again'),
  },
  ({ shoot, models, again }) =>
    workOn(shoot, (open) =>
      Effect.gen(function* () {
        const ratings = yield* readRatings(open);
        // The moments as they were rated, also when a later scan grouped the
        // photos differently.
        const moments = ratings.map(({ moment, photos }) => ({
          id: moment,
          photos,
        }));
        if (moments.length === 0) {
          return yield* new StepMissing({
            message: `No moment of ${shoot} is rated yet. Run \`keepsake rate ${shoot}\` first.`,
          });
        }
        const results = yield* Effect.forEach(
          models.length === 0 ? [yield* judgeOf(open, Option.none())] : models,
          (model) =>
            Effect.gen(function* () {
              const { verdicts: judged, failed } = yield* judgeMoments(
                open,
                moments,
                again,
              ).pipe(Effect.provide(Vision.layer(model)));
              return { model, ...compareWithOwner(judged, ratings), failed };
            }),
        );
        return { shoot, results };
      }),
    ).pipe(Effect.flatMap(emitWithCost), Effect.provide(Spending.layer)),
).pipe(
  Command.withDescription(
    'Measure how well vision models agree with the ratings: whether they find the best frame of a burst, and whether they score what the owner would keep above the rest',
  ),
);
