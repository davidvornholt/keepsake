import { Effect, Option } from 'effect';
import { Command, Flag } from 'effect/cli';
import { compareWithOwner } from '../features/benchmark/benchmark.ts';
import { judgeMoments } from '../features/cull/cull.ts';
import { sampleOf } from '../features/rating/sample.ts';
import { readRatings, serveRatingPage } from '../features/rating/server.ts';
import { StepMissing } from '../shared/errors/errors.ts';
import { judgeOf } from '../shared/judge.ts';
import { Spending } from '../shared/spending.ts';
import { openShoot } from '../shared/store.ts';
import { verdicts } from '../shared/verdicts.ts';
import { Vision } from '../shared/vision.ts';
import { workOn } from '../shared/work.ts';
import {
  bounded,
  fail,
  flag,
  optionalInt,
  optionalString,
  shootArgument,
  visionModel,
} from './command-inputs.ts';
import { emit, emitWithCost } from './output.ts';

const defaultSample = 60;
const mostMoments = 1000;
const highestPort = 65_535;
const webProtocols = new Set(['http:', 'https:']);

const webAddress = (text: string) =>
  Effect.try({
    try: () => new URL(text),
    catch: () => undefined,
  }).pipe(
    Effect.filterOrFail(({ protocol }) => webProtocols.has(protocol)),
    Effect.catch(() =>
      fail(
        `${JSON.stringify(text)} is not an address of a web page. Write it with https://.`,
      ),
    ),
  );

export const rate = Command.make(
  'rate',
  {
    shoot: shootArgument,
    moments: optionalInt(
      'moments',
      `How many moments to rate (default ${defaultSample})`,
    ),
    model: visionModel,
    port: optionalInt('port', 'The port of the page (default: any free one)'),
    address: optionalString(
      'address',
      'Where the page is reached from another machine, when something on this one passes it on to the port, such as https://server.example.ts.net:8443',
    ),
  },
  ({ shoot, moments, model, port, address }) =>
    Effect.gen(function* () {
      const count = yield* bounded('moments', moments, {
        fallback: defaultSample,
        min: 1,
        max: mostMoments,
      });
      const chosenPort = yield* bounded('port', port, {
        fallback: 0,
        min: 0,
        max: highestPort,
      });
      const elsewhere = Option.getOrUndefined(address);
      const reachedAt =
        elsewhere === undefined ? undefined : yield* webAddress(elsewhere);
      const open = yield* openShoot(shoot);
      const judged = yield* verdicts(open, yield* judgeOf(open, model));
      const sample = sampleOf(open.moments, judged, count);
      const server = yield* serveRatingPage({
        open,
        sample,
        port: chosenPort,
        address: reachedAt,
      });
      const rated = new Set(
        (yield* readRatings(open)).map(({ moment }) => moment),
      );
      yield* emit({
        shoot,
        url: reachedAt?.href ?? `http://127.0.0.1:${server.port}/`,
        moments: sample.length,
        rated: sample.filter(({ id }) => rated.has(id)).length,
      });
      return yield* Effect.never;
    }).pipe(Effect.scoped),
).pipe(
  Command.withDescription(
    'Serve a page on this machine where the owner of the photos chooses the best photo of each moment and gives it stars, without seeing what a model thinks. Runs until it is stopped; every rating is saved right away.',
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
        const rated = new Set(ratings.map(({ moment }) => moment));
        const moments = open.moments.filter(({ id }) => rated.has(id));
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
