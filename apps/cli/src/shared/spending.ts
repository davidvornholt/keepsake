import {
  Context,
  Effect,
  type FileSystem,
  Layer,
  Option,
  type Path,
  Ref,
  Schema,
  Semaphore,
} from 'effect';
import { OverBudget, type StoreFailed } from './errors/errors.ts';
import { readJson, writeJson } from './store.ts';
import { isSubscription } from './subscriptions/subscriptions.ts';

type Tokens = { readonly input: number; readonly output: number };

/**
 * Dollars for a million tokens, and the most tokens one request is expected
 * to take and give: for an image model, for each version it makes. A budget
 * counts a request at that most before it is sent, and so does an answer that
 * doesn't say what it used. Both are above what requests used so far.
 */
type Price = Tokens & { readonly most: Tokens };

const million = 1_000_000;

// List prices in US dollars for a million tokens, by the model's name without
// its provider. A model that isn't here counts as free, so its tokens are
// shown instead, and so does every model of a subscription. Under a budget,
// only a subscription's model may be one that isn't here.
const prices: ReadonlyMap<string, Price> = new Map([
  [
    'gpt-6-astra',
    { input: 10, output: 50, most: { input: 30_000, output: 3000 } },
  ],
  // Image tokens; the few text tokens of the prompt cost less.
  [
    'gpt-image-2.5-sunburst',
    { input: 8, output: 30, most: { input: 2000, output: 10_000 } },
  ],
  [
    'gpt-image-2.5-flare',
    { input: 8, output: 30, most: { input: 2000, output: 10_000 } },
  ],
]);

/** About what editing or changing one photo costs. */
export const dollarsForOneEdit = 0.75;

export const ModelSpending = Schema.Struct({
  calls: Schema.Int,
  inputTokens: Schema.Int,
  outputTokens: Schema.Int,
  dollars: Schema.Finite,
});
export type ModelSpending = typeof ModelSpending.Type;

/** What each model was used for so far, by its name. */
export const SpendingRecord = Schema.Record(Schema.String, ModelSpending);
export type SpendingRecord = typeof SpendingRecord.Type;

/** What a request used, as its answer says. */
export type Usage = {
  readonly inputTokens: number;
  readonly outputTokens: number;
};

const nothing: ModelSpending = {
  calls: 0,
  inputTokens: 0,
  outputTokens: 0,
  dollars: 0,
};

const isFree = (model: string) =>
  isSubscription(model.slice(0, model.indexOf('/')));

const priceOf = (model: string): Price | undefined =>
  isFree(model) ? undefined : prices.get(model.slice(model.indexOf('/') + 1));

const dollarsFor = (price: Price, { input, output }: Tokens) =>
  (input * price.input + output * price.output) / million;

/**
 * The most a request can cost, for so many versions of an image model: 0 on
 * a subscription, and undefined when keepsake doesn't know the price.
 */
export const mostCostOf = (model: string, units = 1): number | undefined => {
  if (isFree(model)) {
    return 0;
  }
  const price = priceOf(model);
  return price === undefined
    ? undefined
    : dollarsFor(price, {
        input: price.most.input * units,
        output: price.most.output * units,
      });
};

/** What a request cost, or the most it can have when its answer doesn't say. */
const costOf = (model: string, used: Usage | undefined, units: number) => {
  const price = priceOf(model);
  if (price === undefined) {
    return 0;
  }
  return used === undefined
    ? (mostCostOf(model, units) ?? 0)
    : dollarsFor(price, { input: used.inputTokens, output: used.outputTokens });
};

const add = (left: ModelSpending, right: ModelSpending): ModelSpending => ({
  calls: left.calls + right.calls,
  inputTokens: left.inputTokens + right.inputTokens,
  outputTokens: left.outputTokens + right.outputTokens,
  dollars: left.dollars + right.dollars,
});

export const totalDollars = (record: SpendingRecord): number =>
  Object.values(record).reduce((sum, { dollars }) => sum + dollars, 0);

const merge = (left: SpendingRecord, right: SpendingRecord): SpendingRecord => {
  const merged: Record<string, ModelSpending> = { ...left };
  for (const [model, amount] of Object.entries(right)) {
    merged[model] = add(merged[model] ?? nothing, amount);
  }
  return merged;
};

/** What this command spent, and what the requests that run may still cost. */
type State = { readonly total: SpendingRecord; readonly held: number };

/** A budget, and what was spent before it began. */
type Limit = { readonly dollars: number; readonly from: number };

const leftOf = ({ total, held }: State, limit: Option.Option<Limit>) =>
  Option.match(limit, {
    onNone: () => Number.POSITIVE_INFINITY,
    onSome: ({ dollars, from }) =>
      dollars - (totalDollars(total) - from) - held,
  });

const inDollars = (dollars: number) => `$${Math.max(0, dollars).toFixed(2)}`;

/** Adds what was spent to what a shoot's spending file says. */
const save = (path: string, spent: SpendingRecord) =>
  Effect.gen(function* () {
    const before = yield* readJson(SpendingRecord, path);
    yield* writeJson(
      SpendingRecord,
      path,
      merge(
        Option.getOrElse(before, () => ({})),
        spent,
      ),
    );
  });

/** Holds the most a request can cost, if what is left of the budget covers it. */
const hold = (
  state: Ref.Ref<State>,
  {
    model,
    most,
    budget,
  }: {
    readonly model: string;
    readonly most: number;
    readonly budget: Option.Option<Limit>;
  },
) =>
  Effect.gen(function* () {
    const short = yield* Ref.modify(state, (now) =>
      most <= leftOf(now, budget)
        ? [null, { ...now, held: now.held + most }]
        : [leftOf(now, budget), now],
    );
    if (short !== null) {
      return yield* new OverBudget({
        message: `A request to ${model} can cost up to ${inDollars(most)}, and ${inDollars(short)} is left of the budget.`,
      });
    }
    return most;
  });

/** Adds up what one command spends on models. */
export class Spending extends Context.Service<
  Spending,
  {
    /**
     * Counts what a request cost, at the most it can have cost when `used`
     * is missing, and adds it to the shoot's spending right away.
     */
    readonly add: (
      model: string,
      used: Usage | undefined,
      units?: number,
    ) => Effect.Effect<void, StoreFailed>;
    /**
     * Sends a paid request only when what is left of the budget covers the
     * most it can cost, for so many versions, and holds that much while it
     * runs. `request` should `add` what it cost.
     */
    readonly paying: <A, E, R>(
      model: string,
      units: number,
      request: Effect.Effect<A, E, R>,
    ) => Effect.Effect<A, E | OverBudget, R>;
    /** Keeps what the paid requests of `work` cost within a budget. */
    readonly within: (
      dollars: number,
    ) => <A, E, R>(work: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>;
    /** What is left of the budget, less what running requests hold. */
    readonly left: Effect.Effect<number>;
    /** Everything this command spent. */
    readonly soFar: Effect.Effect<SpendingRecord>;
    /** Adds what `work` spends to a shoot's spending file as it is spent. */
    readonly savingTo: (
      path: string,
    ) => <A, E, R>(
      work: Effect.Effect<A, E, R>,
    ) => Effect.Effect<A, E | StoreFailed, R>;
  }
>()('@keepsake/cli/shared/Spending') {
  static readonly layer = Layer.effect(
    Spending,
    Effect.gen(function* () {
      const services = yield* Effect.context<
        FileSystem.FileSystem | Path.Path
      >();
      const state = yield* Ref.make<State>({ total: {}, held: 0 });
      const unsaved = yield* Ref.make<SpendingRecord>({});
      const target = yield* Ref.make(Option.none<string>());
      const limit = yield* Ref.make(Option.none<Limit>());
      const writing = yield* Semaphore.make(1);

      // What can't be written stays to be written with the next request.
      const flush = Effect.gen(function* () {
        const path = yield* Ref.get(target);
        if (Option.isNone(path)) {
          return;
        }
        const spent = yield* Ref.getAndSet(unsaved, {});
        if (Object.keys(spent).length === 0) {
          return;
        }
        yield* save(path.value, spent).pipe(
          Effect.provideContext(services),
          Effect.tapError(() =>
            Ref.update(unsaved, (later) => merge(spent, later)),
          ),
        );
      }).pipe(writing.withPermits(1), Effect.uninterruptible);

      return Spending.of({
        add: (model, used, units = 1) => {
          const call: SpendingRecord = {
            [model]: {
              calls: 1,
              inputTokens: used?.inputTokens ?? 0,
              outputTokens: used?.outputTokens ?? 0,
              dollars: costOf(model, used, units),
            },
          };
          return Ref.update(state, (now) => ({
            ...now,
            total: merge(now.total, call),
          })).pipe(
            Effect.andThen(Ref.update(unsaved, (now) => merge(now, call))),
            Effect.andThen(flush),
            Effect.uninterruptible,
          );
        },
        paying: (model, units, request) =>
          Effect.gen(function* () {
            const budget = yield* Ref.get(limit);
            const most = mostCostOf(model, units);
            if (Option.isNone(budget) || most === 0) {
              return yield* request;
            }
            if (most === undefined) {
              return yield* new OverBudget({
                message: `keepsake doesn't know what ${model} costs, so it can't keep to a budget with it.`,
              });
            }
            return yield* Effect.acquireUseRelease(
              hold(state, { model, most, budget }),
              () => request,
              (held) =>
                Ref.update(state, (now) => ({ ...now, held: now.held - held })),
            );
          }),
        within: (dollars) => (work) =>
          Effect.acquireUseRelease(
            Effect.flatMap(Ref.get(state), ({ total }) =>
              Ref.set(
                limit,
                Option.some({ dollars, from: totalDollars(total) }),
              ),
            ),
            () => work,
            () => Ref.set(limit, Option.none()),
          ),
        left: Effect.flatMap(Ref.get(limit), (budget) =>
          Effect.map(Ref.get(state), (now) => leftOf(now, budget)),
        ),
        soFar: Effect.map(Ref.get(state), ({ total }) => total),
        savingTo: (path) => (work) =>
          Effect.acquireUseRelease(
            Ref.set(target, Option.some(path)),
            () => work,
            () => flush.pipe(Effect.ensuring(Ref.set(target, Option.none()))),
          ),
      });
    }),
  );
}

/** Whether keepsake knows what a model costs, or it costs nothing. */
export const isPriced = (model: string) => mostCostOf(model) !== undefined;
