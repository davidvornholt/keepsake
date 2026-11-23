import { Effect, Option } from 'effect';
import { Argument, Flag } from 'effect/cli';
import { InvalidInput } from '../shared/errors/errors.ts';
import { defaultVisionModel } from '../shared/models.ts';

// Like `Flag.optional`, but a repeated flag is an error: the parser would keep
// the first value, so `--name a --name b` would silently mean the first one.
export const once = <A>(self: Flag.Flag<A>): Flag.Flag<Option.Option<A>> =>
  self.pipe(
    Flag.atMost(1),
    Flag.map((values) => Option.fromUndefinedOr(values[0])),
  );

export const optionalString = (name: string, description: string) =>
  once(Flag.String(name).pipe(Flag.withDescription(description)));

/** A switch that is off unless given. */
export const flag = (name: string, description: string) =>
  once(Flag.Boolean(name).pipe(Flag.withDescription(description))).pipe(
    Flag.map(Option.getOrElse(() => false)),
  );

export const optionalInt = (name: string, description: string) =>
  once(Flag.Int(name).pipe(Flag.withDescription(description)));

export const optionalNumber = (name: string, description: string) =>
  once(Flag.Finite(name).pipe(Flag.withDescription(description)));

export const fail = (message: string) =>
  Effect.fail(new InvalidInput({ message }));

/** A number within bounds, or the default when the flag is absent. */
export const bounded = (
  name: string,
  value: Option.Option<number>,
  range: {
    readonly fallback: number;
    readonly min: number;
    readonly max: number;
  },
) => {
  const chosen = Option.getOrElse(value, () => range.fallback);
  return chosen >= range.min && chosen <= range.max
    ? Effect.succeed(chosen)
    : fail(`--${name} must be between ${range.min} and ${range.max}.`);
};

export const shootArgument = Argument.String('shoot').pipe(
  Argument.withDescription('The name of the shoot'),
);

export const visionModel = optionalString(
  'model',
  `The vision model, with its provider (default ${defaultVisionModel})`,
).pipe(Flag.map(Option.getOrElse(() => defaultVisionModel)));
