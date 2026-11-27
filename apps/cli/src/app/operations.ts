import { Effect, Option, Schema } from 'effect';
import { InvalidInput } from '../shared/errors/errors.ts';
import { readJson, type ShootFiles, writeJson } from '../shared/store.ts';

// A command given an operation id notes what it came to under that id
// before it says so, and a command given the same id again says the same
// without doing it again. The page's server gives one to each edit it
// starts, so an edit that ended while the server stopped isn't paid twice.

const Result = Schema.Record(Schema.String, Schema.Unknown);

const operationPattern = /^[a-z0-9]{1,32}$/u;

/** The operation id, as one that names a file of the shoot's and no other. */
export const operationOf = (id: string) =>
  operationPattern.test(id)
    ? Effect.succeed(id)
    : Effect.fail(
        new InvalidInput({
          message: `An operation id has up to 32 lowercase letters and digits, unlike ${JSON.stringify(id)}.`,
        }),
      );

/** What the command given this id came to, if it ended. */
export const resultOf = (files: ShootFiles, id: string) =>
  Effect.map(readJson(Result, files.operation(id)), Option.getOrNull);

/** Notes what the command given this id came to. */
export const saveResult = (
  files: ShootFiles,
  id: string,
  result: Readonly<Record<string, unknown>>,
) => writeJson(Result, files.operation(id), result);
