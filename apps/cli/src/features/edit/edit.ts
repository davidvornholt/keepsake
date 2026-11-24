import { Effect, Option, Ref } from 'effect';
import type { EditRecord, Photo, Pick } from '../../shared/domain.ts';
import { InvalidInput } from '../../shared/errors/errors.ts';
import { photoNamed } from '../../shared/photo-names.ts';
import { inSteps } from '../../shared/progress.ts';
import { Spending, totalDollars } from '../../shared/spending.ts';
import { type OpenShoot, readPicks } from '../../shared/store.ts';
import { verdicts } from '../../shared/verdicts.ts';
import { Vision } from '../../shared/vision.ts';
import { described } from './describe.ts';
import { type EditOptions, editOf, editPhoto } from './edit-photo.ts';

/** More photos than image requests at once, so reviews don't hold those up. */
const concurrency = 5;

type Job = {
  readonly pick: Pick;
  readonly photo: Photo;
  /** Whether the model has said what this very photo shows. */
  readonly isDescribed: boolean;
};

/**
 * The photos to edit: the picked ones, or those named, which needn't be
 * picked as long as they were judged.
 */
const jobs = Effect.fn('jobs')(function* (
  open: OpenShoot,
  names: ReadonlyArray<string>,
) {
  const withPhoto = (pick: Pick): ReadonlyArray<Job> => {
    const photo = open.photos.get(pick.photo);
    return photo === undefined ? [] : [{ pick, photo, isDescribed: true }];
  };
  if (names.length === 0) {
    const { picks } = yield* readPicks(open.files, open.shoot.name);
    return picks.flatMap(withPhoto);
  }
  const { model } = yield* Vision;
  const judged = yield* verdicts(open, model);
  return yield* Effect.forEach(names, (name) =>
    Effect.gen(function* () {
      const photo = yield* photoNamed(open, name);
      const verdict = judged.find(({ photos }) => photos.includes(photo.id));
      if (verdict === undefined) {
        return yield* new InvalidInput({
          message: `${model} has not judged ${name}. Run \`keepsake cull ${open.shoot.name}\` first.`,
        });
      }
      const { moment, subject, best, further } = verdict;
      const own = further.find((one) => one.photo === photo.id);
      const { score, description } = own ?? verdict;
      return {
        photo,
        pick: { photo: photo.id, moment, score, subject, description },
        isDescribed: own !== undefined || best[0] === photo.id,
      };
    }),
  );
});

type Outcome =
  | { readonly kind: 'done'; readonly record: EditRecord }
  | { readonly kind: 'overBudget'; readonly photo: string }
  | {
      readonly kind: 'failed';
      readonly photo: string;
      readonly reason: string;
    };

/** About what one photo costs, set aside while it is being edited. */
const dollarsForOne = 0.75;

/**
 * Keeps what is spent within a budget, counting the photos that are being
 * edited right now at what they usually cost.
 */
const makeBudget = Effect.fn('makeBudget')(function* (dollars: number) {
  const spending = yield* Spending;
  const before = totalDollars(yield* spending.soFar);
  const running = yield* Ref.make(0);
  const isLeft = Effect.gen(function* () {
    const spent = totalDollars(yield* spending.soFar) - before;
    return spent + (yield* Ref.get(running)) * dollarsForOne < dollars;
  });
  return <A, E, R>(work: Effect.Effect<A, E, R>) =>
    Effect.gen(function* () {
      if (!(yield* isLeft)) {
        return Option.none<A>();
      }
      yield* Ref.update(running, (count) => count + 1);
      const result = yield* work.pipe(
        Effect.ensuring(Ref.update(running, (count) => count - 1)),
      );
      return Option.some(result);
    });
});

/** Edits the picked photos until the budget is used up. */
export const edit = Effect.fn('edit')(function* (
  open: OpenShoot,
  names: ReadonlyArray<string>,
  options: EditOptions & { readonly budget: number },
) {
  const todo = yield* jobs(open, names);
  const withinBudget = yield* makeBudget(options.budget);
  const outcomes = yield* inSteps(
    'edit',
    todo,
    concurrency,
    ({ pick, photo, isDescribed }) =>
      Effect.gen(function* () {
        const before = yield* editOf(open, photo.id);
        if (Option.isSome(before) && !options.again) {
          return { kind: 'done', record: before.value } satisfies Outcome;
        }
        const record = yield* withinBudget(
          Effect.gen(function* () {
            const shown = isDescribed ? pick : yield* described(open, pick);
            return yield* editPhoto(open, shown, photo, options);
          }),
        );
        return Option.match(record, {
          onNone: (): Outcome => ({ kind: 'overBudget', photo: photo.id }),
          onSome: (made): Outcome => ({ kind: 'done', record: made }),
        });
      }).pipe(
        // One photo that can't be edited doesn't stop the others.
        Effect.catchTag(['ModelFailed', 'ToolFailed'], ({ message }) =>
          Effect.succeed<Outcome>({
            kind: 'failed',
            photo: photo.id,
            reason: message,
          }),
        ),
      ),
  );
  const records = outcomes.flatMap((outcome) =>
    outcome.kind === 'done' ? [outcome.record] : [],
  );
  return {
    shoot: open.shoot.name,
    edited: records.filter(({ version }) => version === 'ai').length,
    keptFromCamera: records
      .filter(({ version }) => version === 'camera')
      .map(({ photo, review }) => ({ photo, reason: review })),
    overBudget: outcomes.flatMap((outcome) =>
      outcome.kind === 'overBudget' ? [outcome.photo] : [],
    ),
    failed: outcomes.flatMap((outcome) =>
      outcome.kind === 'failed'
        ? [{ photo: outcome.photo, reason: outcome.reason }]
        : [],
    ),
    files: records.map(({ photo }) => open.files.edit(photo).final),
  };
});
