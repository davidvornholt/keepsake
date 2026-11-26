import { isSubscription } from './subscriptions/subscriptions.ts';

/** Dollars for a million tokens. */
type Price = {
  readonly input: number;
  readonly output: number;
  readonly most: {
    /** Tokens a picture takes at most, at the detail keepsake asks for. */
    readonly picture: number;
    /**
     * Tokens an answer gives at most. A vision model is sent this as its
     * limit; for an image model it is what one version of the largest size
     * keepsake asks for uses, which its API has no limit for.
     */
    readonly output: number;
  };
};

const million = 1_000_000;

// List prices in US dollars for a million tokens, by the model's name without
// its provider. A model that isn't here counts as free, so its tokens are
// shown instead, and so does every model of a subscription. Under a budget,
// only a subscription's model may be one that isn't here.
const prices: ReadonlyMap<string, Price> = new Map([
  // With `high` detail a picture takes at most 1445 tokens by tiles, or
  // 1536 patches times up to 2.46 for models that count patches.
  [
    'gpt-6-astra',
    { input: 10, output: 50, most: { picture: 6000, output: 6000 } },
  ],
  // Image tokens; the few text tokens of the prompt cost less.
  [
    'gpt-image-2.5-sunburst',
    { input: 8, output: 30, most: { picture: 6000, output: 10_000 } },
  ],
  [
    'gpt-image-2.5-flare',
    { input: 8, output: 30, most: { picture: 6000, output: 10_000 } },
  ],
]);

/** What a request sends, which is known before it is sent. */
export type RequestSize = {
  /** Bytes of text, which no token is shorter than. */
  readonly text: number;
  readonly pictures: number;
  /** How many versions an image model makes, or 1. */
  readonly versions: number;
};

/** Tokens for the messages' frame and the shape of the answer. */
const framing = 4000;

const encoder = new TextEncoder();

/** The bytes of a text, which bound its tokens. */
export const bytesOf = (text: string) => encoder.encode(text).length;

/** What a request used, as its answer says. */
export type Usage = {
  readonly inputTokens: number;
  readonly outputTokens: number;
};

const isFree = (model: string) =>
  isSubscription(model.slice(0, model.indexOf('/')));

const priceOf = (model: string): Price | undefined =>
  isFree(model) ? undefined : prices.get(model.slice(model.indexOf('/') + 1));

const dollarsFor = (price: Price, { inputTokens, outputTokens }: Usage) =>
  (inputTokens * price.input + outputTokens * price.output) / million;

/**
 * The most a request can cost: 0 on a subscription, and undefined when
 * keepsake doesn't know the price.
 */
export const mostCostOf = (
  model: string,
  { text, pictures, versions }: RequestSize,
): number | undefined => {
  if (isFree(model)) {
    return 0;
  }
  const price = priceOf(model);
  return price === undefined
    ? undefined
    : dollarsFor(price, {
        inputTokens: framing + text + pictures * price.most.picture,
        outputTokens: price.most.output * versions,
      });
};

/** What a request cost, as far as keepsake knows the price. */
export const costOf = (model: string, used: Usage): number => {
  const price = priceOf(model);
  return price === undefined ? 0 : dollarsFor(price, used);
};

/** The output tokens to allow a paid vision model, if it has a price. */
export const outputLimitOf = (model: string): number | undefined =>
  priceOf(model)?.most.output;

/** Whether keepsake knows what a model costs, or it costs nothing. */
export const isPriced = (model: string) =>
  mostCostOf(model, { text: 0, pictures: 0, versions: 1 }) !== undefined;
