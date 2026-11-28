import {
  Context,
  Deferred,
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
import { costOf, mostCostOf, type RequestSize, type Usage } from './prices.ts';
import { makeSignal, type Signal } from './signal.ts';
import { readJson, writeJson } from './store.ts';

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

const nothing: ModelSpending = {
  calls: 0,
  inputTokens: 0,
  outputTokens: 0,
  dollars: 0,
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

/**
 * What this command spent, what the requests that run may still cost, and
 * how many of them hold part of a budget.
 */
type State = {
  readonly total: SpendingRecord;
  readonly held: number;
  readonly holding: number;
};

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

/**
 * `holding` counts a request until it ends, also once it was answered and
 * counted at its most, as what it settles at may still be less.
 */
const hold = (
  state: Ref.Ref<State>,
  changes: Signal,
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
    while (true) {
      const changed = yield* changes.next;
      const short = yield* Ref.modify(
        state,
        (now): [{ left: number; isAlone: boolean } | null, State] =>
          most <= leftOf(now, budget)
            ? [
                null,
                { ...now, held: now.held + most, holding: now.holding + 1 },
              ]
            : [{ left: leftOf(now, budget), isAlone: now.holding === 0 }, now],
      );
      if (short === null) {
        return most;
      }
      if (short.isAlone) {
        return yield* new OverBudget({
          message: `A request to ${model} can cost up to ${inDollars(most)}, and ${inDollars(short.left)} is left of the budget.`,
        });
      }
      // Only the wait, as `paying` holds within an acquisition.
      yield* Effect.interruptible(Deferred.await(changed));
    }
  });

/** A paid request, while it runs. */
export type Paid = {
  /** The most it can cost, in dollars. */
  readonly most: number;
  /**
   * Counts it at the most, now that it may have been paid for: its answer
   * is coming, or it ended without one. So it stays counted when the answer
   * is lost.
   */
  readonly answered: Effect.Effect<void, StoreFailed>;
  /**
   * Counts what it used, or the most when its answer doesn't say, in place
   * of what `answered` counted.
   */
  readonly settle: (
    used: Usage | undefined,
  ) => Effect.Effect<void, StoreFailed>;
};

/** Changes what was spent and what is held in one step, and writes it. */
type Ledger = {
  readonly charge: (
    model: string,
    entry: ModelSpending,
    release: number,
  ) => Effect.Effect<void, StoreFailed>;
  /** Ends a request that held this much, freeing it unless it was counted. */
  readonly end: (held: number, isCounted: boolean) => Effect.Effect<void>;
};

/**
 * What a request adds when it settles: all it cost, or what it cost beyond
 * its most once that was counted when its answer began.
 */
const settlementOf = (
  model: string,
  used: Usage | undefined,
  {
    most,
    wasAnswered,
  }: { readonly most: number; readonly wasAnswered: boolean },
): ModelSpending => {
  const dollars = used === undefined ? most : costOf(model, used);
  return {
    calls: wasAnswered ? 0 : 1,
    inputTokens: used?.inputTokens ?? 0,
    outputTokens: used?.outputTokens ?? 0,
    dollars: wasAnswered ? dollars - most : dollars,
  };
};

const paymentFor = (
  model: string,
  { most, held }: { readonly most: number; readonly held: number },
  ledger: Ledger,
) => {
  let stage: 'held' | 'answered' | 'settled' = 'held';
  const paid: Paid = {
    most,
    answered: Effect.suspend(() => {
      if (stage !== 'held') {
        return Effect.void;
      }
      stage = 'answered';
      const entry = { ...nothing, calls: 1, dollars: most };
      return ledger.charge(model, entry, held);
    }).pipe(Effect.uninterruptible),
    settle: (used) =>
      Effect.suspend(() => {
        if (stage === 'settled') {
          return Effect.void;
        }
        const wasAnswered = stage === 'answered';
        stage = 'settled';
        const entry = settlementOf(model, used, { most, wasAnswered });
        return ledger.charge(model, entry, wasAnswered ? 0 : held);
      }).pipe(Effect.uninterruptible),
  };
  // One that was never counted cost nothing, so what it held is free again.
  const release = Effect.suspend(() => ledger.end(held, stage !== 'held'));
  return { paid, release };
};

/** Adds up what one command spends on models. */
export class Spending extends Context.Service<
  Spending,
  {
    /**
     * Sends a paid request only when what is left of the budget covers the
     * most it can cost, waiting while other requests hold part of it, and
     * holds that much until the request counts what it cost with `paid`.
     */
    readonly paying: <A, E, R>(
      model: string,
      size: RequestSize,
      request: (paid: Paid) => Effect.Effect<A, E, R>,
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
      const state = yield* Ref.make<State>({ total: {}, held: 0, holding: 0 });
      const changes = yield* makeSignal;
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

      const ledger: Ledger = {
        charge: (model, entry, release) =>
          Ref.update(state, (now) => ({
            ...now,
            total: merge(now.total, { [model]: entry }),
            held: now.held - release,
          })).pipe(
            Effect.andThen(changes.changed),
            Effect.andThen(
              Ref.update(unsaved, (now) => merge(now, { [model]: entry })),
            ),
            Effect.andThen(flush),
          ),
        end: (held, isCounted) =>
          held === 0
            ? Effect.void
            : Ref.update(state, (now) => ({
                ...now,
                held: isCounted ? now.held : now.held - held,
                holding: now.holding - 1,
              })).pipe(Effect.andThen(changes.changed)),
      };

      return Spending.of({
        paying: (model, size, request) =>
          Effect.gen(function* () {
            const budget = yield* Ref.get(limit);
            const most = mostCostOf(model, size);
            if (most === undefined && Option.isSome(budget)) {
              return yield* new OverBudget({
                message: `keepsake doesn't know what ${model} costs, so it can't keep to a budget with it.`,
              });
            }
            const holding =
              Option.isNone(budget) || most === undefined || most === 0
                ? Effect.succeed(0)
                : hold(state, changes, { model, most, budget });
            return yield* Effect.acquireUseRelease(
              Effect.map(holding, (held) =>
                paymentFor(model, { most: most ?? 0, held }, ledger),
              ),
              ({ paid }) => request(paid),
              ({ release }) => release,
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
