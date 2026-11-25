import { Effect, Option, Schema } from 'effect';
import { type Moment, Rating } from './domain.ts';
import { InvalidInput } from './errors/errors.ts';
import { type OpenShoot, readJson, writeJson } from './store.ts';

const Ratings = Schema.Array(Rating);
const ToRate = Schema.Array(Schema.String);

/** What the owner answers for one moment. */
export const RatingAnswer = Schema.Struct({
  moment: Schema.String,
  best: Schema.NullOr(Schema.String),
  stars: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 5 })),
  further: Schema.Array(Schema.String),
});

/** Whether an answer fits its moment and doesn't contradict itself. */
const isPossible = (
  { best, stars, further }: typeof RatingAnswer.Type,
  { photos }: Moment,
) =>
  best === null
    ? stars === 0 && further.length === 0
    : stars > 0 &&
      new Set([best, ...further]).size === further.length + 1 &&
      [best, ...further].every((photo) => photos.includes(photo));

export const readRatings = Effect.fn('readRatings')(function* (
  open: OpenShoot,
) {
  return Option.getOrElse(
    yield* readJson(Ratings, open.files.ratings),
    (): ReadonlyArray<Rating> => [],
  );
});

/** Asks the owner to rate these moments. */
export const askToRate = (open: OpenShoot, sample: ReadonlyArray<Moment>) =>
  writeJson(
    ToRate,
    open.files.toRate,
    sample.map(({ id }) => id),
  );

/** The moments the owner was asked to rate, if any. */
export const readToRate = Effect.fn('readToRate')(function* (open: OpenShoot) {
  const ids = yield* readJson(ToRate, open.files.toRate);
  return Option.map(ids, (asked) =>
    asked.flatMap(
      (id) => open.moments.find((moment) => moment.id === id) ?? [],
    ),
  );
});

/** Saves an answer, in place of an earlier one about the same moment. */
export const saveRating = Effect.fn('saveRating')(function* (
  open: OpenShoot,
  answer: typeof RatingAnswer.Type,
) {
  const moment = open.moments.find(({ id }) => id === answer.moment);
  if (moment === undefined || !isPossible(answer, moment)) {
    return yield* new InvalidInput({
      message: 'The rating doesn’t fit its moment.',
    });
  }
  const before = yield* readRatings(open);
  yield* writeJson(Ratings, open.files.ratings, [
    ...before.filter(({ moment: id }) => id !== moment.id),
    { ...answer, photos: moment.photos },
  ]);
});
