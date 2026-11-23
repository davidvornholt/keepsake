import process from 'node:process';
import { Effect } from 'effect';
import { Spending, totalDollars } from '../shared/spending.ts';

// stdout carries a command's result as JSON; stderr carries errors and
// progress as JSON. Pretty-print for people at a terminal; keep piped output
// compact for agents.
export const writeJson = (stream: NodeJS.WriteStream, value: unknown): void => {
  stream.write(
    `${JSON.stringify(value, null, stream.isTTY === true ? 2 : undefined)}\n`,
  );
};

export const emit = (value: unknown): Effect.Effect<void> =>
  Effect.sync(() => writeJson(process.stdout, value));

const cents = 100;

/** Prints the result of a command that uses models, with what it cost. */
export const emitWithCost = (value: object) =>
  Effect.gen(function* () {
    const spending = yield* Spending;
    const spent = yield* spending.soFar;
    yield* emit({
      ...value,
      dollarsSpent: Math.round(totalDollars(spent) * cents) / cents,
      models: spent,
    });
  });

export const failureExitCode = 1;
export const usageExitCode = 2;

export type ReportedError = {
  readonly _tag: string;
  readonly message: string;
};

// Errors about the arguments themselves, as opposed to the models, the files
// or the connection.
const invalidInputTags = new Set(['InvalidInput', 'UsageError']);

export const report = (error: ReportedError): Effect.Effect<void> =>
  Effect.sync(() => {
    writeJson(process.stderr, {
      error: { tag: error._tag, message: error.message },
    });
    process.exitCode = invalidInputTags.has(error._tag)
      ? usageExitCode
      : failureExitCode;
  });
