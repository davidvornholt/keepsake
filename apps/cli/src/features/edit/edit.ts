import {
  Deferred,
  Effect,
  type FileSystem,
  Option,
  type Path,
  Ref,
} from 'effect';
import { during } from '../../shared/activity.ts';
import type { EditRecord } from '../../shared/domain.ts';
import { InvalidInput, type StoreFailed } from '../../shared/errors/errors.ts';
import { photoNamed } from '../../shared/photo-names.ts';
import { isPriced } from '../../shared/prices.ts';
import { inSteps } from '../../shared/progress.ts';
import { ReviewVision } from '../../shared/review-vision.ts';
import { dollarsForOneEdit, Spending } from '../../shared/spending.ts';
import { readRemoved } from '../../shared/standing.ts';
import { type OpenShoot, readPicks } from '../../shared/store.ts';
import { pickOf, verdicts } from '../../shared/verdicts.ts';
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
      return { photo, pick: pickOf(verdict, photo.id) } satisfies ToEdit;
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

/** The photos being edited, and what tells when the next of them ends. */
type Running = {
  readonly count: number;
  readonly ended: Deferred.Deferred<void>;
};

/**
 * Starts photos while the budget lasts, counting those that are being edited
 * right now at what they usually cost. A photo that doesn't fit beside them
 * waits until one is done, as they often cost less, and is stopped only when
 * none runs. Each paid request is checked again.
 */
export const makeBudget = Effect.fn('makeBudget')(function* () {
  const spending = yield* Spending;
  // A photo that ends gives the next their own `ended`, in the same step.
  const running = yield* Ref.make<Running>({
    count: 0,
    ended: yield* Deferred.make<void>(),
  });
  const start: Effect.Effect<boolean> = Effect.gen(function* () {
    const { ended } = yield* Ref.get(running);
    const left = yield* spending.left;
    const answer = yield* Ref.modify(
      running,
      (now): ['start' | 'stop' | 'wait' | 'again', Running] => {
        if (now.ended !== ended) {
          // A photo ended since `left` was read, which may have left more.
          return ['again', now];
        }
        if (now.count * dollarsForOneEdit < left) {
          return ['start', { ...now, count: now.count + 1 }];
        }
        return [now.count === 0 ? 'stop' : 'wait', now];
      },
    );
    if (answer === 'wait') {
      // Only the wait, as a photo starts within an acquisition.
      yield* Effect.interruptible(Deferred.await(ended));
    }
    return answer === 'wait' || answer === 'again'
      ? yield* start
      : answer === 'start';
  });
  const end = Effect.flatMap(Deferred.make<void>(), (fresh) =>
    Effect.flatMap(
      Ref.modify(running, (now): [Deferred.Deferred<void>, Running] => [
        now.ended,
        { count: now.count - 1, ended: fresh },
      ]),
      (ended) => Deferred.succeed(ended, undefined),
    ),
  );
  return <A, E, R>(work: Effect.Effect<A, E, R>) =>
    Effect.acquireUseRelease(
      start,
      (isStarted) =>
        isStarted
          ? Effect.map(work, Option.some)
          : Effect.succeed(Option.none<A>()),
      (isStarted) => (isStarted ? end : Effect.void),
    );
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

/** What an edit came to, as `keepsake edit` prints it. */
const summaryOf = (open: OpenShoot, outcomes: ReadonlyArray<Outcome>) => {
  const done = outcomes.flatMap((outcome) =>
    outcome.kind === 'done' ? [outcome] : [],
  );
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
};
export type EditSummary = ReturnType<typeof summaryOf>;

/**
 * Notes what an edit came to before it forgets how far it got, so one or the
 * other is always known.
 */
export type Keep = (
  summary: EditSummary,
  /** How each photo that is done was edited. */
  records: ReadonlyArray<EditRecord>,
) => Effect.Effect<
  void,
  StoreFailed,
  FileSystem.FileSystem | Path.Path | Spending
>;

/** Edits the picked photos until the budget is used up. */
export const edit = Effect.fn('edit')(function* (
  open: OpenShoot,
  names: ReadonlyArray<string>,
  options: EditOptions & { readonly budget: number },
  keep: Keep = () => Effect.void,
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
  const summary = summaryOf(open, outcomes);
  yield* keep(
    summary,
    outcomes.flatMap((outcome) =>
      outcome.kind === 'done' ? [outcome.record] : [],
    ),
  );
  if (anew !== null && outcomes.every(({ kind }) => kind === 'done')) {
    yield* doneWithAnew(open);
  }
  return summary;
});
