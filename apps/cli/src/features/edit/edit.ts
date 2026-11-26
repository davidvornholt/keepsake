import { Effect, Option, Ref } from 'effect';
import { during } from '../../shared/activity.ts';
import { InvalidInput } from '../../shared/errors/errors.ts';
import { photoNamed } from '../../shared/photo-names.ts';
import { isPriced } from '../../shared/prices.ts';
import { inSteps } from '../../shared/progress.ts';
import { ReviewVision } from '../../shared/review-vision.ts';
import { dollarsForOneEdit, Spending } from '../../shared/spending.ts';
import { readRemoved } from '../../shared/standing.ts';
import { type OpenShoot, readPicks } from '../../shared/store.ts';
import { verdicts } from '../../shared/verdicts.ts';
import { Vision } from '../../shared/vision.ts';
import { anewFor, doneIn, doneWithAnew } from './anew.ts';
import {
  type Edited,
  type EditOptions,
  editOf,
  editPhoto,
  type ToEdit,
} from './edit-photo.ts';
import { ImageModel } from './image-model.ts';

/** More photos than image requests at once, so reviews don't hold those up. */
const concurrency = 5;

/**
 * The photos to edit: those that were picked and not taken out since, or those
 * named, which needn't be picked as long as they were judged.
 */
const jobs = Effect.fn('jobs')(function* (
  open: OpenShoot,
  names: ReadonlyArray<string>,
) {
  if (names.length === 0) {
    const list = yield* readPicks(open.files, open.shoot.name);
    const removed = yield* readRemoved(open);
    const isOut = new Set(removed.map(({ photo }) => photo));
    return list.picks.flatMap((pick): ReadonlyArray<ToEdit> => {
      const photo = open.photos.get(pick.photo);
      return photo === undefined || isOut.has(photo.id)
        ? []
        : [{ pick, photo }];
    });
  }
  const { model } = yield* Vision;
  const judged = yield* verdicts(open, model);
  const named = yield* Effect.forEach(names, (name) => photoNamed(open, name));
  // A photo named twice, such as by its path and by its name, is edited once.
  const distinct = [
    ...new Map(named.map((photo) => [photo.id, photo])).values(),
  ];
  return yield* Effect.forEach(distinct, (photo) =>
    Effect.gen(function* () {
      const verdict = judged.find(({ photos }) => photos.includes(photo.id));
      if (verdict === undefined) {
        return yield* new InvalidInput({
          message: `${model} has not judged ${photo.id}. Run \`keepsake cull ${open.shoot.name}\` first.`,
        });
      }
      const { moment, subject, further } = verdict;
      const own = further.find((one) => one.photo === photo.id);
      const { score, description } = own ?? verdict;
      return {
        photo,
        pick: { photo: photo.id, moment, score, subject, description },
      } satisfies ToEdit;
    }),
  );
});

type Outcome =
  | ({ readonly kind: 'done' } & Edited)
  | { readonly kind: 'overBudget'; readonly photo: string }
  | {
      readonly kind: 'failed';
      readonly photo: string;
      readonly reason: string;
    };

/**
 * Starts photos while the budget lasts, counting those that are being edited
 * right now at what they usually cost. Each paid request is checked again.
 */
const makeBudget = Effect.fn('makeBudget')(function* () {
  const spending = yield* Spending;
  const running = yield* Ref.make(0);
  const isLeft = Effect.gen(function* () {
    const left = yield* spending.left;
    return (yield* Ref.get(running)) * dollarsForOneEdit < left;
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

/** Stops before anything is sent to a model whose cost a budget can't know. */
export const checkPrices = Effect.fn('checkPrices')(function* (
  imageModel: string,
) {
  const models = [
    imageModel,
    (yield* Vision).model,
    (yield* ReviewVision).model,
  ];
  const unknown = models.find((model) => !isPriced(model));
  if (unknown !== undefined) {
    return yield* new InvalidInput({
      message: `keepsake doesn't know what ${unknown} costs, so it can't keep to the budget with it. Use a subscription's model or one whose price is in shared/prices.ts.`,
    });
  }
});

/** Edits the picked photos until the budget is used up. */
export const edit = Effect.fn('edit')(function* (
  open: OpenShoot,
  names: ReadonlyArray<string>,
  options: EditOptions & { readonly budget: number },
) {
  yield* checkPrices((yield* ImageModel).model);
  const todo = yield* jobs(open, names);
  const { again, wish, areas } = options;
  const photos = todo.map(({ photo }) => photo.id);
  const imageModel = (yield* ImageModel).model;
  const reviewModel = (yield* ReviewVision).model;
  const anew =
    again || wish !== null
      ? yield* anewFor(open, {
          imageModel,
          reviewModel,
          again,
          wish,
          areas,
          photos,
        })
      : null;
  const spending = yield* Spending;
  const withinBudget = yield* makeBudget();
  const outcomes = yield* inSteps('edit', todo, concurrency, (toEdit) =>
    Effect.gen(function* () {
      const before = yield* editOf(open, toEdit.photo.id);
      // Done before, or by this command before it stopped.
      const notDone =
        anew === null
          ? Option.some([])
          : yield* doneIn(open.files.edit(toEdit.photo.id), anew);
      if (Option.isSome(before) && Option.isSome(notDone)) {
        return {
          kind: 'done',
          record: before.value,
          notDone: notDone.value,
        } satisfies Outcome;
      }
      const edited = yield* withinBudget(
        editPhoto(open, toEdit, options, anew).pipe(during(toEdit.photo.id)),
      );
      return Option.match(edited, {
        onNone: (): Outcome => ({
          kind: 'overBudget',
          photo: toEdit.photo.id,
        }),
        onSome: (made): Outcome => ({ kind: 'done', ...made }),
      });
    }).pipe(
      // One photo that can't be edited doesn't stop the others.
      Effect.catchTag(['ModelFailed', 'ToolFailed'], ({ message }) =>
        Effect.succeed<Outcome>({
          kind: 'failed',
          photo: toEdit.photo.id,
          reason: message,
        }),
      ),
      // What is left of the budget doesn't cover its next request.
      Effect.catchTag('OverBudget', () =>
        Effect.succeed<Outcome>({ kind: 'overBudget', photo: toEdit.photo.id }),
      ),
    ),
  ).pipe(spending.within(options.budget));
  const done = outcomes.flatMap((outcome) =>
    outcome.kind === 'done' ? [outcome] : [],
  );
  if (anew !== null && done.length === outcomes.length) {
    yield* doneWithAnew(open);
  }
  const records = done.map(({ record }) => record);
  return {
    shoot: open.shoot.name,
    edited: records.filter(({ version }) => version === 'ai').length,
    keptFromCamera: records
      .filter(({ version }) => version === 'camera')
      .map(({ photo, review }) => ({ photo, reason: review })),
    notDone: done.flatMap(({ record: { photo }, notDone }) =>
      notDone.map((what) => ({ photo, what })),
    ),
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
