import { Context, Effect, Layer, Option, Ref, Schema } from 'effect';
import { readJson, type ShootFiles, writeJson } from './store.ts';
import { isSubscription } from './subscriptions/subscriptions.ts';

/** Dollars for a million tokens. */
type Price = {
  readonly input: number;
  readonly output: number;
};

const million = 1_000_000;

// List prices in US dollars for a million tokens, by the model's name without
// its provider. A model that isn't here counts as free, so its tokens are
// shown instead, and so does every model of a subscription.
const prices: ReadonlyMap<string, Price> = new Map([
  ['gpt-6-astra', { input: 10, output: 50 }],
  // Image tokens; the few text tokens of the prompt cost less.
  ['gpt-image-2.5-sunburst', { input: 8, output: 30 }],
  ['gpt-image-2.5-flare', { input: 8, output: 30 }],
]);

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

const priceOf = (model: string): Price | undefined => {
  const slash = model.indexOf('/');
  return isSubscription(model.slice(0, slash))
    ? undefined
    : prices.get(model.slice(slash + 1));
};

export const costOf = (
  model: string,
  inputTokens: number,
  outputTokens: number,
): number => {
  const price = priceOf(model);
  return price === undefined
    ? 0
    : (inputTokens * price.input + outputTokens * price.output) / million;
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

/** Adds up what one command spends on models. */
export class Spending extends Context.Service<
  Spending,
  {
    readonly add: (
      model: string,
      inputTokens: number,
      outputTokens: number,
    ) => Effect.Effect<void>;
    /** Everything this command spent. */
    readonly soFar: Effect.Effect<SpendingRecord>;
    /** What was spent since this was last asked for. */
    readonly sinceSaved: Effect.Effect<SpendingRecord>;
  }
>()('@keepsake/cli/shared/Spending') {
  static readonly layer = Layer.effect(
    Spending,
    Effect.gen(function* () {
      const total = yield* Ref.make<SpendingRecord>({});
      const unsaved = yield* Ref.make<SpendingRecord>({});
      return Spending.of({
        add: (model, inputTokens, outputTokens) => {
          const call: SpendingRecord = {
            [model]: {
              calls: 1,
              inputTokens,
              outputTokens,
              dollars: costOf(model, inputTokens, outputTokens),
            },
          };
          return Effect.andThen(
            Ref.update(total, (current) => merge(current, call)),
            Ref.update(unsaved, (current) => merge(current, call)),
          );
        },
        soFar: Ref.get(total),
        sinceSaved: Ref.getAndSet(unsaved, {}),
      });
    }),
  );
}

/** Adds what was just spent to what the shoot has cost before. */
export const saveSpending = Effect.fn('saveSpending')(function* (
  files: ShootFiles,
) {
  const spending = yield* Spending;
  const spent = yield* spending.sinceSaved;
  if (Object.keys(spent).length > 0) {
    const before = yield* readJson(SpendingRecord, files.spending);
    yield* writeJson(
      SpendingRecord,
      files.spending,
      merge(
        Option.getOrElse(before, () => ({})),
        spent,
      ),
    );
  }
});
